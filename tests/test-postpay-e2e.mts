/**
 * End-to-end checks for the purchase/postpaid outbound path (kartu t_ef348cbc):
 * WhatsApp Cloud only, no Baileys, plus the static thank-you page.
 *
 *   node --experimental-strip-types tests/test-postpay-e2e.mts
 *
 * Stack: real Next.js -> real PostgREST -> real Postgres, with LOCAL mocks for
 * Scalev (tests/mock-scalev.mjs), Meta Graph, and the old Baileys bridge. The
 * bridge mock is the negative control: it must receive ZERO requests even while
 * WHATSAPP_BRIDGE_URL is still configured, which is exactly the bug that used
 * to make greetings arrive from the old number.
 */
import crypto from "crypto";
import fs from "fs";
import http from "http";
import path from "path";
import { spawn, type ChildProcess, execFileSync } from "child_process";
import {
  ANON_KEY,
  SERVICE_KEY,
  POSTGREST_URL,
  PORTS,
  assertMockOwner,
  startPostgrest,
  tmpPath,
  truncateAll,
  countRows,
} from "./harness/stack.mts";
import {
  DEFAULT_WA_SESSION_SECRET,
  armCheckout,
  waSessionCookie,
} from "./helpers/checkout-arm.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const WEBHOOK_SECRET = "test_postpay_secret_6789";
const APP_PORT = Number(process.env.HARNESS_APP_PORT || PORTS.w4App);
const GRAPH_PORT = Number(process.env.HARNESS_GRAPH_PORT || PORTS.w4Broken);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || PORTS.w4Mock);
const BRIDGE_PORT = Number(process.env.HARNESS_BRIDGE_PORT || PORTS.probeMock);

const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
const GRAPH_URL = `http://127.0.0.1:${GRAPH_PORT}`;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;

/** Official Meta binding used by the app under test. */
const PHONE_NUMBER_ID = "109999000111";
const OFFICIAL_DISPLAY = "6285165581209";
const REDIRECT_TARGET = "https://thrivin.id/pembayaran/sukses";

const ORDERS_FILE = tmpPath("postpay-orders.json");
const GRAPH_MODE_FILE = tmpPath("postpay-graph-mode.txt");
const DISK_DIR = tmpPath("e2e-postpay");
const LOG_FILE = tmpPath("postpay-server.log");

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

function sign(rawBody: string): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("base64");
}

async function waitFor(url: string, timeoutMs = 40000): Promise<Response> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return res;
      last = `status ${res.status}`;
    } catch (err: any) {
      last = err?.message || String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}: ${last}`);
}

// ── POST /v3/orders mock (Scalev) ───────────────────────────────────────────
async function startMockScalev(): Promise<{ stop: () => void }> {
  const child = spawn(process.execPath, [path.join(HERE, "mock-scalev.mjs"), String(MOCK_PORT)], {
    env: {
      ...process.env,
      MOCK_SCALEV_ORDERS_FILE: ORDERS_FILE,
      MOCK_SCALEV_REDIRECT_URL: REDIRECT_TARGET,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(`[mock-scalev] ${d}`));
  await assertMockOwner(MOCK_PORT, child.pid);
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

// ── Graph mock (records every Cloud call) ──────────────────────────────────
interface GraphCall {
  url: string;
  authorization: string;
  body: any;
}
const graphCalls: GraphCall[] = [];
let graphMode: "ok" | "500" | "131047" = "ok";

async function startGraphMock(): Promise<{ stop: () => void; port: number }> {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body: any = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      graphCalls.push({ url: req.url || "", authorization: req.headers.authorization || "", body });
      const send = (status: number, payload: unknown) => {
        const text = JSON.stringify(payload);
        res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
        res.end(text);
      };
      // Mode is read from disk on every request so the suite can flip it
      // without restarting the app or the mock.
      let mode = "ok";
      try {
        mode = fs.readFileSync(GRAPH_MODE_FILE, "utf-8").trim() || "ok";
      } catch {
        /* default ok */
      }
      graphMode = mode as typeof graphMode;
      if (mode === "500") return send(500, { error: { code: 1, message: "mock graph down" } });
      if (mode === "131047") return send(400, { error: { code: 131047, message: "Re-engagement" } });
      return send(200, { messages: [{ id: `wamid.MOCK${graphCalls.length}` }] });
    });
  });
  await new Promise<void>((resolve) => server.listen(GRAPH_PORT, "127.0.0.1", resolve));
  fs.writeFileSync(GRAPH_MODE_FILE, "ok");
  return {
    port: GRAPH_PORT,
    stop: () => {
      server.close();
    },
  };
}

// ── Old Baileys bridge mock (negative control: must stay at zero) ──────────
let bridgeHits = 0;
async function startBridgeMock(): Promise<{ stop: () => void }> {
  const server = http.createServer((req, res) => {
    bridgeHits += 1;
    req.resume();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messageId: "from-bridge" }));
  });
  await new Promise<void>((resolve) => server.listen(BRIDGE_PORT, "127.0.0.1", resolve));
  return {
    stop: () => {
      server.close();
    },
  };
}

interface Stack {
  stop: () => void;
}

/** Start the built Next.js app. `undefined` means "do not set". */
async function startApp(env: Record<string, string | undefined>): Promise<Stack> {
  try {
    fs.truncateSync(LOG_FILE, 0);
  } catch {
    /* ignore */
  }
  const logFd = fs.openSync(LOG_FILE, "a");
  const merged: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    SUPABASE_URL: POSTGREST_URL,
    SUPABASE_SERVICE_KEY: SERVICE_KEY,
    SUPABASE_ANON_KEY: ANON_KEY,
    ONBOARDING_DATA_DIR: DISK_DIR,
    SCALEV_API_BASE_URL: MOCK_URL,
    SCALEV_STORE_ID: "store_test",
    SCALEV_API_KEY: "sk_test_key",
    WA_SESSION_SECRET: DEFAULT_WA_SESSION_SECRET,
    WA_SESSION_EPOCH: "0",
    // The legacy bridge stays configured on purpose: zero calls is the point.
    WHATSAPP_BRIDGE_URL: BRIDGE_URL,
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
    WHATSAPP_CLOUD_ACCESS_TOKEN: "test_cloud_token",
    WHATSAPP_CLOUD_API_VERSION: "v21.0",
    WHATSAPP_CLOUD_GRAPH_URL: GRAPH_URL,
    SCALEV_STOREFRONT_API_KEY: "sfa_test_key",
    ...env,
  };
  // undefined must really mean "unset", not the string "undefined".
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  const child: ChildProcess = spawn("./node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    cwd: REPO,
    env: merged as NodeJS.ProcessEnv,
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

function paymentEvent(opts: { eventId: string; orderId: string; phone: string }) {
  return {
    event: "payment.received",
    unique_id: opts.eventId,
    timestamp: new Date().toISOString(),
    data: {
      id: `01948092-9b80-7f91-b23d-${opts.orderId}`,
      order_id: opts.orderId,
      payment_status: "paid",
      gross_revenue: "219000.00",
      customer_phone: opts.phone,
      customer_name: "Siti Uji",
      customer: { name: "Siti Uji", phone: opts.phone },
    },
  };
}

async function postWebhook(body: unknown): Promise<Response> {
  const raw = JSON.stringify(body);
  return fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Scalev-Hmac-Sha256": sign(raw) },
    body: raw,
  });
}

async function main() {
  fs.rmSync(DISK_DIR, { recursive: true, force: true });
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  const postgrest = await startPostgrest();
  if (!postgrest) {
    console.error("PostgREST binary missing — cannot run the e2e suite.");
    process.exit(1);
  }
  const scalev = await startMockScalev();
  const graph = await startGraphMock();
  const bridge = await startBridgeMock();

  let app: Stack | null = null;
  const stopApp = () => {
    app?.stop();
    app = null;
  };

  try {
    truncateAll();
    app = await startApp({ SCALEV_WEBHOOK_SECRET: WEBHOOK_SECRET });

    // ── 1. paid webhook → Cloud greeting with the official phone-number-id ──
    console.log("\n── Cloud-only greeting (phone-number-id from config) ──");
    const phone1 = "6281270000001";
    const evt1 = paymentEvent({ eventId: `evt_postpay_1_${Date.now()}`, orderId: "250130PAY0001", phone: phone1 });
    const res1 = await postWebhook(evt1);
    const body1 = await res1.json();
    assertEq(res1.status, 200, "webhook paid accepted");
    assertEq(body1.welcomeSent, true, "greeting reported as sent");
    assertEq(graphCalls.length, 1, `exactly one Graph call (got ${graphCalls.length})`);
    assertEq(
      graphCalls[0]?.url,
      `/v21.0/${PHONE_NUMBER_ID}/messages`,
      "Graph path carries the configured phone-number-id"
    );
    assertEq(graphCalls[0]?.body?.to, phone1, "greeting addressed to the buyer (MSISDN, no JID)");
    assertEq(graphCalls[0]?.body?.type, "text", "first try is a free-form text inside the window");
    assertEq(graphCalls[0]?.authorization, "Bearer test_cloud_token", "Cloud access token used");
    assertEq(bridgeHits, 0, "ZERO Baileys/bridge calls while WHATSAPP_BRIDGE_URL is still set");
    assertEq(countRows("subscriptions"), 1, "subscription activated");

    // ── 2. duplicate delivery → no second send ──────────────────────────────
    console.log("\n── duplicate webhook does not double-send ──");
    const res2 = await postWebhook(evt1);
    const body2 = await res2.json();
    assertEq(res2.status, 200, "duplicate acknowledged with 200 (Scalev stops retrying)");
    assertOk(body2.welcomeSent !== true, "duplicate delivery does not claim a send");
    assertEq(graphCalls.length, 1, `still exactly one Graph call (got ${graphCalls.length})`);
    assertEq(bridgeHits, 0, "bridge still untouched");

    // ── 3. outbound failure must not roll back activation ───────────────────
    console.log("\n── outbound failure: recorded, activation kept ──");
    fs.writeFileSync(GRAPH_MODE_FILE, "500");
    const phone3 = "6281270000003";
    const res3 = await postWebhook(
      paymentEvent({ eventId: `evt_postpay_3_${Date.now()}`, orderId: "250130PAY0003", phone: phone3 })
    );
    const body3 = await res3.json();
    assertEq(res3.status, 200, "webhook still 200 when Graph fails");
    assertEq(body3.welcomeSent, false, "greeting recorded as NOT sent");
    assertEq(graphCalls.length, 2, "the send was attempted through Cloud (exactly once)");
    assertEq(bridgeHits, 0, "failed Cloud send does NOT fall back to the bridge");
    assertEq(countRows("subscriptions"), 2, "activation NOT rolled back by the failed greeting");
    assertOk(
      /Cloud send failed/.test(serverLog()),
      "failure is logged for ops",
      "no 'Cloud send failed' line in the server log"
    );

    // ── 4. 24h window closed and no template → recorded failure ─────────────
    console.log("\n── 24h window closed without an approved template ──");
    fs.writeFileSync(GRAPH_MODE_FILE, "131047");
    const phone4 = "6281270000004";
    const res4 = await postWebhook(
      paymentEvent({ eventId: `evt_postpay_4_${Date.now()}`, orderId: "250130PAY0004", phone: phone4 })
    );
    const body4 = await res4.json();
    assertEq(body4.welcomeSent, false, "no template configured -> not sent");
    assertEq(graphCalls.length, 3, "one text attempt, no second channel");
    assertEq(bridgeHits, 0, "no bridge fallback on 131047");
    assertEq(countRows("subscriptions"), 3, "activation still granted");
    assertOk(
      /no approved welcome template configured/.test(serverLog()),
      "131047 without template is logged",
      "log line missing"
    );
    fs.writeFileSync(GRAPH_MODE_FILE, "ok");

    // ── 5. thank-you page: static, safe on direct access, correct WA link ───
    console.log("\n── /pembayaran/sukses direct access ──");
    const subsBefore = countRows("subscriptions");
    const usersBefore = countRows("users");
    const page = await fetch(
      `${BASE_URL}/pembayaran/sukses?order_id=250130PAY0001&status=paid&activate=1&phone=6281270000001`
    );
    const html = await page.text();
    assertEq(page.status, 200, "page renders on direct access");
    assertOk(html.includes(`https://wa.me/${OFFICIAL_DISPLAY}`), "WA link points at the official Nina number");
    assertOk(html.includes("Chat Nina di WhatsApp"), "CTA copy present", "CTA missing");
    assertOk(
      !html.includes(`${BASE_URL}/api/scalev/webhook`) && !html.includes("X-Scalev-Hmac-Sha256"),
      "page does not reference the activation webhook"
    );
    assertEq(countRows("subscriptions"), subsBefore, "direct access activates nothing");
    assertEq(countRows("users"), usersBefore, "direct access creates/claims no user");
    assertEq(graphCalls.length, 3, "direct access sends no WhatsApp message");
    assertEq(bridgeHits, 0, "direct access touches no bridge");

    // ── 6. create-order surfaces Scalev's canonical redirect_url ────────────
    console.log("\n── create-order redirect per Scalev contract ──");
    const phone6 = "6281270000006";
    const cookie6 = waSessionCookie(phone6);
    const arm6 = await armCheckout({ base: BASE_URL, phone: phone6, cookie: cookie6 });
    const orderRes = await fetch(`${BASE_URL}/api/scalev/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.77.1.1", cookie: cookie6 },
      body: JSON.stringify({ planId: "quarter", customerPhone: phone6, idempotencyKey: arm6.idempotencyKey }),
    });
    const orderJson = await orderRes.json();
    assertEq(orderRes.status, 200, "order created");
    assertEq(orderJson.redirectUrl, REDIRECT_TARGET, "response carries redirect_url from the public order read");
    assertOk(
      typeof orderJson.paymentUrl === "string" && orderJson.paymentUrl.length > 0,
      "paymentUrl kept for older responses",
      `paymentUrl=${JSON.stringify(orderJson.paymentUrl)}`
    );

    // ── 7. half-configured Cloud binding fails safe (no other channel) ──────
    console.log("\n── Cloud binding broken: fail safe ──");
    stopApp();
    app = await startApp({ SCALEV_WEBHOOK_SECRET: WEBHOOK_SECRET, WHATSAPP_CLOUD_ACCESS_TOKEN: undefined });
    const callsBefore = graphCalls.length;
    const bridgeBefore = bridgeHits;
    const phone7 = "6281270000007";
    const res7 = await postWebhook(
      paymentEvent({ eventId: `evt_postpay_7_${Date.now()}`, orderId: "250130PAY0007", phone: phone7 })
    );
    const body7 = await res7.json();
    assertEq(res7.status, 200, "webhook still 200 without a Cloud token");
    assertEq(body7.welcomeSent, false, "greeting not sent");
    assertEq(graphCalls.length, callsBefore, "zero Graph calls with a half binding");
    assertEq(bridgeHits, bridgeBefore, "zero bridge calls with a half binding");
    assertEq(countRows("subscriptions"), subsBefore + 1, "activation still granted");
    assertOk(
      /WhatsApp Cloud binding not configured/.test(serverLog()),
      "missing binding is logged",
      "log line missing"
    );

    console.log("\n==============================================================");
    let failed = 0;
    for (const [status, name] of results) {
      console.log(`${status}  ${name}`);
      if (status === "FAIL") failed++;
    }
    console.log(`${results.length - failed}/${results.length} postpay checks passed`);
    if (failed) {
      console.log("\n--- server log (tail) ---");
      console.log(serverLog().split("\n").slice(-40).join("\n"));
      process.exitCode = 1;
    } else {
      console.log("ALL POSTPAY CLOUD-ONLY CHECKS PASSED");
    }
  } finally {
    stopApp();
    scalev.stop();
    graph.stop();
    bridge.stop();
    postgrest.stop();
  }
}

main().catch((err) => {
  console.error("E2E harness error:", err);
  process.exit(1);
});
