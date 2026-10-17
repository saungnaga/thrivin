/**
 * End-to-end F-W4-1c: cancel order Scalev saat TTL retire — kartu t_1d1cf77f.
 *
 *   node --experimental-strip-types tests/test-cancel-ttl-e2e.mts
 *
 * Stack: Next.js (build produksi) -> HTTP -> PostgREST -> Postgres lokal, dengan
 * mock Scalev lokal (tests/mock-scalev.mjs) yang punya jalur cancel. Nol Scalev
 * nyata, nol staging, nol data customer. Mode hasil upstream diubah lewat FILE
 * (MOCK_SCALEV_CANCEL_MODE_FILE) supaya tiap kelas hasil bisa diuji tanpa
 * me-restart mock.
 *
 * Bukti per bagian:
 *   1  sukses cancel + ID canonical (bukan order_id bisnis) + key cancel terpisah
 *   2  429 ⇒ TAHAN, retry bounded, replacement TIDAK lahir; lalu sukses ⇒ replacement
 *   3  batch multi-ID + 200 parsial ⇒ TAHAN (verifikasi per-ID load-bearing)
 *   4  400 terminal ⇒ cancel_failed + 423, tanpa retry
 *   5  408 tak terdaftar ⇒ TAHAN (bukan terminal) — M-5
 *   6  timeout 5 s ⇒ TAHAN, nol order baru
 *   7  401 ⇒ breaker global (bukan lockout per nomor); restart memulihkan
 *   8  key cancel kosong ⇒ fail-closed, nol panggilan Scalev
 *   9  late webhook ⇒ akses tetap + tanda duplikat + nol aktivasi kedua
 *  10  lease ≥ jendela worker sendiri (V-3) + backoff benar-benar dibaca (V-4)
 *  11  sapuan MENEMUKAN order basi yang tak dikunjungi ulang (V-1)
 *  12  batch campuran: baris tanpa canonical ID ⇒ cancel_failed, BUKAN retired (V-2)
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import {
  POSTGREST_URL,
  SERVICE_KEY,
  PORTS,
  assertMockOwner,
  startPostgrest,
  psqlSuper,
  tmpPath,
  truncateAll,
} from "./harness/stack.mts";
import {
  DEFAULT_WA_SESSION_SECRET,
  armCheckout,
  newIdempotencyKey,
  waSessionCookie,
} from "./helpers/checkout-arm.mts";
import {
  CANCEL_BACKOFF_MS,
  CANCEL_MAX_ATTEMPTS,
  CANCEL_TIMEOUT_MS,
} from "../src/lib/checkout-cancel.ts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const WEBHOOK_SECRET = "test_scalev_secret_cancel_12345";
const CREATE_KEY = "sk_test_create_key";
const CANCEL_KEY = "sk_cancel_only_key_test";

const APP_PORT = Number(process.env.HARNESS_CANCEL_APP_PORT || PORTS.cancelApp);
const BROKEN_PORT = Number(process.env.HARNESS_CANCEL_BROKEN_PORT || PORTS.cancelBroken);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || PORTS.cancelMock);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const BROKEN_URL = `http://127.0.0.1:${BROKEN_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

const ORDERS_FILE = process.env.MOCK_SCALEV_ORDERS_FILE || tmpPath("cancel-orders.json");
const CANCEL_FILE = process.env.MOCK_SCALEV_CANCEL_FILE || tmpPath("cancel-calls.json");
const MODE_FILE = process.env.MOCK_SCALEV_CANCEL_MODE_FILE || tmpPath("cancel-mode.txt");
const LOG = tmpPath("cancel-server.log");
const BROKEN_LOG = tmpPath("cancel-broken.log");

const P = {
  happy: "6281200000901",
  retry: "6281200000902",
  multi: "6281200000903",
  terminal: "6281200000904",
  unregistered: "6281200000905",
  timeout: "6281200000906",
  breaker: "6281200000907",
  breakerTwo: "6281200000908",
  nokey: "6281200000909",
  lease: "6281200000910",
  sweep: "6281200000911",
  sweepFresh: "6281200000912",
  mixed: "6281200000913",
  mixedLegacy: "6281200000914",
};

/** V-3: lantai lease diturunkan dari konstanta worker (bukan angka pilihan sendiri). */
const LEASE_FLOOR_MS =
  CANCEL_MAX_ATTEMPTS * CANCEL_TIMEOUT_MS + CANCEL_BACKOFF_MS.reduce((a, b) => a + b, 0);
const SWEEP_STATE_DIR = tmpPath("sweep-state");

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

async function startMock(): Promise<Stack> {
  fs.writeFileSync(MODE_FILE, "ok");
  fs.writeFileSync(CANCEL_FILE, "[]");
  const child: any = spawn(process.execPath, [path.join(HERE, "mock-scalev.mjs"), String(MOCK_PORT)], {
    env: {
      ...process.env,
      MOCK_SCALEV_ORDERS_FILE: ORDERS_FILE,
      MOCK_SCALEV_CANCEL_MODE_FILE: MODE_FILE,
      MOCK_SCALEV_CANCEL_FILE: CANCEL_FILE,
    } as Record<string, string>,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(`[mock-scalev] ${d}`));
  await assertMockOwner(MOCK_PORT, child.pid);
  await waitFor(`${MOCK_URL}/v3/stores/x/products`);
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

async function startApp(
  env: Record<string, string | undefined> = {},
  port: number = APP_PORT,
  logFile: string = LOG
): Promise<Stack> {
  try {
    fs.truncateSync(logFile, 0);
  } catch {}
  const logFd = fs.openSync(logFile, "a");
  const merged: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    SUPABASE_URL: POSTGREST_URL,
    SUPABASE_SERVICE_KEY: SERVICE_KEY,
    THRIVIN_TENANT_ID: "thrivin",
    WA_SESSION_SECRET: DEFAULT_WA_SESSION_SECRET,
    WA_SESSION_EPOCH: "0",
    WA_OTP_MOCK_ALLOW_IN_PRODUCTION: "1",
    SCALEV_API_BASE_URL: MOCK_URL,
    SCALEV_STORE_ID: "store_test",
    SCALEV_API_KEY: CREATE_KEY,
    SCALEV_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SCALEV_CANCEL_API_KEY: CANCEL_KEY,
    WHATSAPP_BRIDGE_URL: "http://127.0.0.1:59997",
    ...env,
  };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  const child = spawn("./node_modules/.bin/next", ["start", "-p", String(port)], {
    cwd: REPO,
    env: merged as Record<string, string>,
    stdio: ["ignore", logFd, logFd],
  });
  await waitFor(`http://127.0.0.1:${port}/privacy`);
  return {
    stop: () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    },
  };
}

function setMode(mode: string) {
  fs.writeFileSync(MODE_FILE, mode);
}

/**
 * Jalankan sapuan TERJADWAL yang asli (`staging/cancel-sweep.mts`) sebagai proses
 * terpisah dengan env sesi ini — inilah jalur yang jalan dari crontab, jadi
 * nominasi (V-1) benar-benar ikut diuji, bukan hanya worker-nya.
 */
async function runSweep(
  env: Record<string, string | undefined> = {}
): Promise<{ status: number | null; out: string }> {
  const merged: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SUPABASE_URL: POSTGREST_URL,
    SUPABASE_SERVICE_KEY: SERVICE_KEY,
    THRIVIN_TENANT_ID: "thrivin",
    SCALEV_API_BASE_URL: MOCK_URL,
    SCALEV_STORE_ID: "store_test",
    SCALEV_CANCEL_API_KEY: CANCEL_KEY,
    CANCEL_SWEEP_STATE_DIR: SWEEP_STATE_DIR,
    ...env,
  };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", path.join(REPO, "staging/cancel-sweep.mts")],
    { cwd: REPO, env: merged as Record<string, string>, stdio: ["ignore", "pipe", "pipe"] }
  );
  let out = "";
  child.stdout.on("data", (d) => (out += String(d)));
  child.stderr.on("data", (d) => (out += String(d)));
  const status = await new Promise<number | null>((resolve) =>
    child.on("exit", (code) => resolve(code))
  );
  return { status, out };
}
function mockOrders(): any[] {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}
function mockOrderCount(): number {
  return mockOrders().length;
}
function cancelCalls(): any[] {
  try {
    return JSON.parse(fs.readFileSync(CANCEL_FILE, "utf-8"));
  } catch {
    return [];
  }
}
function serverLog(file: string = LOG): string {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return "";
  }
}
function sig(body: string): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("base64");
}
function sha8(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
}

async function postJson(
  base: string,
  pathname: string,
  cookie: string | null,
  body: unknown
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.88.${(Date.now() % 200) + 1}.${(Date.now() % 250) + 1}`,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  return { status: res.status, body: parsed };
}

function createOrder(
  phone: string,
  idempotencyKey: string,
  planId = "quarter",
  base: string = APP_URL
) {
  return postJson(base, "/api/scalev/create-order", waSessionCookie(phone), {
    planId,
    customerPhone: phone,
    idempotencyKey,
  });
}

function ageClaims(phone: string, minutes = 61): void {
  psqlSuper(
    `update checkout_claims set created_at = now() - interval '${minutes} minutes' where phone='${phone}'`
  );
}

function claimField(phone: string, field: string): string {
  return psqlSuper(`select coalesce(${field}::text,'') from checkout_claims where phone='${phone}' order by created_at limit 1`, {
    csv: true,
  });
}

/**
 * V-4: backoff 30 s adalah perilaku yang DIINGINKAN (jangan menggedor Scalev tiap
 * klik pelanggan), jadi uji yang ingin membuktikan "upstream sudah normal lagi"
 * memajukan jamnya, bukan menunggu 30 detik. Efek gerbangnya sendiri dikunci di §10.
 */
function clearCancelBackoff(phone: string): void {
  psqlSuper(
    `update checkout_claims set cancel_next_retry_at = now() - interval '1 second' where phone='${phone}' and status='cancel_pending'`
  );
}

async function main() {
  const postgrest = await startPostgrest();
  const mock = await startMock();
  let app = await startApp();
  try {
    truncateAll();

    // ═══ 1. Sukses: cancel dulu, baru replacement ═══════════════════════════
    section("1. cancel sukses: ID canonical + key terpisah + replacement boleh");
    {
      const arm = await armCheckout({ base: APP_URL, phone: P.happy, cookie: waSessionCookie(P.happy) });
      const first = await createOrder(P.happy, arm.idempotencyKey);
      assertEq(first.status, 200, "pra-syarat: order pertama ⇒ 200");
      const uuidA = String(first.body?.uuid || "");
      const orderIdA = String(first.body?.orderId || "");
      assertOk(uuidA.startsWith("uuid_"), "pra-syarat: respons mock punya canonical id terpisah", uuidA);
      assertOk(orderIdA.startsWith("test_"), "pra-syarat: nomor bisnis beda bentuk dari canonical id", orderIdA);
      assertEq(
        psqlSuper(
          `select scalev_order_uuid || '|' || order_id from checkout_claims where phone='${P.happy}'`,
          { csv: true }
        ),
        `${uuidA}|${orderIdA}`,
        "kolom canonical + nomor bisnis DISIMPAN TERPISAH (B-1)"
      );

      ageClaims(P.happy);
      const beforeCreate = mockOrderCount();
      const beforeCancel = cancelCalls().length;
      const second = await createOrder(P.happy, newIdempotencyKey("fw41c-happy"));
      assertEq(second.status, 200, "checkout setelah TTL ⇒ 200 (cancel sukses lebih dulu)");
      assertEq(mockOrderCount() - beforeCreate, 1, "... tepat SATU order pengganti dicetak");
      assertOk(second.body?.orderId !== first.body?.orderId, "... dan itu order yang BERBEDA");

      const calls = cancelCalls();
      assertEq(calls.length - beforeCancel, 1, "cancel dipanggil SEKALI (idempoten, bukan dua kali)");
      const call = calls[calls.length - 1];
      assertEq(call?.ids, [uuidA], "yang dikirim = canonical UUID dari Scalev, BUKAN order_id bisnis (B-1)");
      assertEq(call?.status, "canceled", "body cancel memakai status=canceled");
      assertEq(call?.by, "thrivin-checkout-ttl", "body cancel memakai penanda `by`");
      assertEq(call?.authSha8, sha8(`Bearer ${CANCEL_KEY}`), "cancel memakai KEY CANCEL terpisah");
      assertOk(call?.authSha8 !== sha8(`Bearer ${CREATE_KEY}`), "... bukan key create-order");

      assertEq(
        psqlSuper(`select status from checkout_claims where scalev_order_uuid='${uuidA}'`, { csv: true }),
        "retired",
        "baris order lama jadi `retired`"
      );
      assertEq(
        psqlSuper(
          `select (payment_url is null) || '|' || (canceled_at is not null) || '|' || order_id from checkout_claims where scalev_order_uuid='${uuidA}'`,
          { csv: true }
        ),
        `true|true|${orderIdA}`,
        "retired: payment_url dibuang, canceled_at terisi, order_id DIPERTAHANKAN (join webhook)"
      );
      const replay = await createOrder(P.happy, arm.idempotencyKey);
      assertEq(replay.status, 200, "replay kunci LAMA ⇒ 200 (kunci dipakai ulang untuk klaim baru)");
      assertEq(replay.body?.orderId, second.body?.orderId, "... dijawab dengan order HIDUP yang ada (bukan link mati, bukan order ketiga)");
      assertEq(mockOrderCount() - beforeCreate, 1, "... tidak ada order ketiga");

      const cancelLogs = serverLog()
        .split("\n")
        .filter((l) => l.includes("[checkout-cancel]"));
      assertOk(cancelLogs.length > 0, "log cancel ada (audit)");
      assertOk(
        cancelLogs.every((l) => !l.includes(P.happy) && !l.includes(orderIdA)),
        "log cancel nol PII: tanpa nomor pelanggan / nomor order bisnis"
      );
    }

    // ═══ 2. Transient 429: TAHAN + retry bounded, replacement tidak lahir ══
    section("2. 429 ⇒ TAHAN + retry bounded; replacement tertahan");
    {
      setMode("ok");
      const arm = await armCheckout({ base: APP_URL, phone: P.retry, cookie: waSessionCookie(P.retry) });
      const first = await createOrder(P.retry, arm.idempotencyKey);
      assertEq(first.status, 200, "pra-syarat: order pertama ⇒ 200");
      ageClaims(P.retry);

      setMode("429");
      const beforeCreate = mockOrderCount();
      const beforeCancel = cancelCalls().length;
      const blocked = await createOrder(P.retry, newIdempotencyKey("fw41c-429"));
      assertEq(blocked.status, 409, "429 upstream ⇒ checkout DITAHAN (409)");
      assertEq(blocked.body?.code, "ORDER_CANCEL_PENDING", "... kode ORDER_CANCEL_PENDING");
      assertOk(!blocked.body?.orderId && !blocked.body?.paymentUrl, "... tanpa orderId/paymentUrl");
      assertEq(mockOrderCount(), beforeCreate, "... nol order baru dicetak");

      const calls = cancelCalls().slice(beforeCancel);
      assertEq(calls.length, 3, "retry bounded: 3 attempt total (1 + 2 retry, M-1)");
      assertEq(
        calls.map((c) => JSON.stringify(c.ids)),
        calls.map(() => JSON.stringify(calls[0].ids)),
        "ids identik di setiap retry (idempoten)"
      );
      assertEq(
        psqlSuper(`select status from checkout_claims where phone='${P.retry}' and status='cancel_pending'`, { csv: true }),
        "cancel_pending",
        "baris tetap `cancel_pending` (bukan retired/failed)"
      );
      // `cancel_attempts` = jumlah LEASE attempt (klaim atomic), bukan jumlah
      // HTTP call; 3 panggilan HTTP di atas terjadi di dalam SATU lease.
      assertEq(claimField(P.retry, "cancel_attempts"), "1", "metadata attempt (lease) tercatat di DB");
      assertOk(claimField(P.retry, "cancel_next_retry_at") !== "", "jadwal retry berikutnya tercatat");
      const err = claimField(P.retry, "cancel_last_error");
      assertOk(err.length > 0 && err.length <= 200, "cancel_last_error terisi & dibatasi 200 char", err);
      assertOk(!err.includes(P.retry), "cancel_last_error nol PII (tanpa nomor)", err);

      setMode("ok");
      clearCancelBackoff(P.retry);
      const healed = await createOrder(P.retry, newIdempotencyKey("fw41c-429-retry"));
      assertEq(healed.status, 200, "setelah jendela backoff lewat & upstream normal ⇒ replacement boleh (200)");
      assertEq(mockOrderCount() - beforeCreate, 1, "... tepat satu order pengganti");
      assertEq(
        psqlSuper(`select count(*) from checkout_claims where phone='${P.retry}' and status='cancel_pending'`, { csv: true }),
        "0",
        "... tidak ada baris cancel_pending yang tertinggal"
      );
    }

    // ═══ 3. Multi-ID + 200 parsial ⇒ TAHAN ═════════════════════════════════
    section("3. batch N≥2 + response 2xx parsial ⇒ TAHAN, bukan sukses");
    {
      setMode("ok");
      const uuidFirst = "0199a1b8-4d1f-7c3a-9d2e-5f6a7b8c9d0e";
      const uuidSecond = "0199a1b8-4d1f-7c3a-9d2e-5f6a7b8c9d0f";
      // Data WARISAN: sebelum penjaga per-nomor ada, satu nomor bisa punya >1 order
      // belum dibayar (doc B-1.2: retire bisa mengenai >1 baris). Penjaganya dibuka
      // HANYA untuk menyemai keadaan itu; di akhir bagian ini penjaganya dipasang
      // kembali, dan assertion-nya membuktikan DB kembali sehat.
      psqlSuper(
        `DROP INDEX IF EXISTS uq_checkout_claims_live_phone;
         insert into checkout_claims (tenant_id, phone, idempotency_key, plan_key, status, order_id, scalev_order_uuid, payment_url, created_at, updated_at)
         values ('thrivin','${P.multi}','co-multi-k1','quarter','created','250130JQHFZ1','${uuidFirst}','https://thrivin.myscalev.com/pay/250130JQHFZ1', now() - interval '61 minutes', now() - interval '61 minutes');
         insert into checkout_claims (tenant_id, phone, idempotency_key, plan_key, status, order_id, scalev_order_uuid, payment_url, created_at, updated_at)
         values ('thrivin','${P.multi}','co-multi-k2','quarter','created','250130JQHFZ2','${uuidSecond}','https://thrivin.myscalev.com/pay/250130JQHFZ2', now() - interval '61 minutes', now() - interval '61 minutes');`
      );
      assertEq(
        psqlSuper(`select count(*) from pg_indexes where indexname='uq_checkout_claims_live_phone'`, { csv: true }),
        "0",
        "pra-syarat: penjaga per-nomor dibuka untuk menyemai keadaan warisan"
      );
      assertEq(
        psqlSuper(`select count(*) from checkout_claims where phone='${P.multi}' and status='created'`, { csv: true }),
        "2",
        "pra-syarat: dua order basi untuk satu nomor (retire bisa mengenai >1 baris)"
      );

      const arm = await armCheckout({ base: APP_URL, phone: P.multi, cookie: waSessionCookie(P.multi) });
      setMode("partial");
      const beforeCreate = mockOrderCount();
      const beforeCancel = cancelCalls().length;
      const blocked = await createOrder(P.multi, arm.idempotencyKey);
      assertEq(blocked.status, 409, "2xx PARSIAL ⇒ TAHAN (409), bukan sukses");
      const calls = cancelCalls().slice(beforeCancel);
      assertEq(calls[0]?.ids.length, 2, "satu panggilan memuat SELURUH canonical ID yang perlu dicancel");
      assertEq(
        calls[0]?.ids.slice().sort(),
        [uuidFirst, uuidSecond].sort(),
        "... dan tepat dua canonical ID milik nomor itu (bukan order_id bisnis)"
      );
      assertEq(mockOrderCount(), beforeCreate, "... nol order baru");
      assertEq(
        psqlSuper(`select count(*) from checkout_claims where phone='${P.multi}' and status='retired'`, { csv: true }),
        "0",
        "verifikasi per-ID load-bearing: response parsial TIDAK me-retire satu pun baris (hapus loop verifikasi ⇒ FAIL)"
      );
      assertEq(
        psqlSuper(`select count(*) from checkout_claims where phone='${P.multi}' and status='cancel_pending'`, { csv: true }),
        "2",
        "... keduanya tetap `cancel_pending` + jejak retry"
      );

      setMode("ok");
      clearCancelBackoff(P.multi);
      const healed = await createOrder(P.multi, newIdempotencyKey("fw41c-multi"));
      assertEq(healed.status, 200, "setelah respons lengkap ⇒ replacement boleh");
      assertEq(
        psqlSuper(`select count(*) from checkout_claims where phone='${P.multi}' and status='retired'`, { csv: true }),
        "2",
        "... KEDUA baris jadi retired"
      );
      assertEq(mockOrderCount() - beforeCreate, 1, "... dan tepat satu order pengganti");

      // Penjaga dipasang kembali: hanya ada satu baris hidup lagi ⇒ CREATE sukses.
      psqlSuper(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_live_phone
           ON checkout_claims (tenant_id, phone)
           WHERE status IN ('in_flight','created','cancel_pending','cancel_failed') AND paid_at IS NULL;`
      );
      assertEq(
        psqlSuper(`select count(*) from pg_indexes where indexname='uq_checkout_claims_live_phone'`, { csv: true }),
        "1",
        "penjaga per-nomor terpasang kembali setelah penyemaian warisan"
      );
    }

    // ═══ 4. Terminal 400 ⇒ cancel_failed + 423, tanpa retry ════════════════
    section("4. 400 terminal ⇒ cancel_failed + 423 + antrean owner (tanpa retry)");
    {
      setMode("ok");
      const arm = await armCheckout({ base: APP_URL, phone: P.terminal, cookie: waSessionCookie(P.terminal) });
      await createOrder(P.terminal, arm.idempotencyKey);
      ageClaims(P.terminal);

      setMode("400");
      const beforeCreate = mockOrderCount();
      const beforeCancel = cancelCalls().length;
      const blocked = await createOrder(P.terminal, newIdempotencyKey("fw41c-400"));
      assertEq(blocked.status, 423, "400 ⇒ 423 (butuh owner, bukan retry)");
      assertEq(blocked.body?.code, "ORDER_CANCEL_FAILED", "... kode ORDER_CANCEL_FAILED");
      assertEq(mockOrderCount(), beforeCreate, "... nol order baru");
      assertEq(cancelCalls().length - beforeCancel, 1, "... hanya SATU attempt (tidak retry di kelas terminal)");
      assertEq(
        psqlSuper(`select status from checkout_claims where phone='${P.terminal}'`, { csv: true }),
        "cancel_failed",
        "baris jadi `cancel_failed`"
      );
      assertEq(
        psqlSuper(`select coalesce(payment_url,'NULL') from checkout_claims where phone='${P.terminal}'`, { csv: true }),
        "NULL",
        "link bayar dibuang dari baris terminal (tidak pernah dikirim lagi)"
      );
      assertOk(
        psqlSuper(`select order_id from checkout_claims where phone='${P.terminal}'`, { csv: true }) !== "",
        "order_id DIPERTAHANKAN untuk rekonsiliasi owner"
      );
      const attemptsAfterFirst = claimField(P.terminal, "cancel_attempts");
      const retry = await createOrder(P.terminal, newIdempotencyKey("fw41c-400-retry"));
      assertEq(retry.status, 423, "checkout ulang ⇒ tetap 423 (fail-closed)");
      assertEq(claimField(P.terminal, "cancel_attempts"), attemptsAfterFirst, "... tanpa attempt cancel baru");
      assertEq(cancelCalls().length - beforeCancel, 1, "... dan tanpa HTTP cancel tambahan");
    }

    // ═══ 5. Status tak terdaftar (408) ⇒ TAHAN, bukan terminal ═════════════
    section("5. 408 tak terdaftar ⇒ TAHAN (M-5), bukan cancel_failed");
    {
      setMode("ok");
      const arm = await armCheckout({ base: APP_URL, phone: P.unregistered, cookie: waSessionCookie(P.unregistered) });
      await createOrder(P.unregistered, arm.idempotencyKey);
      ageClaims(P.unregistered);

      setMode("408");
      const beforeCreate = mockOrderCount();
      const blocked = await createOrder(P.unregistered, newIdempotencyKey("fw41c-408"));
      assertEq(blocked.status, 409, "408 ⇒ 409 TAHAN (bukan 423 terminal)");
      assertEq(blocked.body?.code, "ORDER_CANCEL_PENDING", "... kode ORDER_CANCEL_PENDING");
      assertEq(mockOrderCount(), beforeCreate, "... nol order baru");
      assertEq(
        psqlSuper(`select status from checkout_claims where phone='${P.unregistered}'`, { csv: true }),
        "cancel_pending",
        "... state tetap `cancel_pending` (default tahan)"
      );
    }

    // ═══ 6. Timeout 5 detik per call ⇒ TAHAN, nol order baru ═══════════════
    section("6. timeout (5 s per call) ⇒ TAHAN tanpa order baru");
    {
      setMode("ok");
      const arm = await armCheckout({ base: APP_URL, phone: P.timeout, cookie: waSessionCookie(P.timeout) });
      await createOrder(P.timeout, arm.idempotencyKey);
      ageClaims(P.timeout);

      setMode("timeout");
      const beforeCreate = mockOrderCount();
      const blocked = await createOrder(P.timeout, newIdempotencyKey("fw41c-timeout"));
      assertEq(blocked.status, 409, "timeout upstream ⇒ checkout ditahan (409)");
      assertEq(blocked.body?.code, "ORDER_CANCEL_PENDING", "... kode ORDER_CANCEL_PENDING");
      assertEq(mockOrderCount(), beforeCreate, "... nol order baru dicetak");
      assertEq(
        psqlSuper(`select status from checkout_claims where phone='${P.timeout}'`, { csv: true }),
        "cancel_pending",
        "... baris tetap cancel_pending + jejak retry"
      );
      setMode("ok");
    }

    // ═══ 7. 401 ⇒ breaker GLOBAL, bukan lockout per nomor ══════════════════
    section("7. 401 ⇒ breaker global; restart memulihkan (nol lockout permanen)");
    {
      setMode("ok");
      for (const phone of [P.breaker, P.breakerTwo]) {
        const arm = await armCheckout({ base: APP_URL, phone, cookie: waSessionCookie(phone) });
        await createOrder(phone, arm.idempotencyKey);
        ageClaims(phone);
      }
      // Pastikan keduanya memang basi (cancel_pending) — pra-syarat test.
      setMode("401");
      const first401 = await createOrder(P.breaker, newIdempotencyKey("fw41c-401"));
      assertEq(first401.status, 503, "401 ⇒ 503 CANCEL_UNAVAILABLE (fail-closed)");
      assertEq(first401.body?.code, "CANCEL_UNAVAILABLE", "... kode CANCEL_UNAVAILABLE");
      assertEq(
        psqlSuper(`select status from checkout_claims where phone='${P.breaker}'`, { csv: true }),
        "cancel_pending",
        "401 TIDAK mengklasifikasikan nomor sebagai gagal (bukan cancel_failed)"
      );
      const callsAfter401 = cancelCalls().length;
      const second401 = await createOrder(P.breakerTwo, newIdempotencyKey("fw41c-401b"));
      assertEq(second401.status, 503, "nomor LAIN juga 503 ⇒ breaker global, bukan per nomor");
      assertEq(cancelCalls().length, callsAfter401, "... breaker mencegah panggilan cancel berikutnya");
      assertOk(
        serverLog().includes("401 dari Scalev"),
        "alarm 401 tercatat di log (alarm global)"
      );

      // Restart proses = breaker (in-memory) bersih; state DB tidak dikunci.
      app.stop();
      app = await startApp();
      setMode("ok");
      clearCancelBackoff(P.breaker);
      const afterRestart = await createOrder(P.breaker, newIdempotencyKey("fw41c-401-heal"));
      assertEq(afterRestart.status, 200, "setelah credential diperbaiki + restart ⇒ checkout jalan lagi (200)");
      assertEq(
        psqlSuper(`select count(*) from checkout_claims where phone='${P.breaker}' and status='retired'`, { csv: true }),
        "1",
        "... order basi-nya benar-benar retired (tidak terkunci permanen)"
      );
    }

    // ═══ 8. Key cancel kosong ⇒ fail-closed, nol panggilan Scalev ══════════
    section("8. SCALEV_CANCEL_API_KEY kosong ⇒ fail-closed, NOL panggilan cancel");
    {
      setMode("ok");
      const arm = await armCheckout({ base: APP_URL, phone: P.nokey, cookie: waSessionCookie(P.nokey) });
      await createOrder(P.nokey, arm.idempotencyKey);
      ageClaims(P.nokey);
      // Trigger retire lazily lewat app TANPA key cancel (proses terpisah).
      const broken = await startApp({ SCALEV_CANCEL_API_KEY: undefined }, BROKEN_PORT, BROKEN_LOG);
      try {
        const beforeCancel = cancelCalls().length;
        const blocked = await createOrder(P.nokey, newIdempotencyKey("fw41c-nokey"), "quarter", BROKEN_URL);
        assertEq(blocked.status, 503, "tanpa key cancel ⇒ 503 CANCEL_UNAVAILABLE");
        assertEq(blocked.body?.code, "CANCEL_UNAVAILABLE", "... kode CANCEL_UNAVAILABLE");
        assertEq(cancelCalls().length, beforeCancel, "... nol HTTP cancel dikirim ke Scalev (fail-closed, bukan tebak-tebak)");
        assertOk(serverLog(BROKEN_LOG).includes("SCALEV_CANCEL_API_KEY belum dipasang"), "... alarm konfigurasi tercatat");
      } finally {
        broken.stop();
      }
    }

    // ═══ 9. Late webhook: akses tetap + tanda duplikat + nol aktivasi kedua ═
    section("9. late webhook pada order retired ⇒ aktivasi + tanda duplikat, sekali saja");
    {
      const retiredUuid = psqlSuper(
        `select coalesce(scalev_order_uuid,'') from checkout_claims where phone='${P.happy}' and status='retired' limit 1`,
        { csv: true }
      );
      const retiredOrderId = psqlSuper(
        `select order_id from checkout_claims where scalev_order_uuid='${retiredUuid}'`,
        { csv: true }
      );
      assertOk(retiredOrderId !== "", "pra-syarat: order retired masih menyimpan nomor bisnisnya");

      const event = (uniqueId: string) => {
        const body = {
          event: "payment.received",
          unique_id: uniqueId,
          timestamp: new Date().toISOString(),
          data: {
            id: retiredUuid,
            order_id: retiredOrderId,
            payment_status: "paid",
            gross_revenue: "219000.00",
            customer: { name: "Kawan Uji", phone: P.happy },
            customer_phone: P.happy,
            notes: "late payment test",
          },
        };
        const raw = JSON.stringify(body);
        return fetch(`${APP_URL}/api/scalev/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Scalev-Hmac-Sha256": sig(raw) },
          body: raw,
        });
      };

      const first = await event(newIdempotencyKey("late-webhook"));
      assertEq(first.status, 200, "webhook pembayaran TELAT diterima (200)");
      assertEq(
        psqlSuper(`select (paid_at is not null) from checkout_claims where scalev_order_uuid='${retiredUuid}'`, { csv: true }),
        "t",
        "klaim ditandai lunas (akses tetap diberikan — kebijakan owner)"
      );
      assertEq(
        psqlSuper(`select (late_payment_at is not null) from checkout_claims where scalev_order_uuid='${retiredUuid}'`, { csv: true }),
        "t",
        "pembayaran TELAT ditandai duplikat (late_payment_at)"
      );
      assertEq(
        psqlSuper(`select count(*) from subscriptions s join users u on u.id = s.user_id where u.phone='${P.happy}'`, { csv: true }),
        "1",
        "aktivasi terjadi TEPAT SEKALI"
      );
      const alertLines = serverLog()
        .split("\n")
        .filter((l) => l.includes("pembayaran TELAT"));
      assertOk(alertLines.length > 0, "alert late payment diangkat ke ops");
      assertOk(
        alertLines.every((l) => !l.includes(P.happy)),
        "alert late payment nol PII (tanpa nomor pelanggan)"
      );

      const second = await event(newIdempotencyKey("late-webhook-2"));
      assertEq(second.status, 200, "delivery kedua dijawab 200 (Scalev berhenti retry)");
      assertEq(
        psqlSuper(`select count(*) from subscriptions s join users u on u.id = s.user_id where u.phone='${P.happy}'`, { csv: true }),
        "1",
        "late webhook TIDAK membuat aktivasi kedua (dedup fulfillment_key tetap penentu)"
      );
    }

    // ═══ 10. V-3 lease ≥ jendela worker · V-4 backoff dibaca ═══════════════
    section("10. lease ≥ jendela worker sendiri (V-3) + backoff dibaca (V-4)");
    {
      setMode("ok");
      const arm = await armCheckout({ base: APP_URL, phone: P.lease, cookie: waSessionCookie(P.lease) });
      await createOrder(P.lease, arm.idempotencyKey);
      ageClaims(P.lease);
      // Transient 429 ⇒ baris berakhir `cancel_pending` dengan jadwal retry 30 s.
      setMode("429");
      const blocked = await createOrder(P.lease, newIdempotencyKey("fw41c-lease"));
      assertEq(blocked.status, 409, "pra-syarat: 429 ⇒ TAHAN pada `cancel_pending`");
      const leaseClaimId = psqlSuper(
        `select id from checkout_claims where phone='${P.lease}' order by created_at limit 1`,
        { csv: true }
      );
      assertEq(
        psqlSuper(
          `select (cancel_next_retry_at > now()) from checkout_claims where id='${leaseClaimId}'`,
          { csv: true }
        ),
        "t",
        "pra-syarat: backoff 30 s tertulis"
      );

      // V-4: jadwal retry WAJIB menahan klaim. Hapus gerbang `cancel_next_retry_at`
      // di RPC ⇒ klaim di bawah jadi 'claimed' ⇒ assertion FAIL.
      assertEq(
        psqlSuper(`select claim_checkout_cancel('${leaseClaimId}'::uuid)->>'status'`, { csv: true }),
        "not_claimed",
        "backoff dibaca: klaim DITOLAK selama jadwal retry belum lewat (V-4)"
      );

      psqlSuper(
        `update checkout_claims set cancel_next_retry_at = now() - interval '1 second' where id='${leaseClaimId}'`
      );
      assertEq(
        psqlSuper(`select claim_checkout_cancel('${leaseClaimId}'::uuid)->>'status'`, { csv: true }),
        "claimed",
        "setelah jadwal retry lewat ⇒ klaim boleh"
      );
      const leaseSecs = Number(
        psqlSuper(
          `select extract(epoch from (cancel_claimed_until - cancel_claimed_at)) from checkout_claims where id='${leaseClaimId}'`,
          { csv: true }
        )
      );
      assertOk(
        leaseSecs * 1000 >= LEASE_FLOOR_MS,
        "lease ≥ jendela worker maksimum (V-3): jangan lebih pendek dari attempt-nya sendiri",
        `lease=${leaseSecs}s, lantai=${LEASE_FLOOR_MS / 1000}s (CANCEL_MAX_ATTEMPTS x CANCEL_TIMEOUT_MS + backoff)`
      );
      assertEq(
        psqlSuper(`select claim_checkout_cancel('${leaseClaimId}'::uuid)->>'status'`, { csv: true }),
        "not_claimed",
        "lease mengunci: worker kedua tidak boleh mengirim id yang sama (V-3)"
      );
      // Lepas lease supaya sapuan di §11 tidak tersandera baris ini.
      psqlSuper(
        `update checkout_claims set cancel_claimed_at = NULL, cancel_claimed_until = NULL where id='${leaseClaimId}'`
      );
    }

    // ═══ 11. V-1: sapuan menemukan order basi tanpa kunjungan ulang ════════
    section("11. V-1: sweep 30 menit menemukan order basi (tanpa checkout ulang)");
    {
      setMode("ok");
      const arm = await armCheckout({ base: APP_URL, phone: P.sweep, cookie: waSessionCookie(P.sweep) });
      const first = await createOrder(P.sweep, arm.idempotencyKey);
      assertEq(first.status, 200, "pra-syarat: order basi tercetak");
      const staleUuid = String(first.body?.uuid || "");

      const armFresh = await armCheckout({
        base: APP_URL,
        phone: P.sweepFresh,
        cookie: waSessionCookie(P.sweepFresh),
      });
      const fresh = await createOrder(P.sweepFresh, armFresh.idempotencyKey);
      const freshUuid = String(fresh.body?.uuid || "");
      assertOk(freshUuid.length > 0, "pra-syarat: ada order KONTROL yang belum lewat TTL");

      ageClaims(P.sweep);
      assertEq(claimField(P.sweep, "status"), "created", "pra-syarat: baris basi masih `created` (belum dikunjungi ulang)");
      assertEq(claimField(P.sweepFresh, "status"), "created", "pra-syarat: baris kontrol masih `created`");

      const beforeOrders = mockOrderCount();
      const beforeCalls = cancelCalls().length;
      const sweep = await runSweep();
      const calls = cancelCalls().slice(beforeCalls);
      const sent = calls.flatMap((c) => (Array.isArray(c?.ids) ? c.ids.map(String) : []));

      assertOk(
        Number(/nominated=(\d+)/.exec(sweep.out)?.[1] ?? 0) >= 1,
        "sweep melaporkan baris basi dinominasi (V-1)",
        sweep.out
      );
      assertEq(
        claimField(P.sweep, "status"),
        "retired",
        "baris basi jadi `retired` TANPA checkout ulang (hapus nominasi ⇒ tetap `created` ⇒ FAIL)"
      );
      assertEq(
        claimField(P.sweepFresh, "status"),
        "created",
        "baris yang belum lewat TTL TIDAK ikut dinominasi"
      );
      assertEq(sent.filter((id) => id === staleUuid).length, 1, "canonical id baris basi dikirim tepat sekali");
      assertOk(!sent.includes(freshUuid), "canonical id order yang masih hidup TIDAK dikirim");
      assertOk(!sent.includes(P.sweep), "log/isi cancel nol PII: nomor pelanggan tidak pernah masuk `ids`");
      assertEq(mockOrderCount(), beforeOrders, "sweep tidak mencetak order apa pun");
      assertOk(
        !sweep.out.includes(P.sweep) && !sweep.out.includes(CANCEL_KEY),
        "log sweep nol PII/kredensial"
      );
      assertEq(sweep.status, 0, "sweep exit 0 (bersih)");
    }

    // ═══ 12. V-2: batch campuran — baris tanpa canonical ID ≠ retired ══════
    section("12. V-2: hasil cancel TIDAK dipukul rata per batch");
    {
      setMode("ok");
      // Keadaan warisan: dua nomor, satu baris ber-canonical-ID dan satu baris
      // pra-F-W4-1c tanpa canonical ID (hanya nomor bisnis). Keduanya sudah di
      // antrean cancel, jadi sapuan melihatnya sebagai SATU batch.
      psqlSuper(
        `insert into checkout_claims (tenant_id, phone, idempotency_key, plan_key, status, order_id, scalev_order_uuid, created_at, updated_at)
         values ('thrivin','${P.mixed}','co-mixed-withuuid','quarter','cancel_pending','250130JQHFZA','uuid_mixed_keep', now() - interval '120 minutes', now() - interval '120 minutes');
         insert into checkout_claims (tenant_id, phone, idempotency_key, plan_key, status, order_id, scalev_order_uuid, created_at, updated_at)
         values ('thrivin','${P.mixedLegacy}','co-mixed-legacy','quarter','cancel_pending','250130JQHFZB',NULL, now() - interval '120 minutes', now() - interval '120 minutes');`
      );

      const beforeCalls = cancelCalls().length;
      const beforeOrders = mockOrderCount();
      const sweep = await runSweep();
      const calls = cancelCalls().slice(beforeCalls);
      const sent = calls.flatMap((c) => (Array.isArray(c?.ids) ? c.ids.map(String) : []));

      assertOk(sent.includes("uuid_mixed_keep"), "baris ber-canonical-ID tetap dicancel");
      assertOk(
        !sent.includes("250130JQHFZB") && !sent.some((id) => id.includes("250130JQHFZ")),
        "... dan nomor order BISNIS tidak pernah dikirim sebagai `ids` (B-1)"
      );
      assertEq(
        psqlSuper(`select status from checkout_claims where idempotency_key='co-mixed-withuuid'`, { csv: true }),
        "retired",
        "baris yang benar-benar dikirim ⇒ retired"
      );
      assertEq(
        psqlSuper(
          `select status || '|' || coalesce(cancel_last_error,'') from checkout_claims where idempotency_key='co-mixed-legacy'`,
          { csv: true }
        ),
        "cancel_failed|missing_canonical_order_id",
        "baris TANPA canonical ID ⇒ cancel_failed, BUKAN retired (V-2: bukan sukses palsu)"
      );

      // Konsekuensi yang ditutup V-2: kalau baris warisan dicap `retired` padahal
      // Scalev belum pernah diminta membatalkan link-nya, nomor itu bebas
      // mencetak order kedua di belakang link lama yang masih hidup.
      const arm = await armCheckout({
        base: APP_URL,
        phone: P.mixedLegacy,
        cookie: waSessionCookie(P.mixedLegacy),
      });
      const blocked = await createOrder(P.mixedLegacy, arm.idempotencyKey);
      assertEq(blocked.status, 423, "nomor itu TETAP ditahan (423) — nol order kedua di belakang link hidup");
      assertEq(blocked.body?.code, "ORDER_CANCEL_FAILED", "... kode ORDER_CANCEL_FAILED (antrean owner)");
      assertEq(mockOrderCount(), beforeOrders, "... nol order baru dicetak");
    }
  } finally {
    try {
      app.stop();
    } catch {}
    mock.stop();
    postgrest?.stop();
  }

  const failed = results.filter(([status]) => status === "FAIL");
  console.log(`\ncancel TTL e2e: ${results.length - failed.length} PASS, ${failed.length} FAIL`);
  for (const [status, name] of results) if (status === "FAIL") console.log(`  FAIL ${name}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
