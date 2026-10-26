/**
 * Probe bukti verifikasi F-S1: replay kunci idempotensi lintas nomor.
 *
 * Menguji skenario nyata di level HTTP:
 * 1. Pelanggan A (6281290000901) menyelesaikan onboarding + consent, lalu create-order.
 *    -> Sukses 200, menerima orderId + paymentUrl.
 * 2. Pelanggan B (6281290000902) dengan sesi WA valid miliknya sendiri, mencoba
 *    memanggil create-order menggunakan kunci idempotensi milik Pelanggan A.
 *    -> SEBELUM FIX (bukti Sentinel t_07db887d): bocor 200 replay:true dengan order A.
 *    -> SESUDAH FIX (F-S1): ditolak 409 IDEMPOTENCY_KEY_CONFLICT, NOL kebocoran orderId/paymentUrl.
 * 3. Kontrol: Pelanggan B dengan kunci miliknya sendiri tetapi belum onboarding
 *    -> 400 INCOMPLETE_ONBOARDING (gate berfungsi normal).
 *
 * Run: node --experimental-strip-types tests/test-probe-cross-phone.mts
 */
import fs from "fs";
import path from "path";
import { spawn, execFileSync } from "child_process";
import {
  POSTGREST_URL,
  PORTS,
  SERVICE_KEY,
  assertMockOwner,
  startPostgrest,
  psqlSuper,
  tmpPath,
} from "./harness/stack.mts";
import {
  DEFAULT_WA_SESSION_SECRET,
  armCheckout,
  waSessionCookie,
} from "./helpers/checkout-arm.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.join(HERE, "..");
const APP_PORT = Number(process.env.HARNESS_PROBE_APP_PORT || PORTS.probeApp);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || PORTS.probeMock);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
// Path /tmp di-prefix worktree (RX2-2): dua run paralel tidak boleh saling timpa.
const ORDERS_FILE = tmpPath("probe-orders.json");
const LOG = tmpPath("probe.log");

const A = "6281290000901";
const B = "6281290000902";

async function waitFor(url: string, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function postJson(base: string, pathname: string, cookie: string | null, body: unknown) {
  const ip = `10.88.${(Date.now() % 200) + 1}.${(Date.now() % 250) + 1}`;
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  console.log("── Setup test probe F-S1 ──");
  if (fs.existsSync(ORDERS_FILE)) try { fs.unlinkSync(ORDERS_FILE); } catch {}
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  psqlSuper("TRUNCATE consent_events, onboarding_progress, checkout_claims RESTART IDENTITY CASCADE;");

  const postgrest = await startPostgrest();
  const mock = spawn(process.execPath, [path.join(HERE, "mock-scalev.mjs"), String(MOCK_PORT)], {
    env: { ...process.env, MOCK_SCALEV_PORT: String(MOCK_PORT), MOCK_SCALEV_ORDERS_FILE: ORDERS_FILE, MOCK_SCALEV_REDIRECT_URL: "https://thrivin.id/pembayaran/sukses" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await assertMockOwner(MOCK_PORT, mock.pid);
  const logFd = fs.openSync(LOG, "w");
  const app = spawn("./node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    cwd: REPO,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      SUPABASE_URL: POSTGREST_URL,
      SUPABASE_SERVICE_KEY: SERVICE_KEY,
      THRIVIN_TENANT_ID: "thrivin",
      WA_SESSION_SECRET: DEFAULT_WA_SESSION_SECRET,
      WA_SESSION_EPOCH: "0",
      SCALEV_API_KEY: "mock-scalev-key-not-real",
      SCALEV_PAGE_API_KEY: "ppk_test_key",
      SCALEV_API_BASE_URL: MOCK_URL,
    } as Record<string, string>,
    stdio: ["ignore", logFd, logFd],
  });

  try {
    await waitFor(`${APP_URL}/privacy`);

    // ── 1. Nomor A: lengkap (progress + consent), buat order pertama ──
    const armedA = await armCheckout({ base: APP_URL, phone: A, cookie: waSessionCookie(A) });
    const orderA = await postJson(APP_URL, "/api/scalev/create-order", waSessionCookie(A), {
      planId: "quarter",
      customerPhone: A,
      idempotencyKey: armedA.idempotencyKey,
    });
    console.log("A create-order:", orderA.status, JSON.stringify(orderA.body));
    if (orderA.status !== 200 || !orderA.body?.orderId) {
      throw new Error(`A gagal membuat order: ${JSON.stringify(orderA)}`);
    }

    // ── 2. Nomor B: sesi B valid, tapi kirim idempotencyKey milik A ──
    const orderB = await postJson(APP_URL, "/api/scalev/create-order", waSessionCookie(B), {
      planId: "quarter",
      customerPhone: B,
      idempotencyKey: armedA.idempotencyKey,
    });
    console.log("B (pakai kunci A):", orderB.status, JSON.stringify(orderB.body));

    // Verifikasi F-S1:
    // Status wajib 409
    // Code wajib IDEMPOTENCY_KEY_CONFLICT
    // TIDAK BOLEH ada orderId atau paymentUrl
    const passed409 = orderB.status === 409;
    const passedCode = orderB.body?.code === "IDEMPOTENCY_KEY_CONFLICT";
    const noLeak = !orderB.body?.orderId && !orderB.body?.paymentUrl;

    if (passed409 && passedCode && noLeak) {
      console.log(">>> [PROBE F-S1 PASS] Kunci lintas nomor berhasil ditolak 409 IDEMPOTENCY_KEY_CONFLICT (0 data bocor)");
    } else {
      // JANGAN process.exit() di dalam try (RX2-3): exit melewati `finally`,
      // jadi `next start` + mock tetap LISTEN dan mencemari run berikutnya.
      // Lempar ke main().catch supaya finally tetap mematikan anak proses.
      throw new Error(
        `PROBE F-S1 FAIL: order lintas nomor TIDAK ditolak dengan benar ` +
          `(409=${passed409} code=${passedCode} tanpa-bocor=${noLeak}) ` +
          `— status ${orderB.status} body ${JSON.stringify(orderB.body)}`
      );
    }

    // ── 3. Kontrol: Nomor B dengan kunci miliknya sendiri ──
    const bKeyDummy = "co-bbbb-0000-0000-0000-000000000000";
    const orderBctl = await postJson(APP_URL, "/api/scalev/create-order", waSessionCookie(B), {
      planId: "quarter",
      customerPhone: B,
      idempotencyKey: bKeyDummy,
    });
    console.log("B (kunci sendiri, kontrol):", orderBctl.status, JSON.stringify(orderBctl.body));
    if (orderBctl.status !== 400 || orderBctl.body?.code !== "INCOMPLETE_ONBOARDING") {
      throw new Error(`Kontrol B tidak sesuai ekspektasi: ${JSON.stringify(orderBctl)}`);
    }
    console.log(">>> [PROBE F-S1 KONTROL PASS] Kontrol B ditolak 400 INCOMPLETE_ONBOARDING");
  } finally {
    try { app.kill("SIGKILL"); } catch {}
    try { mock.kill("SIGKILL"); } catch {}
    try { postgrest?.stop(); } catch {}
  }
}

main().catch((err) => {
  console.error("Probe error:", err);
  // exitCode, bukan process.exit(): biarkan stdio flush dan jangan lompati
  // teardown. Anak proses sudah dimatikan di `finally` (RX2-3).
  process.exitCode = 1;
});
