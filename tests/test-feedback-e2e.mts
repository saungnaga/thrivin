/**
 * End-to-end tests for /api/feedback + /companion/nina/kritiksaran (A8).
 *
 *   npm run build && node --experimental-strip-types tests/test-feedback-e2e.mts
 *
 * Stack: real Next.js server -> real HTTP -> real PostgREST -> real Postgres.
 * Nothing here touches staging, production, or customer data.
 *
 * Evidence per requirement:
 *   happy        -> 201 + exactly one committed row (stored verbatim, as TEXT)
 *   XSS          -> markup stored as text, never echoed back in a response body
 *   retry        -> same request token twice       -> ONE row
 *   concurrency  -> 5 parallel posts, same token   -> ONE row
 *   validation   -> short/long/bad token/bad phone/malformed/oversized -> 400/413/415, zero rows
 *   abuse        -> per-IP and per-contact ceilings -> 429 + Retry-After
 *   DB down      -> 503 with no success marker, zero rows (NO FALSE THANK-YOU)
 *   unconfigured -> 503 (fail closed, no disk fallback)
 *   exposure     -> GET -> 405, anon key cannot read a planted row
 *   logs         -> no phone number, no request token in the server log
 *   a11y/SEO     -> served HTML has label/describedby/maxlength/type=submit + noindex
 *   client bundle-> the service-role key is not in any served JS chunk
 */
import crypto from "crypto";
import fs from "fs";
import net from "net";
import path from "path";
import { spawn, execFileSync } from "child_process";
import {
  SERVICE_KEY,
  ANON_KEY,
  POSTGREST_URL,
  startPostgrest,
  psqlSuper,
} from "./harness/stack.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const APP_PORT = Number(process.env.HARNESS_FEEDBACK_PORT || 3991);
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const LOG_FILE = "/tmp/thrivin-feedback-server.log";

const results: Array<[string, string]> = [];
function record(ok: boolean, name: string, detail = "") {
  results.push([ok ? "PASS" : "FAIL", detail ? `${name} — ${detail}` : name]);
}
function assertEq(actual: unknown, expected: unknown, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  record(ok, name, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertOk(cond: boolean, name: string, detail = "") {
  record(cond, name, cond ? "" : detail);
}

function token(seed: string): string {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

function truncateFeedback(): void {
  psqlSuper("TRUNCATE feedback RESTART IDENTITY CASCADE;");
}
function feedbackRows(): Array<{ id: string; message_text: string; phone: string | null; review_state: string; request_token: string }> {
  const out = psqlSuper(
    "SELECT id, message_text, COALESCE(phone,'~NULL~'), review_state, request_token FROM feedback ORDER BY created_at;",
    { csv: true }
  );
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [id, message_text, phone, review_state, request_token] = line.split("|");
    return { id, message_text, phone: phone === "~NULL~" ? null : phone, review_state, request_token };
  });
}

async function waitFor(url: string, timeoutMs = 40000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      // ANY answer means the server is listening — a 500 is "up and misconfigured",
      // which several sections below deliberately provoke.
      const res = await fetch(url);
      if (res.status < 600) return res;
      lastError = `status ${res.status}`;
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

interface Stack {
  stop: () => void;
}

/**
 * A server left behind by an earlier run keeps the port, and then every check
 * silently talks to THAT process (with its old build and old env) instead of the
 * one under test — a false green we hit for real while building this suite.
 * Refuse to start rather than measure the wrong thing.
 */
function portInUse(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** SIGKILL is asynchronous: the listen socket survives a few ms after the signal. */
async function waitForPortFree(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await portInUse(port))) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    execFileSync("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
  } catch {
    /* fuser absent or nothing to kill */
  }
}

async function startApp(env: Record<string, string | undefined>): Promise<Stack> {
  await waitForPortFree(APP_PORT);
  if (await portInUse(APP_PORT)) {
    throw new Error(
      `port ${APP_PORT} is still held by a stale server — it would serve these checks ` +
        `instead of the one under test. Kill it: fuser -k ${APP_PORT}/tcp`
    );
  }
  try {
    fs.truncateSync(LOG_FILE, 0);
  } catch {
    /* ignore */
  }
  const logFd = fs.openSync(LOG_FILE, "a");
  // detached: `./node_modules/.bin/next` is a wrapper — SIGKILL on the wrapper
  // leaves the real server alive holding the port.
  const child = spawn("./node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    cwd: REPO,
    detached: true,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      SUPABASE_URL: POSTGREST_URL,
      SUPABASE_SERVICE_KEY: SERVICE_KEY,
      ...env,
    },
    stdio: ["ignore", logFd, logFd],
  });
  await waitFor(`${BASE_URL}/api/feedback`);
  return {
    stop: () => {
      try {
        process.kill(-(child.pid as number), "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* gone */
        }
      }
    },
  };
}

function serverLog(): string {
  try {
    return fs.readFileSync(LOG_FILE, "utf-8");
  } catch {
    return "";
  }
}

interface SubmitOptions {
  ip?: string;
  contentType?: string | null;
  raw?: string;
}

async function submit(
  body: unknown,
  { ip = "10.0.0.1", contentType = "application/json", raw }: SubmitOptions = {}
) {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (contentType) headers["Content-Type"] = contentType;
  return fetch(`${BASE_URL}/api/feedback`, {
    method: "POST",
    headers,
    body: raw ?? JSON.stringify(body),
  });
}

// Distinct source IPs per group so one group's ceiling cannot mask another's.
const IP = {
  happy: "10.0.0.1",
  xss: "10.0.0.2",
  retry: "10.0.0.3",
  concurrent: "10.0.0.4",
  badInput: "10.0.0.5",
  flood: "10.0.0.9",
  contactFlood: "10.0.0.10",
};

const PHONE_LOCAL = "08111222333";
const PHONE_FLOOD = "08111222999";
const PHONE_E164 = "628111222333";
const XSS_MESSAGE = "Tolong diperbaiki ya <script>alert('xss')</script> — tombolnya nggak jalan.";
const SECRET_TOKEN = "deadbeefdeadbeefdeadbeefdeadbeef";

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  if (!fs.existsSync(path.join(REPO, ".next/BUILD_ID"))) {
    console.error("No build found — run `npm run build` first.");
    process.exit(1);
  }
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  const postgrest = await startPostgrest();
  if (!postgrest) {
    console.error("PostgREST binary missing — cannot run the e2e suite.");
    process.exit(1);
  }

  let app: Stack | null = null;
  const stopApp = () => {
    app?.stop();
    app = null;
  };

  try {
    app = await startApp({});
    truncateFeedback();

    // ── happy path ──────────────────────────────────────────────────────────
    console.log("\n── happy path: bounded text + optional contact ──");
    const okRes = await submit(
      {
        message: "  Saran: tambahin mode puasa ya, biar jadwal makan ikut nyesuain.  ",
        contact: PHONE_LOCAL,
        request_token: token("happy-submit"),
      },
      { ip: IP.happy }
    );
    assertEq(okRes.status, 201, "valid submission -> 201");
    assertEq(await okRes.json(), { ok: true }, "201 body carries nothing but ok (no echo)");
    const rowsAfterHappy = feedbackRows();
    assertEq(rowsAfterHappy.length, 1, "exactly one row committed");
    assertEq(rowsAfterHappy[0].message_text, "Saran: tambahin mode puasa ya, biar jadwal makan ikut nyesuain.", "stored trimmed, verbatim");
    assertEq(rowsAfterHappy[0].phone, PHONE_E164, "contact normalised server-side to 62…");
    assertEq(rowsAfterHappy[0].review_state, "new", "review_state defaults to new");
    assertEq(rowsAfterHappy[0].request_token.length, 32, "request token persisted (idempotency key on the row)");

    // ── no contact at all ───────────────────────────────────────────────────
    const anonRes = await submit(
      { message: "Ini kritik tanpa nomor sama sekali, cuma mau nyampein.", request_token: token("anon-submit") },
      { ip: IP.happy }
    );
    assertEq(anonRes.status, 201, "submission without contact -> 201");
    assertEq(feedbackRows().filter((r) => r.phone === null).length, 1, "contact-less row stored with phone NULL");

    // ── XSS ─────────────────────────────────────────────────────────────────
    console.log("\n── XSS: stored as text, never reflected ──");
    const xssRes = await submit(
      { message: XSS_MESSAGE, request_token: token("xss-submit") },
      { ip: IP.xss }
    );
    assertEq(xssRes.status, 201, "markup payload accepted as plain text");
    const xssBody = await xssRes.text();
    assertOk(!xssBody.includes("<script"), "response body does not echo the markup", `body=${xssBody}`);
    assertOk(!xssBody.includes("alert("), "response body contains no part of the payload", `body=${xssBody}`);
    assertEq(feedbackRows().find((r) => r.message_text.includes("alert("))?.message_text, XSS_MESSAGE, "payload stored byte-for-byte as TEXT");

    // ── idempotent retry ────────────────────────────────────────────────────
    console.log("\n── retry safety: same token twice ──");
    truncateFeedback();
    const retryBody = { message: "Retry setelah jaringan putus, token sama harus aman.", request_token: SECRET_TOKEN };
    const first = await submit(retryBody, { ip: IP.retry });
    const second = await submit(retryBody, { ip: IP.retry });
    assertEq(first.status, 201, "first send -> 201");
    assertEq(second.status, 201, "retry -> 201 (row already committed, not an error)");
    assertEq(feedbackRows().length, 1, "retry did NOT duplicate the row");

    // Changed text on the same token must NOT overwrite the stored message.
    await submit({ message: "Teks berbeda dengan token yang sama seharusnya diabaikan.", request_token: SECRET_TOKEN }, { ip: IP.retry });
    assertEq(feedbackRows().length, 1, "token reuse cannot create a second row");
    assertEq(feedbackRows()[0].message_text, retryBody.message, "stored message survives a same-token resend");

    // ── concurrency ─────────────────────────────────────────────────────────
    console.log("\n── concurrency: 5 parallel posts, one token ──");
    truncateFeedback();
    const raceToken = token("race-submit");
    const race = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        submit({ message: `Kiriman paralel nomor ${i} dari double tap user.`, request_token: raceToken }, { ip: IP.concurrent })
      )
    );
    assertOk(race.every((r) => r.status === 201), "every parallel send answered 201", `statuses=${race.map((r) => r.status).join(",")}`);
    assertEq(feedbackRows().length, 1, "5 parallel sends -> exactly ONE row");

    // ── validation negatives ────────────────────────────────────────────────
    console.log("\n── validation / abuse negatives ──");
    truncateFeedback();
    const before = feedbackRows().length;
    const cases: Array<[string, unknown, string, number]> = [
      ["too short", { message: "pendek", request_token: token("v1") }, "application/json", 400],
      ["too long", { message: "a".repeat(2001), request_token: token("v2") }, "application/json", 400],
      ["whitespace only", { message: "              ", request_token: token("v3") }, "application/json", 400],
      ["missing token", { message: "Pesan yang cukup panjang tapi tanpa token." }, "application/json", 400],
      ["malformed token", { message: "Pesan yang cukup panjang tapi token aneh.", request_token: "not a token!" }, "application/json", 400],
      ["bad contact", { message: "Pesan yang cukup panjang tapi nomornya ngawur.", request_token: token("v4"), contact: "halo" }, "application/json", 400],
      ["wrong content-type", { message: "Pesan yang cukup panjang tapi dikirim form.", request_token: token("v5") }, "application/x-www-form-urlencoded", 415],
    ];
    for (const [name, body, contentType, expected] of cases) {
      const res = await submit(body, { ip: IP.badInput, contentType });
      assertEq(res.status, expected, `${name} -> ${expected}`);
    }
    const malformed = await submit(null, { ip: IP.badInput, raw: "{not json" });
    assertEq(malformed.status, 400, "malformed JSON -> 400");
    const oversized = await submit(null, {
      ip: IP.badInput,
      raw: JSON.stringify({ message: "x".repeat(9000), request_token: token("v6") }),
    });
    assertEq(oversized.status, 413, "oversized body -> 413");
    assertEq(feedbackRows().length, before, "no rejected payload created a row");
    assertEq(before, 0, "started from an empty table");

    // ── rate limiting ───────────────────────────────────────────────────────
    console.log("\n── abuse ceiling: per IP and per contact ──");
    truncateFeedback();
    const floodStatuses: number[] = [];
    for (let i = 0; i < 17; i += 1) {
      const res = await submit(
        { message: `Kiriman bertubi-tubi nomor ${i} dari satu alamat IP.`, request_token: token(`flood-${i}`) },
        { ip: IP.flood }
      );
      floodStatuses.push(res.status);
      if (res.status === 429) {
        assertOk(Number(res.headers.get("retry-after")) > 0, "429 carries Retry-After");
        break;
      }
    }
    assertEq(floodStatuses.filter((s) => s === 201).length, 15, "exactly IP_LIMIT(15) accepted");
    assertEq(floodStatuses[floodStatuses.length - 1], 429, "request 16 from the same IP -> 429");
    assertEq(feedbackRows().length, 15, "rate-limited sends wrote nothing extra");

    const contactStatuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await submit(
        { message: `Kiriman dengan nomor kontak yang sama, kali ke-${i}.`, request_token: token(`contact-${i}`), contact: PHONE_FLOOD },
        { ip: `10.0.1.${i + 1}` }
      );
      contactStatuses.push(res.status);
      if (res.status === 429) break;
    }
    assertEq(contactStatuses.filter((s) => s === 201).length, 4, "exactly CONTACT_LIMIT(4) accepted per contact");
    assertEq(contactStatuses[contactStatuses.length - 1], 429, "5th send for the same contact -> 429");

    // ── no list exposure ────────────────────────────────────────────────────
    console.log("\n── no read path, no enumeration ──");
    const getRes = await fetch(`${BASE_URL}/api/feedback`, { headers: { "x-forwarded-for": IP.happy } });
    assertEq(getRes.status, 405, "GET /api/feedback -> 405");
    assertEq(getRes.headers.get("allow"), "POST", "405 advertises POST only");
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const res = await fetch(`${BASE_URL}/api/feedback`, { method });
      assertEq(res.status, 405, `${method} -> 405`);
    }

    // ── served HTML: a11y, noindex, no key in the client bundle ─────────────
    console.log("\n── served page: a11y + noindex + no client-side key ──");
    const pageRes = await fetch(`${BASE_URL}/companion/nina/kritiksaran`);
    assertEq(pageRes.status, 200, "page renders");
    const html = await pageRes.text();
    assertOk(/id="message"/.test(html), "textarea id present in SSR output");
    assertOk(/aria-describedby="message-help message-count"/.test(html), "describedby survives SSR");
    assertOk(/maxlength="2000"/i.test(html) && /minlength="10"/i.test(html), "length bounds on the textarea");
    assertOk(/type="submit"/.test(html), "submit button present");
    assertOk(/for="message"/.test(html), "label wired to the textarea");
    assertOk(/name="robots"[^>]*noindex/.test(html), "page is noindex");

    const chunks = Array.from(html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)).map((m) => m[1]);
    assertOk(chunks.length > 0, "page references its JS chunks");
    let keyLeak = "";
    for (const chunk of chunks) {
      const js = await (await fetch(`${BASE_URL}${chunk}`)).text();
      if (js.includes(SERVICE_KEY)) keyLeak = chunk;
    }
    assertEq(keyLeak, "", "service-role key absent from every served chunk");

    // ── logs ────────────────────────────────────────────────────────────────
    console.log("\n── logs carry no PII ──");
    const log = serverLog();
    assertOk(!log.includes(PHONE_E164), "phone number never reaches the log");
    assertOk(!log.includes("8111222333"), "no fragment of the phone number in the log");
    assertOk(!log.includes(SECRET_TOKEN), "request token never reaches the log");
    assertOk(/\[Feedback\] stored id=/.test(log), "success is logged with an id");

    // ── DB failure must not produce a thank-you ─────────────────────────────
    console.log("\n── DB failure: no false success ──");
    stopApp();
    app = await startApp({ SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_KEY: SERVICE_KEY });
    truncateFeedback();
    const deadRes = await submit(
      { message: "Pesan ini dikirim saat database sedang mati total.", request_token: token("db-down") },
      { ip: "10.0.2.1" }
    );
    assertEq(deadRes.status, 503, "unreachable DB -> 503");
    const deadBody = await deadRes.text();
    assertOk(!/"ok"\s*:\s*true/.test(deadBody), "503 body carries no success marker", `body=${deadBody}`);
    assertOk(!/Makasih|sudah tersimpan/i.test(deadBody), "503 body makes no success claim", `body=${deadBody}`);
    assertEq(feedbackRows().length, 0, "no row written when the DB is unreachable");

    // ── unconfigured Supabase must fail closed ──────────────────────────────
    console.log("\n── unconfigured Supabase: fail closed ──");
    stopApp();
    app = await startApp({ SUPABASE_URL: undefined, SUPABASE_SERVICE_KEY: undefined });
    const unconfigured = await submit(
      { message: "Tanpa konfigurasi Supabase, tidak boleh ada sukses palsu.", request_token: token("no-config") },
      { ip: "10.0.3.1" }
    );
    assertEq(unconfigured.status, 503, "missing Supabase config -> 503 (no disk fallback)");
    assertEq(feedbackRows().length, 0, "nothing written without configuration");

    // ── anon key cannot read feedback ───────────────────────────────────────
    console.log("\n── anon key cannot read the table (with mutation proof) ──");
    stopApp();
    psqlSuper("TRUNCATE feedback RESTART IDENTITY CASCADE;");
    psqlSuper(
      "INSERT INTO feedback (tenant_id, phone, message_text, request_token) " +
        `VALUES ('thrivin', '${PHONE_E164}', 'Baris rahasia milik pelanggan untuk uji isolasi.', '${token("anon-probe")}');`
    );
    assertEq(feedbackRows().length, 1, "planted one row as the service role");

    const anonRead = async () => {
      const res = await fetch(`${POSTGREST_URL}/rest/v1/feedback?select=id,message_text`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      });
      const rows = res.status === 200 ? await res.json() : [];
      return { status: res.status, rows: Array.isArray(rows) ? rows : [] };
    };

    const denied = await anonRead();
    assertEq(denied.rows.length, 0, `anon reads ZERO rows (http ${denied.status})`);

    // Mutation proof: with the RLS policy gone, the same request DOES see the row.
    // Without this step the green above could just be a missing GRANT.
    // Mutation proof. Dropping the POLICY alone still denies (RLS with zero policies is
    // default-deny), so the control being tested is RLS itself: turn it off the way a
    // forgotten ALTER TABLE would, and the same anon request must see the row.
    psqlSuper("DROP POLICY deny_client_access_feedback ON feedback;");
    psqlSuper("ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;");
    const mutated = await anonRead();
    assertEq(mutated.rows.length, 1, "mutation proof: with RLS off the row leaks (so the check is real)");
    psqlSuper("ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;");
    psqlSuper(
      "CREATE POLICY deny_client_access_feedback ON feedback FOR ALL TO anon, authenticated " +
        "USING (false) WITH CHECK (false);"
    );
    const restored = await anonRead();
    assertEq(restored.rows.length, 0, "policy restored -> anon blind again");

    const serviceRead = await fetch(`${POSTGREST_URL}/rest/v1/feedback?select=id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    assertEq(serviceRead.status, 200, "service role can still read");
    assertEq((await serviceRead.json()).length, 1, "service role sees the row");
  } catch (err) {
    record(false, "suite crashed", String((err as Error)?.stack || err));
  } finally {
    stopApp();
    postgrest.stop();
  }

  const failed = results.filter(([s]) => s === "FAIL");
  for (const [state, name] of results) console.log(`${state}  ${name}`);
  console.log("");
  if (failed.length > 0) {
    console.error(`FAILED ${failed.length} of ${results.length} feedback e2e checks`);
    process.exit(1);
  }
  console.log(`PASSED ${results.length}/${results.length} feedback e2e checks`);
  process.exit(0);
}

await main();
