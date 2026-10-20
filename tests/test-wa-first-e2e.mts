/**
 * End-to-end tests untuk WA-first TANPA OTP (kartu t_aaf8176a, keputusan owner
 * 20/10): nomor diketik -> server lookup DB -> new / active / inactive.
 *
 *   node --experimental-strip-types tests/test-wa-first-e2e.mts
 *
 * Stack: Next.js (production build) -> HTTP -> PostgREST -> Postgres lokal.
 * Tidak ada staging, tidak ada produksi, tidak ada data customer, NOL outbound
 * WhatsApp (tidak ada provider OTP yang dipanggil sama sekali).
 *
 * Bukti per item:
 *   tiga status   -> new / active(+daysLeft) / inactive(+daysSinceExpiry)
 *   promo 7 hari  -> 12 hari = promo, 3 hari = bukan, tepat 7×24 jam = bukan
 *   privasi       -> respons TIDAK memuat nama/profil/subscription_id/token/nomor;
 *                    kunci jawaban persis sesuai daftar minimal
 *   sesi checkout -> lookup menerbitkan cookie; create-order tanpa cookie 401,
 *                    nomor lain dari sesi yang sama 403 (gate TETAP ada)
 *   rate limit    -> 5/nomor per menit, ke-6 = 429
 *   verify hilang -> /api/wa/session/verify tidak lagi punya route (404)
 *   gagal-tertutup-> DB mati -> 503 TANPA field status (bukan "nomor baru")
 *   RPC sempit    -> anon/authenticated DITOLAK; service_role 3 field
 *   UI            -> tanpa input kode/hitung mundur, label + keyboard mobile
 *   log           -> tidak ada nomor mentah di log server
 */
import fs from "fs";
import path from "path";
import { spawn, execFileSync } from "child_process";
import {
  ANON_KEY,
  SERVICE_KEY,
  POSTGREST_URL,
  PORTS,
  startPostgrest,
  psqlSuper,
  tmpPath,
} from "./harness/stack.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const APP_PORT = Number(process.env.HARNESS_WA_APP_PORT || PORTS.waApp);
const BROKEN_APP_PORT = Number(process.env.HARNESS_WA_BROKEN_APP_PORT || PORTS.waBroken);
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const BROKEN_URL = `http://127.0.0.1:${BROKEN_APP_PORT}`;

const WA_SESSION_SECRET = "wa-first-e2e-session-secret-0123456789-abc";
const LOG_FILE = tmpPath("wa-lookup-server.log");
const BROKEN_LOG = tmpPath("wa-lookup-broken.log");
/** Port yang tidak ada apa-apa: mensimulasikan Supabase/upstream mati. */
const DEAD_SUPABASE = "http://127.0.0.1:59997";

const results: Array<[string, string]> = [];
function record(ok: boolean, name: string, detail = "") {
  results.push([ok ? "PASS" : "FAIL", detail ? `${name} — ${detail}` : name]);
}
function assertOk(cond: boolean, name: string, detail = "") {
  record(Boolean(cond), name, cond ? "" : detail);
}
function assertEq(actual: unknown, expected: unknown, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  record(ok, name, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ── nomor dummy (bukan data siapa pun) ──────────────────────────────────────
const P = {
  new: "6281200000001",
  active: "6281200000002",
  expired12d: "6281200000003",
  expired3d: "6281200000004",
  exact7d: "6281200000005",
  rateLimited: "6281200000006",
};

/** Kunci jawaban yang BOLEH keluar dari endpoint lookup, per status. */
const ALLOWED_KEYS = {
  new: ["ok", "status"],
  active: ["daysLeft", "ok", "planName", "status"],
  inactive: ["daysSinceExpiry", "ok", "renewalPromo", "status"],
};

async function waitFor(url: string, timeoutMs = 60000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return res;
      last = `status ${res.status}`;
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}: ${last}`);
}

interface Stack {
  stop: () => void;
}

async function startApp(
  env: Record<string, string | undefined> = {},
  port: number = APP_PORT,
  logFile: string = LOG_FILE
): Promise<Stack> {
  try {
    fs.truncateSync(logFile, 0);
  } catch {}
  const logFd = fs.openSync(logFile, "a");
  // `undefined` = benar-benar TIDAK di-set (bukan string "undefined").
  const merged: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    SUPABASE_URL: POSTGREST_URL,
    SUPABASE_SERVICE_KEY: SERVICE_KEY,
    THRIVIN_TENANT_ID: "thrivin",
    WA_SESSION_SECRET,
    WA_SESSION_EPOCH: "0",
    // Gate sesi di create-order berjalan sebelum Scalev dipanggil; nilai dummy
    // cukup (nol request keluar ke Scalev pada suite ini).
    SCALEV_API_KEY: "dummy-scalev-key-for-session-gate",
    ...env,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  const child = spawn("./node_modules/.bin/next", ["start", "-p", String(port)], {
    cwd: REPO,
    env: merged as Record<string, string>,
    stdio: ["ignore", logFd, logFd],
  });
  await waitFor(`http://127.0.0.1:${port}/companion/nina/status`);
  return {
    stop: () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    },
  };
}

interface Client {
  call: (pathname: string, init?: RequestInit) => Promise<{ status: number; body: any; raw: string }>;
  cookie: () => string;
  setCookie: (value: string) => void;
}

/** Satu klien = satu IP tetap, supaya bucket rate limit bisa diuji deterministik. */
function makeClient(base = BASE_URL, ip = "10.99.0.1"): Client {
  let cookie = "";
  return {
    async call(pathname, init = {}) {
      const extra = (init.headers as Record<string, string>) || {};
      const res = await fetch(`${base}${pathname}`, {
        ...init,
        headers: { ...extra, ...(cookie ? { cookie } : {}), "X-Forwarded-For": ip },
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      const raw = await res.text();
      let body: any = null;
      try {
        body = JSON.parse(raw);
      } catch {}
      return { status: res.status, body, raw };
    },
    cookie: () => cookie,
    setCookie: (value: string) => {
      cookie = value;
    },
  };
}

function lookup(client: Client, phone: string) {
  return client.call("/api/wa/session/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
}

function countRows(table: string, where = "TRUE"): number {
  return Number(psqlSuper(`SELECT count(*) FROM ${table} WHERE ${where};`, { csv: true }));
}

function insertUser(phone: string, name: string): string {
  return psqlSuper(
    `INSERT INTO users (phone, name) VALUES ('${phone}', '${name}') RETURNING id;`,
    { csv: true }
  )
    .split("\n")[0]
    .trim();
}

function insertSubscription(userId: string, status: string, expiresExpr: string): void {
  psqlSuper(
    `INSERT INTO subscriptions (user_id, plan_id, status, started_at, expires_at, token_limit)
     VALUES ('${userId}', 2, '${status}', now() - interval '90 days', ${expiresExpr}, 500000);`
  );
}

async function main() {
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });

  const postgrest = await startPostgrest();
  if (!postgrest) {
    console.error("PostgREST binary missing — cannot run the WA-first e2e suite.");
    process.exit(1);
  }
  let app: Stack | null = null;
  let broken: Stack | null = null;

  try {
    // ── data dummy ─────────────────────────────────────────────────────────
    psqlSuper("TRUNCATE wa_otp_challenges, subscriptions, users RESTART IDENTITY CASCADE;");

    // P.new & P.rateLimited sengaja TIDAK punya baris `users` sama sekali.
    const idActive = insertUser(P.active, "Dummy Active");
    const id12d = insertUser(P.expired12d, "Dummy Expired 12");
    const id3d = insertUser(P.expired3d, "Dummy Expired 3");
    const id7d = insertUser(P.exact7d, "Dummy Exact 7");

    insertSubscription(idActive, "active", "now() + interval '20 days'");
    insertSubscription(id12d, "expired", "now() - interval '12 days'");
    insertSubscription(id3d, "expired", "now() - interval '3 days'");
    // Tepat 7×24 jam (margin 30 detik ke sisi "sudah lewat"): belum promo.
    insertSubscription(id7d, "expired", "now() - interval '168 hours' + interval '30 seconds'");

    app = await startApp();

    // ══ 1. Tiga status ═════════════════════════════════════════════════════
    section("Lookup tiga status (tanpa OTP)");
    const client = makeClient(BASE_URL, "10.99.0.2");

    const fresh = await lookup(client, "0812-0000-0001");
    assertEq(fresh.status, 200, "new: nomor belum terdaftar -> 200");
    assertEq(fresh.body, { ok: true, status: "new" }, "new: body persis {ok,status}");
    assertEq(Object.keys(fresh.body).sort(), ALLOWED_KEYS.new, "new: kunci minimal");

    const active = await lookup(client, P.active);
    assertEq(active.body?.status, "active", "active: nomor berlangganan -> 'active'");
    assertOk(
      typeof active.body?.daysLeft === "number" && active.body.daysLeft >= 19 && active.body.daysLeft <= 20,
      "active: daysLeft masuk akal (langganan +20 hari)",
      `daysLeft=${active.body?.daysLeft}`
    );
    assertEq(active.body?.planName, null, "active: planName null (RPC tak punya nama tampilan)");
    assertEq(Object.keys(active.body).sort(), ALLOWED_KEYS.active, "active: kunci minimal");

    const twelve = await lookup(client, P.expired12d);
    assertEq(twelve.body?.status, "inactive", "inactive: kedaluwarsa 12 hari -> 'inactive'");
    assertEq(twelve.body?.daysSinceExpiry, 12, "inactive: daysSinceExpiry = 12");
    assertEq(twelve.body?.renewalPromo, true, "inactive 12 hari: renewalPromo true (>7 hari)");
    assertEq(Object.keys(twelve.body).sort(), ALLOWED_KEYS.inactive, "inactive: kunci minimal");

    const three = await lookup(client, P.expired3d);
    assertEq(three.body?.daysSinceExpiry, 3, "inactive: daysSinceExpiry = 3");
    assertEq(three.body?.renewalPromo, false, "inactive 3 hari: renewalPromo false");

    const seven = await lookup(client, P.exact7d);
    assertEq(seven.body?.renewalPromo, false, "inactive tepat 7×24 jam: renewalPromo false (batas)");

    // ══ 2. Privasi: tidak ada data pribadi di respons ══════════════════════
    section("Privasi respons (tanpa OTP, nomor bisa ditebak siapa pun)");
    const forbidden = [
      "Dummy",
      "subscription",
      "token_limit",
      "tokenLimit",
      "maskedPhone",
      "expiresAt",
      "expires_at",
      "lastPlanKey",
      "last_plan_key",
      P.active,
      P.expired12d.slice(-6),
    ];
    for (const raw of [fresh.raw, active.raw, twelve.raw]) {
      for (const field of forbidden) {
        assertOk(!raw.includes(field), `privasi: respons tidak memuat "${field}"`);
      }
    }
    assertOk(
      countRows("users") === 4 && countRows("subscriptions") === 4,
      "privasi: lookup tidak menulis ke users/subscriptions"
    );

    // ══ 3. Validasi & rate limit ═══════════════════════════════════════════
    section("Validasi input & rate limit");
    const invalid = await lookup(client, "123");
    assertEq(invalid.status, 400, "input tidak valid -> 400 (tidak disubstitusi)");

    const rl = makeClient(BASE_URL, "10.99.0.3");
    let lastStatus = 0;
    for (let i = 0; i < 5; i += 1) {
      lastStatus = (await lookup(rl, P.rateLimited)).status;
      assertEq(lastStatus, 200, `rate limit: permintaan #${i + 1} -> 200`);
    }
    const denied = await lookup(rl, P.rateLimited);
    assertEq(denied.status, 429, "rate limit: permintaan ke-6 dalam satu menit -> 429");
    assertOk(denied.body?.ok === false, "rate limit: jawaban 429 ok=false");
    assertOk(!("status" in (denied.body || {})), "rate limit: 429 tanpa field status");

    // ══ 4. Sesi checkout: cookie dari lookup, gate create-order tetap ada ══
    section("Sesi checkout (gate create-order dipertahankan)");
    const session = makeClient(BASE_URL, "10.99.0.4");
    const ses = await lookup(session, P.active);
    assertEq(ses.status, 200, "sesi: lookup -> 200");
    assertOk(
      session.cookie().includes("thrivin_wa_session="),
      "sesi: lookup menerbitkan cookie sesi WA"
    );

    const noCookie = makeClient(BASE_URL, "10.99.0.5");
    const orderNoSession = await noCookie.call("/api/scalev/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: "month",
        customerPhone: P.active,
        idempotencyKey: "idem-no-session-0001",
      }),
    });
    assertEq(orderNoSession.status, 401, "gate: create-order tanpa cookie sesi -> 401");
    assertEq(orderNoSession.body?.code, "SESSION_REQUIRED", "gate: kode SESSION_REQUIRED");

    const mismatch = await session.call("/api/scalev/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: "month",
        customerPhone: P.new,
        idempotencyKey: "idem-mismatch-0001",
      }),
    });
    assertEq(mismatch.status, 403, "gate: nomor body != nomor sesi -> 403");
    assertEq(mismatch.body?.code, "PHONE_SESSION_MISMATCH", "gate: kode PHONE_SESSION_MISMATCH");

    // ══ 5. Endpoint verify sudah tidak ada ═════════════════════════════════
    section("Endpoint verify dihapus");
    const verifyGone = await makeClient(BASE_URL, "10.99.0.6").call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: P.active, code: "123456" }),
    });
    assertOk(
      verifyGone.status === 404 || verifyGone.status === 405,
      "verify: route sudah tidak ada (404/405), bukan jalur OTP",
      `status=${verifyGone.status}`
    );

    // ══ 6. RPC sempit: least privilege ═════════════════════════════════════
    section("RPC sempit: anon ditolak, jalur baca tidak menulis");
    const anonRpc = await fetch(`${POSTGREST_URL}/rest/v1/rpc/subscription_status_for_owner`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ p_phone: P.active }),
    });
    assertOk(
      anonRpc.status === 401 || anonRpc.status === 403,
      "rpc: anon DITOLAK (401/403), bukan 200 berisi data",
      `status=${anonRpc.status}`
    );

    const svcRpc = await fetch(`${POSTGREST_URL}/rest/v1/rpc/subscription_status_for_owner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ p_phone: P.active }),
    }).then((r) => r.json());
    assertEq(svcRpc?.state, "active", "rpc: service_role membaca state active");
    assertEq(
      Object.keys(svcRpc).sort(),
      ["expires_at", "last_plan_key", "state"],
      "rpc: jawaban hanya 3 field"
    );

    // ══ 7. Gagal-tertutup: DB mati ═════════════════════════════════════════
    section("Gagal-tertutup (upstream mati)");
    broken = await startApp({ SUPABASE_URL: DEAD_SUPABASE }, BROKEN_APP_PORT, BROKEN_LOG);
    const brokenLookup = await lookup(makeClient(BROKEN_URL, "10.99.0.7"), P.active);
    assertEq(brokenLookup.status, 503, "fail-closed: DB mati -> 503 (bukan 200)");
    assertOk(
      !("status" in (brokenLookup.body || {})),
      "fail-closed: jawaban tanpa field status — tidak pernah terbaca sebagai 'nomor baru'"
    );
    assertOk(
      !brokenLookup.raw.includes("new"),
      "fail-closed: bukan jawaban status 'new'"
    );
    broken.stop();
    broken = null;

    // ══ 8. UI: tanpa kode OTP, tetap ramah keyboard/mobile ═════════════════
    section("UI: tiga cabang, tanpa input kode");
    const page = await fetch(`${BASE_URL}/companion/nina/status`);
    const html = await page.text();
    assertEq(page.status, 200, "ui: halaman status -> 200");
    assertOk(
      html.includes('for="wa-phone"') && html.includes('id="wa-phone"'),
      "ui: input nomor punya <label for> eksplisit"
    );
    assertOk(html.includes('type="tel"'), "ui: input nomor type=tel");
    assertOk(/inputmode="numeric"/i.test(html), "ui: inputmode=numeric");
    assertOk(/autocomplete="tel"/i.test(html), "ui: autocomplete=tel");
    assertOk(html.includes('aria-live="polite"'), "ui: wilayah aria-live untuk error");
    assertOk(
      html.includes('aria-describedby="wa-phone-hint"') && html.includes('id="wa-phone-hint"'),
      "ui: input ditautkan ke teks bantuan"
    );
    assertOk(html.includes("min-h-11"), "ui: target sentuh minimal 44px");
    assertOk(!/kode verifikasi/i.test(html), "ui: tidak ada lagi teks 'kode verifikasi'");
    assertOk(!/one-time-code/i.test(html), "ui: tidak ada input kode sekali pakai");
    assertOk(!/kirim ulang|hitung mundur/i.test(html), "ui: tidak ada kirim ulang/hitung mundur");
    assertOk(
      html.includes("Cek status"),
      "ui: tombol utama 'Cek status' (bukan 'Kirim kode')"
    );

    // ══ 9. Log & redaksi ═══════════════════════════════════════════════════
    section("Log: tidak ada nomor mentah");
    const serverLog = fs.readFileSync(LOG_FILE, "utf-8");
    const rawPhones = Object.values(P).filter((phone) => serverLog.includes(phone));
    assertEq(rawPhones, [], "log: tidak ada nomor mentah di log server");
  } finally {
    app?.stop();
    broken?.stop();
    postgrest.stop();
  }

  const failed = results.filter(([status]) => status === "FAIL");
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(
    `\n${results.length - failed.length}/${results.length} WA-first (tanpa OTP) e2e checks passed` +
      (failed.length ? " — FAILED" : "")
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
