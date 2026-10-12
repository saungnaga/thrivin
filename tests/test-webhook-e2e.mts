/**
 * End-to-end tests for the Scalev webhook + onboarding remediation.
 *
 *   node --experimental-strip-types tests/test-webhook-e2e.mts
 *
 * Stack: real Next.js server -> real HTTP -> real PostgREST -> real Postgres,
 * with the Scalev API replaced by tests/mock-scalev.mjs (M-7). Nothing here
 * touches staging or the production Scalev account.
 *
 * Evidence per item:
 *   B-1  secret unset                -> 500 (was 200 + free subscription)
 *   B-2  client `amount` ignored      -> Scalev order shows the server price
 *   B-2  invalid onboarding           -> 400
 *   B-2  PII not written to notes     -> order notes carry no weight/height/age
 *   H-1  anon key present, no service -> write path fails loudly
 *   H-2  inbox payload whitelisted    -> no name/phone/email in stored payload
 *   H-3  disk fallback gated          -> NODE_ENV=production writes nothing to /tmp
 *   H-4  purge runs + logs            -> rows deleted, purge_audit_log row written
 *   H-5  snapshot written after order -> exactly 1 row keyed by order_id
 *   H-6  concurrent paid + settled    -> exactly 1 subscription (THE race test)
 *   M-4  success log has no phone/name
 *   M-5  invalid phone rejected       -> 400 (no 6281234567890 substitution)
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn, execFileSync } from "child_process";
import {
  SERVICE_KEY,
  ANON_KEY,
  POSTGREST_URL,
  startPostgrest,
  truncateAll,
  countRows,
  query,
  psqlSuper,
} from "./harness/stack.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const WEBHOOK_SECRET = "test_scalev_secret_12345";
const APP_PORT = Number(process.env.HARNESS_APP_PORT || 3987);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || 4111);
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

const DISK_DIR = "/tmp/thrivin-e2e-onboarding";
const LOG_FILE = "/tmp/thrivin-e2e-server.log";

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

function sign(rawBody: string, secret = WEBHOOK_SECRET): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
}

async function waitFor(url: string, timeoutMs = 40000, init?: RequestInit) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500) return res;
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

async function startMockScalev(): Promise<Stack> {
  const child = spawn(process.execPath, [path.join(HERE, "mock-scalev.mjs"), String(MOCK_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(`[mock-scalev] ${d}`));
  await waitFor(`${MOCK_URL}/v3/stores/x/products`);
  return {
    stop: () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* gone */
      }
    },
  };
}

/** Start the built Next.js app with a given environment. */
async function startApp(env: Record<string, string | undefined>): Promise<Stack> {
  try {
    fs.truncateSync(LOG_FILE, 0);
  } catch {
    /* ignore */
  }
  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn("./node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    cwd: REPO,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      // PostgREST stand-in for Supabase (key = HS256 JWT, exactly like Supabase).
      SUPABASE_URL: POSTGREST_URL,
      SUPABASE_SERVICE_KEY: SERVICE_KEY,
      ONBOARDING_DATA_DIR: DISK_DIR,
      SCALEV_API_BASE_URL: MOCK_URL,
      SCALEV_STORE_ID: "store_test",
      SCALEV_API_KEY: "sk_test_key",
      ...env,
    },
    stdio: ["ignore", logFd, logFd],
  });
  await waitFor(`${BASE_URL}/api/scalev/webhook`);
  return {
    stop: () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* gone */
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

const sampleProfile = {
  gender: "Laki-laki",
  age: 26,
  weight: 70,
  height: 175,
  activityLevel: "Moderat",
  workoutLocation: "Di Gym",
  programFocus: ["Workout & Strength", "Fat Loss"],
  biggestChallenge: "Konsistensi jadwal",
  communicationStyle: "Tegas & Terarah",
};

async function postWebhook(body: unknown, secret = WEBHOOK_SECRET) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Scalev-Hmac-Sha256": sign(raw, secret) },
    body: raw,
  });
}

async function postWebhookUnsigned(body: unknown) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}

function paymentEvent(opts: {
  eventId: string;
  orderId: string;
  phone: string;
  paymentStatus: string;
  gross?: number | string;
  name?: string;
}) {
  return {
    event: "payment.received",
    unique_id: opts.eventId,
    timestamp: new Date().toISOString(),
    data: {
      id: `01948092-9b80-7f91-b23d-${opts.orderId}`,
      order_id: opts.orderId,
      payment_status: opts.paymentStatus,
      gross_revenue: String(opts.gross ?? "219000.00"),
      customer_id: 28024,
      customer: { name: opts.name || "Budi Santoso", phone: opts.phone },
      destination_address: {
        name: opts.name || "Budi Santoso",
        phone: opts.phone,
        email: "budi@example.com",
        address: "Jl. Merdeka No. 1",
      },
      customer_phone: opts.phone,
      customer_name: opts.name || "Budi Santoso",
      notes: "PII should never be persisted verbatim",
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  fs.rmSync(DISK_DIR, { recursive: true, force: true });
  // Idempotent: creates the DB if missing and reapplies migrations + grants, so
  // the suite is runnable on its own (not only via tests/run-all.sh).
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  const postgrest = await startPostgrest();
  if (!postgrest) {
    console.error("PostgREST binary missing — cannot run the e2e suite.");
    process.exit(1);
  }
  const mock = await startMockScalev();

  let app: Stack | null = null;
  const stopApp = () => {
    app?.stop();
    app = null;
  };

  try {
    // ── B-1 ────────────────────────────────────────────────────────────────
    console.log("\n── B-1: webhook signing secret (no fallback, fail closed) ──");
    truncateAll();
    app = await startApp({ SCALEV_WEBHOOK_SECRET: undefined, SCALEV_API_KEY: "sk_test_key" });
    const body1 = JSON.stringify({ event: "business.test_event", timestamp: new Date().toISOString() });
    const unsigned = await postWebhookUnsigned(JSON.parse(body1));
    assertEq(unsigned.status, 500, "B-1  all secrets unset -> 500 (was 200 = free subscriptions)");

    // The old code HMAC'd with "" and accepted whatever the attacker signed.
    const emptyKeySigned = await postWebhook(JSON.parse(body1), "");
    assertEq(emptyKeySigned.status, 500, "B-1  attacker-signed body with empty key still -> 500");
    assertEq(countRows("subscriptions"), 0, "B-1  no subscription created while unconfigured");
    assertEq(countRows("webhook_events_inbox"), 0, "B-1  no inbox row while unconfigured");

    // Correct secret -> accepted (proves the 500 is about config, not a broken path)
    stopApp();
    app = await startApp({ SCALEV_WEBHOOK_SECRET: WEBHOOK_SECRET });
    const testEvent = await postWebhook({
      event: "business.test_event",
      unique_id: `evt_${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
    assertEq(testEvent.status, 200, "B-1  handshake accepted once the secret is configured");

    const badSig = await fetch(`${BASE_URL}/api/scalev/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Scalev-Hmac-Sha256": sign("x", "wrong-secret") },
      body: JSON.stringify({ event: "business.test_event", timestamp: new Date().toISOString() }),
    });
    assertEq(badSig.status, 401, "B-1  wrong secret -> 401");

    // ── M-5 ───────────────────────────────────────────────────────────────
    console.log("\n── M-5: shared normaliser, invalid input rejected ──");
    const shortPhone = await fetch(`${BASE_URL}/api/scalev/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.9.9.1" },
      body: JSON.stringify({ planId: "quarter", customerPhone: "0812", customerName: "X" }),
    });
    assertEq(shortPhone.status, 400, "M-5  invalid phone -> 400 (no 6281234567890 substitution)");

    // ── B-2: client amount ignored ────────────────────────────────────────
    console.log("\n── B-2: server-side pricing, validation, no PII in notes ──");
    const phoneB2 = "6281299900001";
    const orderRes = await fetch(`${BASE_URL}/api/scalev/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.9.9.2" },
      body: JSON.stringify({
        planId: "quarter",
        planName: "Nina 3 Bulan",
        amount: 1000, // ← hostile client price
        customerName: "Raihan Test User",
        customerPhone: phoneB2,
        onboarding: sampleProfile,
      }),
    });
    const orderJson = await orderRes.json();
    assertEq(orderRes.status, 200, "B-2  order created");

    const mockOrders = JSON.parse(
      fs.readFileSync("/tmp/thrivin-e2e-mock-orders.json", "utf-8")
    );
    const lastOrder = mockOrders[mockOrders.length - 1];
    assertEq(
      lastOrder.body.ordervariants[0].quantity * 219000 - lastOrder.body.product_discount,
      PLAN_QUARTER_PRICE,
      "B-2  Scalev charged the SERVER price, not the client's Rp 1.000"
    );
    assertOk(
      !/kg|cm|th|Laki-laki|Perempuan/.test(lastOrder.body.notes),
      "B-2  no weight/height/age/gender words in Scalev order notes",
      `notes="${lastOrder.body.notes}"`
    );

    // ── B-2: onboarding validation ───────────────────────────────────────
    const badProfile = await fetch(`${BASE_URL}/api/scalev/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.9.9.3" },
      body: JSON.stringify({
        planId: "quarter",
        customerPhone: "6281299900002",
        onboarding: { ...sampleProfile, weight: 900, age: 4, gender: "Robot" },
      }),
    });
    assertEq(badProfile.status, 400, "B-2  out-of-range/enum-invalid onboarding -> 400");

    // ── H-5: snapshot written AFTER the order, keyed by order_id ─────────
    console.log("\n── H-5: snapshot timing + keying ──");
    assertEq(
      countRows("onboarding_snapshots", `order_id = '${orderJson.orderId}'`),
      1,
      "H-5  exactly one snapshot row for the created order_id"
    );
    assertEq(
      countRows("onboarding_snapshots", "order_id IS NULL"),
      0,
      "H-5  no pre-order (order_id IS NULL) rows are written"
    );

    // Re-run the same checkout twice: upsert, not an unbounded insert.
    for (let i = 0; i < 2; i++) {
      await fetch(`${BASE_URL}/api/scalev/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.9.9.${10 + i}` },
        body: JSON.stringify({
          planId: "quarter",
          customerPhone: phoneB2,
          customerName: "Raihan Test User",
          onboarding: sampleProfile,
        }),
      });
    }
    const perOrder = query<[string, string]>(
      `SELECT order_id, count(*) FROM onboarding_snapshots GROUP BY order_id ORDER BY order_id`
    );
    assertOk(
      perOrder.every(([, count]) => count === "1"),
      "H-5  every order_id has exactly one snapshot (unique index holds)",
      JSON.stringify(perOrder)
    );

    // ── H-6: the concurrency race ─────────────────────────────────────────
    console.log("\n── H-6: concurrent paid + settled for one order ──");
    truncateAll();
    const raceOrder = `250130RACE${Date.now().toString().slice(-6)}`;
    const racePhone = "6281299900010";

    // Seed the snapshot the same way create-order does (post-order write).
    psqlSuper(
      `INSERT INTO onboarding_snapshots (tenant_id, phone, order_id, snapshot) VALUES ` +
        `('thrivin', '${racePhone}', '${raceOrder}', '{"plan_key":"quarter","weight":70}'::jsonb)`
    );

    const paidEvent = paymentEvent({
      eventId: `evt_paid_${Date.now()}`,
      orderId: raceOrder,
      phone: racePhone,
      paymentStatus: "paid",
    });
    const settledEvent = paymentEvent({
      eventId: `evt_settled_${Date.now()}`,
      orderId: raceOrder,
      phone: racePhone,
      paymentStatus: "settled",
    });

    const [paidRes, settledRes] = await Promise.all([
      postWebhook(paidEvent),
      postWebhook(settledEvent),
    ]);
    const paidBody = await paidRes.json();
    const settledBody = await settledRes.json();

    assertOk(
      [paidRes.status, settledRes.status].every((s) => s === 200),
      "H-6  both deliveries answered 200 (Scalev stops retrying)",
      `paid=${paidRes.status} settled=${settledRes.status}`
    );
    assertOk(
      [paidBody, settledBody].filter((b) => b.userActivated === true).length === 1,
      "H-6  exactly ONE delivery won the claim",
      `paid.activated=${paidBody.userActivated} settled.activated=${settledBody.userActivated}`
    );

    const subCount = psqlSuper(
      `SELECT count(*) FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.phone = '${racePhone}';`,
      { csv: true }
    );
    console.log(`   SELECT count(*) FROM subscriptions WHERE user_id = (user ${racePhone}) → ${subCount}`);
    assertEq(Number(subCount), 1, "H-6  SELECT count(*) FROM subscriptions = 1 (was 2)");

    assertEq(
      countRows("webhook_events_inbox", `fulfillment_key = '${raceOrder}'`),
      1,
      "H-6  one inbox row per fulfillment key"
    );
    assertEq(
      countRows("webhook_events_inbox", `fulfillment_key = '${raceOrder}' AND status = 'completed'`),
      1,
      "H-6  the claimed row reached a terminal status"
    );

    // Serial replay of the same logical event must still be a no-op.
    const replay = await postWebhook(paidEvent);
    const replayBody = await replay.json();
    assertEq(replay.status, 200, "H-6  replay answers 200");
    assertEq(
      Number(
        psqlSuper(
          `SELECT count(*) FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.phone = '${racePhone}';`,
          { csv: true }
        )
      ),
      1,
      "H-6  replay did not add a second subscription"
    );
    assertOk(
      /idempotent/i.test(String(replayBody.message)),
      "H-6  replay reported as idempotent"
    );

    // Out-of-order: settled first, then paid — still one activation.
    truncateAll();
    const raceOrder2 = `250130RACE2${Date.now().toString().slice(-5)}`;
    const racePhone2 = "6281299900011";
    psqlSuper(
      `INSERT INTO onboarding_snapshots (tenant_id, phone, order_id, snapshot) VALUES ` +
        `('thrivin', '${racePhone2}', '${raceOrder2}', '{"plan_key":"month"}'::jsonb)`
    );
    await Promise.all([
      postWebhook(
        paymentEvent({
          eventId: `evt_s_${Date.now()}`,
          orderId: raceOrder2,
          phone: racePhone2,
          paymentStatus: "settled",
        })
      ),
      postWebhook(
        paymentEvent({
          eventId: `evt_p_${Date.now()}`,
          orderId: raceOrder2,
          phone: racePhone2,
          paymentStatus: "paid",
        })
      ),
    ]);
    assertEq(
      Number(
        psqlSuper(
          `SELECT count(*) FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.phone = '${racePhone2}';`,
          { csv: true }
        )
      ),
      1,
      "H-6  settled-first ordering also yields exactly 1 subscription"
    );

    // ── M-6: quota follows the purchased plan ─────────────────────────────
    console.log("\n── M-6: plan linkage ──");
    const subRow = query<[string, string, string]>(
      `SELECT s.plan_id::text, s.token_limit::text, s.plan_id::text FROM subscriptions s ` +
        `JOIN users u ON u.id = s.user_id WHERE u.phone = '${racePhone2}'`
    )[0];
    assertEq(subRow?.[0], "1", "M-6  month plan -> subscription_plans.id 1 (not hardcoded 2)");
    assertEq(subRow?.[1], "100000", "M-6  month plan -> token_limit 100000 (not hardcoded 500000)");

    // M-6 quarter plan: the earlier quarter row was wiped by truncateAll(), so
    // seed a fresh quarter order here rather than querying stale state.
    const m6OrderQ = `250130M6Q${Date.now().toString().slice(-5)}`;
    const m6PhoneQ = "6281299900012";
    psqlSuper(
      `INSERT INTO onboarding_snapshots (tenant_id, phone, order_id, snapshot) VALUES ` +
        `('thrivin', '${m6PhoneQ}', '${m6OrderQ}', '{"plan_key":"quarter"}'::jsonb)`
    );
    await postWebhook(
      paymentEvent({
        eventId: `evt_m6q_${Date.now()}`,
        orderId: m6OrderQ,
        phone: m6PhoneQ,
        paymentStatus: "paid",
      })
    );
    const quarterRow = query<[string, string]>(
      `SELECT s.plan_id::text, s.token_limit::text FROM subscriptions s ` +
        `JOIN users u ON u.id = s.user_id WHERE u.phone = '${m6PhoneQ}'`
    )[0];
    assertEq(quarterRow?.[0], "2", "M-6  quarter plan -> subscription_plans.id 2");
    assertEq(quarterRow?.[1], "500000", "M-6  quarter plan -> token_limit 500000");

    // ── H-2: payload whitelist in the inbox ───────────────────────────────
    console.log("\n── H-2: stored payload is a whitelist + hash ──");
    const storedPayload = psqlSuper(
      `SELECT payload::text FROM webhook_events_inbox WHERE fulfillment_key = '${raceOrder2}';`,
      { csv: true }
    );
    assertOk(!storedPayload.includes("Budi Santoso"), "H-2  no customer name in stored payload");
    assertOk(!storedPayload.includes(racePhone2), "H-2  no phone number in stored payload");
    assertOk(!storedPayload.includes("budi@example.com"), "H-2  no email in stored payload");
    assertOk(!storedPayload.includes("Jl. Merdeka"), "H-2  no address in stored payload");
    // JSONB round-trips through Postgres pretty-printed (spaces after ':'), so
        // match with optional whitespace — the earlier no-space regex was a harness bug.
        assertOk(/"?body_sha256"?\s*:\s*"[0-9a-f]{64}"/.test(storedPayload), "H-2  body_sha256 present");
        assertOk(/"?payment_status"?\s*:\s*"(settled|paid)"/.test(storedPayload), "H-2  payment_status kept");

    // ── M-4: no PII in the success log ────────────────────────────────────
    console.log("\n── M-4: success logs carry ids only ──");
    const log = serverLog();
    assertOk(!log.includes(racePhone), "M-4  phone number absent from server log");
    assertOk(!log.includes(racePhone2), "M-4  phone number absent from server log (2nd order)");
    assertOk(!log.includes("Budi Santoso"), "M-4  customer name absent from server log");
    assertOk(/Fulfilment completed event=/.test(log), "M-4  success log emitted with ids");

    // ── H-4: retention purge actually runs ────────────────────────────────
    console.log("\n── H-4: purge_expired_webhook_data() ──");
    psqlSuper(
      "INSERT INTO webhook_events_inbox (tenant_id, source, event_id, event_type, expires_at) " +
        "VALUES ('thrivin','scalev','evt_expired_1','payment.received', now() - interval '1 day'), " +
        "       ('thrivin','scalev','evt_expired_2','payment.received', now() - interval '2 days');"
    );
    psqlSuper(
      "INSERT INTO onboarding_snapshots (tenant_id, phone, order_id, status, expires_at) " +
        "VALUES ('thrivin','6281200000001','exp_1','applied', now() - interval '1 day');"
    );
    const purgeOut = psqlSuper(
      "SELECT 'deleted_inbox=' || deleted_inbox || ' deleted_snapshots=' || deleted_snapshots " +
        "FROM purge_expired_webhook_data();",
      { csv: true }
    );
    console.log(`   purge_expired_webhook_data() → ${purgeOut}`);
    assertOk(/deleted_inbox=[2-9]/.test(purgeOut), "H-4  purge deleted the expired inbox rows");
    assertOk(/deleted_snapshots=[1-9]/.test(purgeOut), "H-4  purge deleted the expired snapshot row");
    const auditRows = psqlSuper(
      "SELECT count(*) FROM purge_audit_log WHERE ran_at > now() - interval '1 minute';",
      { csv: true }
    );
    assertEq(Number(auditRows) >= 1, true, "H-4  every run leaves a purge_audit_log row");
    const backlog = psqlSuper(
      "SELECT expired_inbox_rows::text || '/' || expired_snapshot_rows::text FROM v_webhook_retention_backlog;",
      { csv: true }
    );
    assertEq(backlog, "0/0", "H-4  retention backlog is empty after the purge");

    // ── H-3: disk fallback disabled in production ─────────────────────────
    console.log("\n── H-3: no plaintext PII on disk in production ──");
    const diskFiles = fs.existsSync(DISK_DIR) ? fs.readdirSync(DISK_DIR) : [];
    assertEq(diskFiles.length, 0, "H-3  NODE_ENV=production wrote nothing to the disk fallback dir");
    assertOk(
      !fs.existsSync("/tmp/thrivin-onboarding"),
      "H-3  the /tmp/thrivin-onboarding PII fallback no longer exists"
    );

    // ── H-1: anon key must not masquerade as the service key ──────────────
    console.log("\n── H-1: no anon-key fallback ──");
    stopApp();
    app = await startApp({
      SUPABASE_SERVICE_KEY: undefined,
      SUPABASE_ANON_KEY: ANON_KEY,
    });
    const h1Event = paymentEvent({
      eventId: `evt_h1_${Date.now()}`,
      orderId: `250130H1X${Date.now().toString().slice(-5)}`,
      phone: "6281299900020",
      paymentStatus: "paid",
    });
    // Clear rows created by earlier cases so this assertion isolates H-1
    // (without this, a leftover subscription from the race/M-6 cases made the
    // count 1 and the check failed for the wrong reason).
    truncateAll();
    const h1Res = await postWebhook(h1Event);
    assertOk(h1Res.status >= 500, "H-1  missing service key -> loud failure, not a silent 200", `got ${h1Res.status}`);
    assertEq(countRows("subscriptions"), 0, "H-1  no subscription was silently created");

    console.log("\n==============================================================");
    let failed = 0;
    for (const [status, name] of results) {
      console.log(`${status}  ${name}`);
      if (status === "FAIL") failed++;
    }
    console.log(`${results.length - failed}/${results.length} end-to-end checks passed`);
    if (failed) {
      console.log("\n--- server log (tail) ---");
      console.log(serverLog().split("\n").slice(-40).join("\n"));
      process.exitCode = 1;
    } else {
      console.log("ALL E2E REMEDIATION CHECKS PASSED");
    }
  } finally {
    stopApp();
    mock.stop();
    postgrest.stop();
  }
}

// Match the UI: quarter list price.
const PLAN_QUARTER_PRICE = 231000;

main().catch((err) => {
  console.error("E2E harness error:", err);
  process.exit(1);
});