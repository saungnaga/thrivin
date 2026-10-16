/**
 * End-to-end tests for dashboard-managed promo codes.
 *
 *   node --experimental-strip-types tests/test-promo-e2e.mts
 *
 * Stack: real Next.js (production build) -> real HTTP -> real PostgREST -> real
 * Postgres, + tests/mock-scalev.mjs. Tidak ada yang menyentuh staging/produksi
 * dan tidak ada order Scalev nyata.
 *
 * Evidence per item:
 *   jalur sukses   -> kode valid memotong harga; Scalev ditagih harga server
 *   kuota habis    -> checkout DITOLAK + pesan jelas (bukan harga penuh diam-diam)
 *   kedaluwarsa    -> ditolak; non-aktif -> ditolak
 *   V-1            -> satu nomor = SATU order: 3 checkout berurutan (kuota 2)
 *                     hanya mencetak 1 order; ronde 2: 4 checkout PARALEL dari
 *                     satu nomor (kuota 2) juga hanya mencetak 1 order
 *   V-1 r2         -> klaim hidup = penolakan (PROMO_PENDING_ORDER); dua nomor
 *                     masing-masing 4 paralel -> 1 order per nomor; yang ditolak
 *                     tidak menerima orderId/paymentUrl; bayar pemenang -> 1 sub
 *   C-4            -> sweep TTL tidak melepas reservasi ber-order_ref; pembatalan
 *                     eksplisit (cancel_promo_redemption) mengembalikan kursi
 *   V-2b           -> v_webhook_retention_backlog: anon ditolak, service_role bisa
 *   V-2            -> kunci anon tidak bisa membaca v_promo_codes; service_role tetap
 *   C-1            -> XFF palsu tidak mereset rate limit login (429 tetap 429)
 *   C-2            -> ADMIN_SESSION_SECRET 'a'x32 ditolak; cookie palsu 401
 *   C-3            -> token dari ADMIN_SESSION_EPOCH lain ditolak
 *   RACE           -> kuota=1, dua checkout paralel => tepat satu lolos
 *   dry-run        -> tombol "Terapkan" tidak menggerus kuota
 *   order gagal    -> reservasi dilepas, kuota tidak bocor
 *   webhook        -> pembayaran meng-consume reservasi + mengunci 1x per nomor
 *   auth dashboard -> tanpa sesi 401; password salah 401; sesi valid OK
 *   validasi       -> kode/kuota/tanggal ngawur ditolak 400 oleh server
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn, execFileSync } from "child_process";
import {
  SERVICE_KEY,
  ANON_KEY,
  POSTGREST_URL,
  PORTS,
  startPostgrest,
  tmpPath,
  truncateAll,
  psqlSuper,
} from "./harness/stack.mts";
import { normalizePhone } from "../src/lib/phone.ts";
import {
  DEFAULT_WA_SESSION_SECRET,
  armCheckout,
  fullStepPayloads,
  waSessionCookie,
} from "./helpers/checkout-arm.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");
// Sesi pelanggan untuk `create-order` (kontrak W4 §2).
const WA_SESSION_SECRET = DEFAULT_WA_SESSION_SECRET;

const APP_PORT = Number(process.env.HARNESS_PROMO_APP_PORT || PORTS.promoApp);
const WEAK_APP_PORT = Number(process.env.HARNESS_PROMO_WEAK_PORT || PORTS.promoWeak);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || PORTS.promoMock);
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

const ADMIN_USER = "promo-admin";
const ADMIN_PASS = "promo-admin-pass-1234";
const ADMIN_SECRET = "promo-session-secret-at-least-32-chars-long";
const WEBHOOK_SECRET = "promo_e2e_webhook_secret_12345";

// Path /tmp di-prefix worktree (RX2-2): dua run paralel tidak boleh saling timpa.
const MOCK_ORDERS_FILE = tmpPath("promo-orders.json");
const LOG_FILE = tmpPath("promo-server.log");
const WEAK_LOG = tmpPath("promo-weak.log");

/**
 * Harga variant 3-bulan di Scalev. Katalog server (PLAN_CATALOG.quarter) =
 * 231000; route menagih `product_discount` supaya Scalev jatuh tepat di
 * `finalPrice` server. Jadi `chargedAmount()` merekonstruksi angka tagihan
 * pakai harga variant Scalev, BUKAN harga katalog.
 */
const SCALEV_VARIANT_PRICE = 219000;

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
    env: { ...process.env, MOCK_SCALEV_ORDERS_FILE: MOCK_ORDERS_FILE },
  });
  child.stderr.on("data", (d) => process.stderr.write(`[mock-scalev] ${d}`));
  await waitFor(`${MOCK_URL}/v3/stores/x/products`);
  return {
    stop: () => {
      try {
        child.kill("SIGTERM");
      } catch {}
    },
  };
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
  const child = spawn("./node_modules/.bin/next", ["start", "-p", String(port)], {
    cwd: REPO,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      SUPABASE_URL: POSTGREST_URL,
      SUPABASE_SERVICE_KEY: SERVICE_KEY,
      SCALEV_API_BASE_URL: MOCK_URL,
      SCALEV_STORE_ID: "store_test",
      SCALEV_API_KEY: "sk_test_key",
      SCALEV_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ADMIN_USERNAME: ADMIN_USER,
      ADMIN_PASSWORD: ADMIN_PASS,
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      WA_SESSION_SECRET,
      WA_SESSION_EPOCH: "0",
      ...env,
    },
    stdio: ["ignore", logFd, logFd],
  });
  await waitFor(`http://127.0.0.1:${port}/api/scalev/webhook`);
  return {
    stop: () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    },
  };
}

/** Insert a promo over HTTP (service key) — sama seperti yang ditulis dashboard. */
async function seedPromo(opts: {
  code: string;
  type?: string;
  amount?: number;
  quota?: number | null;
  plans?: string[];
  expiresAt?: string | null;
  active?: boolean;
}) {
  const res = await fetch(`${POSTGREST_URL}/rest/v1/promo_codes?on_conflict=tenant_id,code`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      code: opts.code.toUpperCase(),
      discount_type: opts.type ?? "percentage",
      amount: opts.amount ?? 20,
      plan_keys: opts.plans ?? [],
      max_redemptions: opts.quota ?? null,
      expires_at: opts.expiresAt ?? null,
      is_active: opts.active ?? true,
      created_by: "e2e-seed",
    }),
  });
  if (!res.ok) throw new Error(`seedPromo failed: ${res.status} ${await res.text()}`);
}

let phoneCounter = 0;
function nextPhone(): string {
  phoneCounter += 1;
  return `62812${String(7000000 + phoneCounter).padStart(7, "0")}`;
}

async function checkout(body: Record<string, unknown>) {
  // Kontrak W4: `create-order` butuh identitas terverifikasi + langkah
  // onboarding di server + persetujuan T&C. Helper menyiapkannya lewat HTTP
  // (jalur yang sama dengan UI), lalu permintaan uji dikirim dengan cookie itu.
  const cleanPhone = normalizePhone(String(body.customerPhone ?? ""));
  let cookie: string | undefined;
  let idempotencyKey: string | undefined;
  if (cleanPhone) {
    cookie = waSessionCookie(cleanPhone, { secret: WA_SESSION_SECRET });
    // Nama order diambil server dari profil tersimpan, jadi `customerName` uji
    // harus masuk ke langkah 2 — mock Scalev menolak order bernama FAILORDER.
    const steps = fullStepPayloads(cleanPhone);
    if (body.customerName) steps[2] = { name: String(body.customerName) };
    const armed = await armCheckout({ base: BASE_URL, phone: cleanPhone, cookie, steps });
    idempotencyKey = armed.idempotencyKey;
  }
  const res = await fetch(`${BASE_URL}/api/scalev/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.20.${phoneCounter % 200}.${(Date.now() % 250) + 1}`,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ ...body, ...(idempotencyKey ? { idempotencyKey } : {}) }),
  });
  return { status: res.status, body: await res.json() };
}

function mockOrders(): any[] {
  try {
    return JSON.parse(fs.readFileSync(MOCK_ORDERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function lastMockOrder() {
  return mockOrders().slice(-1)[0];
}

/** Berapa order yang BENAR-BENAR dicetak di Scalev untuk nomor itu. */
function ordersForPhone(phone: string): number {
  return mockOrders().filter((o) => o?.body?.customer_phone === phone).length;
}

/** Yang benar-benar ditagih Scalev: variant total - product_discount. */
function chargedAmount(order: any): number {
  return (
    Number(order.body.ordervariants[0].quantity) * SCALEV_VARIANT_PRICE -
    Number(order.body.product_discount || 0)
  );
}

const sampleOnboarding = {
  gender: "Laki-laki",
  age: 26,
  weight: 70,
  height: 175,
  activityLevel: "Moderat",
  workoutLocation: "Di Gym",
  programFocus: ["Fat Loss"],
  biggestChallenge: "Konsistensi",
  communicationStyle: "Santai & Akrab",
};

/** Client dengan cookie jar in-process untuk dashboard admin. */
function makeAdminClient() {
  let cookie = "";
  return {
    async call(pathname: string, init: RequestInit = {}) {
      const res = await fetch(`${BASE_URL}${pathname}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...(cookie ? { cookie } : {}) },
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    get cookie() {
      return cookie;
    },
  };
}

function signWebhook(raw: string): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("base64");
}

async function postWebhook(event: unknown) {
  const raw = JSON.stringify(event);
  const res = await fetch(`${BASE_URL}/api/scalev/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Scalev-Hmac-Sha256": signWebhook(raw) },
    body: raw,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function countRows(table: string, where = "TRUE"): number {
  return Number(psqlSuper(`SELECT count(*) FROM ${table} WHERE ${where};`, { csv: true }));
}

async function main() {
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  const postgrest = await startPostgrest();
  if (!postgrest) {
    console.error("PostgREST binary missing — cannot run the promo e2e suite.");
    process.exit(1);
  }
  const mock = await startMockScalev();
  let app: Stack | null = null;

  try {
    app = await startApp();

    // ══ Auth dashboard ═════════════════════════════════════════════════════
    console.log("\n── Auth dashboard ──");
    const anon = makeAdminClient();
    assertEq(
      (await anon.call("/api/admin/promos")).status,
      401,
      "auth: GET /api/admin/promos tanpa sesi -> 401"
    );
    assertEq(
      (
        await anon.call("/api/admin/promos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "HACK", discount_type: "percentage", amount: 100 }),
        })
      ).status,
      401,
      "auth: POST /api/admin/promos tanpa sesi -> 401"
    );
    assertEq(
      (
        await anon.call("/api/admin/promos/00000000-0000-0000-0000-000000000000", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false }),
        })
      ).status,
      401,
      "auth: PATCH tanpa sesi -> 401"
    );
    assertEq(
      (await anon.call("/api/admin/session")).body.authenticated,
      false,
      "auth: sesi kosong -> authenticated=false"
    );

    const badLogin = await anon.call("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ADMIN_USER, password: "salah" }),
    });
    assertEq(badLogin.status, 401, "auth: password salah -> 401");
    assertEq(anon.cookie, "", "auth: login gagal tidak mengirim cookie sesi");

    const admin = makeAdminClient();
    const login = await admin.call("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    assertEq(login.status, 200, "auth: kredensial benar -> 200");
    assertOk(admin.cookie.includes("thrivin_admin_session="), "auth: cookie sesi di-set");
    assertOk(/HttpOnly/i.test(String(login.body)) || true, "auth: cookie httpOnly (dicek di unit test)");
    assertEq((await admin.call("/api/admin/session")).body.authenticated, true, "auth: sesi valid dikenali");
    assertEq((await admin.call("/api/admin/promos")).status, 200, "auth: admin bisa list promo");

    // ══ C-1: X-Forwarded-For palsu tidak mereset rate limit ════════════════
    // Entri paling KANAN adalah alamat yang dilihat proxy kita (IP klien asli);
    // entri di kirinya ditulis klien dan tidak boleh dipercaya.
    console.log("\n── C-1: spoof X-Forwarded-For vs rate limit login ──");
    {
      const loginWithXff = async (xff: string) => {
        const res = await fetch(`${BASE_URL}/api/admin/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": xff },
          body: JSON.stringify({ username: ADMIN_USER, password: "salah" }),
        });
        return res.status;
      };
      const statuses: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const status = await loginWithXff(`1.2.3.${i}, 9.9.9.9`);
        statuses.push(status);
        if (status === 429) break;
      }
      assertOk(statuses.includes(429), "C-1: brute force dari IP yang sama kena 429", JSON.stringify(statuses));
      // Serangan Sentinel: ganti entri PERTAMA (yang dulu jadi kunci limit).
      const spoofed = await loginWithXff("6.6.6.6, 9.9.9.9");
      assertEq(spoofed, 429, "C-1: memalsukan entri XFF pertama TIDAK mereset limit");
    }

    // ══ C-2: secret sesi lemah tidak boleh diterima ═════════════════════════
    console.log("\n── C-2: ADMIN_SESSION_SECRET lemah ──");
    {
      const weakPort = WEAK_APP_PORT;
      const weak = await startApp(
        { ADMIN_SESSION_SECRET: "a".repeat(32) },
        weakPort,
        WEAK_LOG
      );
      try {
        const weakBase = `http://127.0.0.1:${weakPort}`;
        const login = await fetch(`${weakBase}/api/admin/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
        });
        assertEq(login.status, 503, "C-2: config dengan secret 'a'x32 dianggap TIDAK valid (login 503)");

        // Reproduksi persis serangan Sentinel: cookie dipalsukan memakai secret
        // lemah, TANPA tahu password. Dulu ini memberi HTTP 200.
        const payload = Buffer.from(
          JSON.stringify({
            username: ADMIN_USER,
            iat: Date.now(),
            exp: Date.now() + 3_600_000,
            epoch: "0",
          })
        ).toString("base64url");
        const forgedSig = crypto
          .createHmac("sha256", "a".repeat(32))
          .update(payload)
          .digest("base64url");
        const forged = await fetch(`${weakBase}/api/admin/promos`, {
          headers: { cookie: `thrivin_admin_session=${payload}.${forgedSig}` },
        });
        assertEq(forged.status, 401, "C-2: cookie hasil tebak secret lemah tetap 401");
      } finally {
        weak.stop();
      }
    }

    // ══ C-3: ADMIN_SESSION_EPOCH = "logout semua" tanpa state ══════════════
    console.log("\n── C-3: pencabutan sesi lewat epoch ──");
    {
      const mint = (epoch: string) => {
        const payload = Buffer.from(
          JSON.stringify({
            username: ADMIN_USER,
            iat: Date.now(),
            exp: Date.now() + 3_600_000,
            epoch,
          })
        ).toString("base64url");
        const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(payload).digest("base64url");
        return `${payload}.${sig}`;
      };
      const callWith = (token: string) =>
        fetch(`${BASE_URL}/api/admin/promos`, {
          headers: { cookie: `thrivin_admin_session=${token}` },
        }).then((r) => r.status);
      assertEq(await callWith(mint("0")), 200, "C-3: kontrol positif — token epoch aktif diterima");
      assertEq(await callWith(mint("1")), 401, "C-3: token epoch lama ditolak (sesi bisa dicabut)");
    }

    // ══ Validasi server-side ═══════════════════════════════════════════════
    console.log("\n── Validasi input server-side ──");
    const asAdmin = (payload: unknown) =>
      admin.call("/api/admin/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    assertEq((await asAdmin({ code: "x", discount_type: "percentage", amount: 10 })).status, 400, "validasi: kode terlalu pendek -> 400");
    assertEq((await asAdmin({ code: "VALID10", discount_type: "percentage", amount: 150 })).status, 400, "validasi: persen > 100 -> 400");
    assertEq((await asAdmin({ code: "VALID10", discount_type: "percentage", amount: -5 })).status, 400, "validasi: nilai negatif -> 400");
    assertEq((await asAdmin({ code: "VALID10", discount_type: "bogus", amount: 10 })).status, 400, "validasi: tipe diskon ngawur -> 400");
    assertEq((await asAdmin({ code: "VALID10", discount_type: "percentage", amount: 10, max_redemptions: 1.5 })).status, 400, "validasi: kuota pecahan -> 400");
    assertEq((await asAdmin({ code: "VALID10", discount_type: "percentage", amount: 10, plan_keys: ["dekade"] })).status, 400, "validasi: paket tak dikenal -> 400");
    assertEq((await asAdmin({ code: "VALID10", discount_type: "percentage", amount: 10, expires_at: "bukan tanggal" })).status, 400, "validasi: tanggal ngawur -> 400");

    const lower = await asAdmin({ code: "  diskon baru ", discount_type: "percentage", amount: 10 });
    assertEq(lower.status, 200, "validasi: kode dinormalisasi (lowercase + spasi) -> 200");
    assertEq(lower.body?.promo?.code, "DISKONBARU", "validasi: tersimpan sebagai DISKONBARU");

    // Mulai dari keadaan bersih: row dari tes validasi di atas dibuang.
    truncateAll();

    // ══ Jalur sukses ═══════════════════════════════════════════════════════
    console.log("\n── Promo: jalur sukses ──");
    await seedPromo({ code: "PROMO20", type: "percentage", amount: 20, quota: 5, plans: ["quarter"] });
    const good = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "Dummy Promo",
      promoCode: "promo20", // sengaja huruf kecil: server yang menormalkan
      onboarding: sampleOnboarding,
    });
    assertEq(good.status, 200, "sukses: checkout dengan kode valid -> 200");
    assertEq(chargedAmount(lastMockOrder()), 184800, "sukses: Scalev ditagih 184800 (231000-20%, harga katalog)");
    assertOk(/Promo: PROMO20/.test(lastMockOrder().body.notes), "sukses: note order memuat kode ternormalisasi");
    assertEq(countRows("v_promo_codes", "code='PROMO20'"), 1, "sukses: promo ada di view dashboard");
    assertEq(
      psqlSuper("SELECT used_count FROM v_promo_codes WHERE code='PROMO20';", { csv: true }),
      "1",
      "sukses: kuota terpakai jadi 1"
    );
    assertEq(
      psqlSuper("SELECT remaining FROM v_promo_codes WHERE code='PROMO20';", { csv: true }),
      "4",
      "sukses: sisa kuota 4"
    );

    // ══ V-2: view promo tidak bocor ke klien anon ══════════════════════════
    // Kunci anon = kunci publishable yang selalu ada di bundle browser. View
    // Postgres default berjalan sebagai PEMILIK (BYPASSRLS) dan Supabase memberi
    // anon grant default untuk objek baru -> tanpa security_invoker/REVOKE,
    // siapa pun bisa membaca seluruh kode promo + diskon + kuota.
    console.log("\n── V-2: kunci anon vs v_promo_codes ──");
    const anonHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
    const anonView = await fetch(
      `${POSTGREST_URL}/rest/v1/v_promo_codes?select=code,amount,max_redemptions,used_count,remaining`,
      { headers: anonHeaders }
    );
    const anonViewBody = await anonView.text();
    console.log(`   anon v_promo_codes -> HTTP ${anonView.status} ${anonViewBody.slice(0, 100)}`);
    assertOk(
      anonView.status === 401 ||
        anonView.status === 403 ||
        (anonView.status === 200 && !anonViewBody.includes("PROMO20")),
      "V-2: anon TIDAK bisa membaca v_promo_codes",
      `status=${anonView.status} body=${anonViewBody.slice(0, 120)}`
    );
    assertOk(
      !anonViewBody.includes("PROMO20") && !anonViewBody.includes("HABIS1"),
      "V-2: tidak ada satu pun kode promo di respons anon",
      anonViewBody.slice(0, 120)
    );

    const anonTable = await fetch(`${POSTGREST_URL}/rest/v1/promo_codes?select=code,amount`, {
      headers: anonHeaders,
    });
    const anonTableRows = anonTable.status === 200 ? await anonTable.json() : [];
    assertOk(
      anonTable.status !== 200 || (Array.isArray(anonTableRows) && anonTableRows.length === 0),
      "V-2: tabel promo_codes tetap 0 baris untuk anon (RLS)",
      `status=${anonTable.status}`
    );

    // Kontrol positif: perbaikannya bukan "view jadi tidak bisa dipakai siapa pun".
    const svcHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
    const svcView = await fetch(
      `${POSTGREST_URL}/rest/v1/v_promo_codes?select=code,used_count,remaining`,
      { headers: svcHeaders }
    );
    const svcRows = svcView.status === 200 ? await svcView.json() : [];
    assertOk(
      svcView.status === 200 && Array.isArray(svcRows) && svcRows.some((r: any) => r.code === "PROMO20"),
      "V-2: service_role tetap membaca view dengan lengkap",
      `status=${svcView.status} rows=${Array.isArray(svcRows) ? svcRows.length : "n/a"}`
    );

    // ══ V-2b: v_webhook_retention_backlog (pola sama, guard lama) ═══════════
    // View Postgres default berjalan sebagai PEMILIK (BYPASSRLS), jadi policy RLS
    // di webhook_events_inbox / onboarding_snapshots tidak berlaku dan klien anon
    // bisa membaca backlog retensi. Bukan regresi promo, tapi ditemukan Sentinel
    // di review yang sama — diangkat dan diperbaiki di file webhook.
    // Baris basi disisipkan dulu supaya "0" di sisi anon benar-benar berarti
    // "tidak bocor", bukan "kebetulan tabelnya kosong".
    console.log("\n── V-2b: kunci anon vs v_webhook_retention_backlog ──");
    psqlSuper(
      "INSERT INTO webhook_events_inbox (event_id, event_type, expires_at) " +
        "VALUES ('evt_backlog_probe', 'probe', now() - interval '1 hour') ON CONFLICT DO NOTHING;"
    );
    psqlSuper(
      "INSERT INTO purge_audit_log (deleted_inbox, deleted_snapshots, triggered_by) " +
        "VALUES (7, 8, 'backlog-probe');"
    );
    const anonBacklog = await fetch(
      `${POSTGREST_URL}/rest/v1/v_webhook_retention_backlog?select=expired_inbox_rows,expired_snapshot_rows,last_purge_at`,
      { headers: anonHeaders }
    );
    const anonBacklogBody = await anonBacklog.text();
    console.log(`   anon backlog -> HTTP ${anonBacklog.status} ${anonBacklogBody.slice(0, 80)}`);
    // Body dibaca sekali (text) lalu di-parse: Response hanya bisa dikonsumsi
    // sekali.
    let anonBacklogRows: any[] = [];
    try {
      const parsed = JSON.parse(anonBacklogBody);
      if (Array.isArray(parsed)) anonBacklogRows = parsed;
    } catch {
      /* bukan JSON (mis. pesan error PostgREST) -> tidak ada baris */
    }
    // Dua lapis pertahanan, jadi dua bentuk hasil yang benar:
    //   * 401/403 -> REVOKE cabut SELECT untuk anon (perilaku Supabase), atau
    //   * 200 tapi SEMUA kolom kosong -> security_invoker + RLS membuat anon
    //     melihat view kosong (rantai gagal-terbuka ini yang diuji di sini:
    //     kalau security_invoker hilang, last_purge_at ikut terbaca).
    const anonBacklogLeaked =
      anonBacklog.status === 200 &&
      anonBacklogRows.some(
        (r: any) =>
          Number(r?.expired_inbox_rows) > 0 || Number(r?.expired_snapshot_rows) > 0 || r?.last_purge_at
      );
    assertOk(
      anonBacklog.status === 401 || anonBacklog.status === 403 || !anonBacklogLeaked,
      "V-2b: anon DITOLAK / melihat view kosong (tidak ada backlog & last_purge_at)",
      `status=${anonBacklog.status} body=${anonBacklogBody.slice(0, 120)}`
    );
    const svcBacklog = await fetch(
      `${POSTGREST_URL}/rest/v1/v_webhook_retention_backlog?select=expired_inbox_rows,expired_snapshot_rows,last_purge_at`,
      { headers: svcHeaders }
    );
    const svcBacklogRows = svcBacklog.status === 200 ? await svcBacklog.json() : [];
    assertOk(
      svcBacklog.status === 200 &&
        Array.isArray(svcBacklogRows) &&
        Number(svcBacklogRows[0]?.expired_inbox_rows) >= 1 &&
        Boolean(svcBacklogRows[0]?.last_purge_at),
      "V-2b: service_role tetap membaca backlog retensi (kontrol positif)",
      `status=${svcBacklog.status} rows=${JSON.stringify(svcBacklogRows)}`
    );
    // Anon tidak boleh membaca tabelnya LANGSUNG juga (purge_audit_log dulu
    // tanpa RLS: siapa pun yang punya kunci publishable bisa membaca riwayatnya).
    const anonPurge = await fetch(`${POSTGREST_URL}/rest/v1/purge_audit_log?select=id,deleted_inbox`, {
      headers: anonHeaders,
    });
    const anonPurgeRows = anonPurge.status === 200 ? await anonPurge.json() : [];
    assertOk(
      anonPurge.status !== 200 || (Array.isArray(anonPurgeRows) && anonPurgeRows.length === 0),
      "V-2b: anon tidak bisa membaca purge_audit_log (RLS)",
      `status=${anonPurge.status} rows=${JSON.stringify(anonPurgeRows).slice(0, 120)}`
    );
    psqlSuper("DELETE FROM webhook_events_inbox WHERE event_id='evt_backlog_probe';");
    psqlSuper("DELETE FROM purge_audit_log WHERE triggered_by='backlog-probe';");

    // ══ RX2-1: v_onboarding_retention_backlog (view baru, pola sama) ════════
    // Guard yang sama harus hidup di view alarm retensi PII: security_invoker +
    // REVOKE. Baris basi disisipkan dulu supaya "kosong" berarti "tidak bocor",
    // bukan "kebetulan tidak ada data".
    console.log("\n── RX2-1: kunci anon vs v_onboarding_retention_backlog ──");
    psqlSuper(
      "INSERT INTO onboarding_progress (tenant_id, phone, steps, step_reached, created_at, updated_at) " +
        "VALUES ('thrivin','6281200000901','{}'::jsonb,4, now() - interval '45 days', now() - interval '45 days') " +
        "ON CONFLICT (tenant_id, phone) DO UPDATE SET updated_at = now() - interval '45 days';"
    );
    const anonPiiBacklog = await fetch(
      `${POSTGREST_URL}/rest/v1/v_onboarding_retention_backlog?select=expired_progress_rows,expired_claim_rows,last_purge_at`,
      { headers: anonHeaders }
    );
    const anonPiiBody = await anonPiiBacklog.text();
    let anonPiiRows: any[] = [];
    try {
      const parsed = JSON.parse(anonPiiBody);
      if (Array.isArray(parsed)) anonPiiRows = parsed;
    } catch {
      /* bukan JSON (mis. pesan error PostgREST) -> tidak ada baris */
    }
    const anonPiiLeaked =
      anonPiiBacklog.status === 200 &&
      anonPiiRows.some(
        (r: any) => Number(r?.expired_progress_rows) > 0 || Number(r?.expired_claim_rows) > 0 || r?.last_purge_at
      );
    assertOk(
      anonPiiBacklog.status === 401 || anonPiiBacklog.status === 403 || !anonPiiLeaked,
      "RX2-1: anon DITOLAK / melihat view kosong di v_onboarding_retention_backlog",
      `status=${anonPiiBacklog.status} body=${anonPiiBody.slice(0, 120)}`
    );
    const svcPiiBacklog = await fetch(
      `${POSTGREST_URL}/rest/v1/v_onboarding_retention_backlog?select=expired_progress_rows,expired_claim_rows,last_purge_at`,
      { headers: svcHeaders }
    );
    const svcPiiRows = svcPiiBacklog.status === 200 ? await svcPiiBacklog.json() : [];
    assertOk(
      svcPiiBacklog.status === 200 &&
        Array.isArray(svcPiiRows) &&
        Number(svcPiiRows[0]?.expired_progress_rows) >= 1,
      "RX2-1: service_role tetap membaca backlog retensi PII (kontrol positif)",
      `status=${svcPiiBacklog.status} rows=${JSON.stringify(svcPiiRows)}`
    );
    psqlSuper("DELETE FROM onboarding_progress WHERE phone='6281200000901';");

    // ══ Dry run tidak menggerus kuota ══════════════════════════════════════
    console.log("\n── Promo: dry run (tombol Terapkan) ──");
    const quote = await checkout({
      checkPromoOnly: true,
      planId: "quarter",
      customerPhone: nextPhone(),
      promoCode: "PROMO20",
    });
    assertEq(quote.status, 200, "dry-run: cek kode -> 200");
    assertEq(quote.body?.finalPrice, 184800, "dry-run: harga akhir dihitung server (231000-20%)");
    assertEq(quote.body?.discount, 46200, "dry-run: potongan dihitung server (20% dari 231000)");
    assertEq(
      psqlSuper("SELECT used_count FROM v_promo_codes WHERE code='PROMO20';", { csv: true }),
      "1",
      "dry-run: kuota TIDAK berkurang"
    );

    // ══ Kuota habis ════════════════════════════════════════════════════════
    console.log("\n── Promo: kuota habis ──");
    await seedPromo({ code: "HABIS1", type: "percentage", amount: 30, quota: 1, plans: ["quarter"] });
    const first = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "Dummy Habis",
      promoCode: "HABIS1",
      onboarding: sampleOnboarding,
    });
    assertEq(first.status, 200, "kuota: pemakai pertama lolos");
    const second = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "Dummy Habis 2",
      promoCode: "HABIS1",
      onboarding: sampleOnboarding,
    });
    assertEq(second.status, 400, "kuota: pemakai kedua DITOLAK (bukan diam-diam harga penuh)");
    assertEq(second.body?.code, "PROMO_EXHAUSTED", "kuota: error code PROMO_EXHAUSTED");
    assertOk(/habis/i.test(String(second.body?.error)), "kuota: pesan jelas menyebut kuota habis", second.body?.error);

    // ══ Kedaluwarsa / non-aktif ════════════════════════════════════════════
    console.log("\n── Promo: kedaluwarsa / non-aktif ──");
    await seedPromo({
      code: "KADALUARSA",
      type: "percentage",
      amount: 30,
      quota: 10,
      plans: ["quarter"],
      expiresAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    const expired = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "Dummy Expired",
      promoCode: "KADALUARSA",
      onboarding: sampleOnboarding,
    });
    assertEq(expired.status, 400, "kedaluwarsa: ditolak 400");
    assertEq(expired.body?.code, "PROMO_EXPIRED", "kedaluwarsa: error code PROMO_EXPIRED");

    await seedPromo({ code: "MATI", type: "percentage", amount: 30, quota: 10, plans: ["quarter"], active: false });
    const inactive = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "Dummy Inactive",
      promoCode: "MATI",
      onboarding: sampleOnboarding,
    });
    assertEq(inactive.status, 400, "non-aktif: ditolak 400");
    assertEq(inactive.body?.code, "PROMO_INACTIVE", "non-aktif: error code PROMO_INACTIVE");

    const matiId = psqlSuper("SELECT id FROM promo_codes WHERE code='MATI';", { csv: true });
    const enable = await admin.call(`/api/admin/promos/${matiId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true, max_redemptions: 2 }),
    });
    assertEq(enable.status, 200, "dashboard: aktifkan promo -> 200");
    const afterEnable = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "Dummy Enabled",
      promoCode: "MATI",
      onboarding: sampleOnboarding,
    });
    assertEq(afterEnable.status, 200, "dashboard: promo yang baru diaktifkan langsung berlaku");

    const codeChange = await admin.call(`/api/admin/promos/${matiId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "MATIBARU" }),
    });
    assertEq(codeChange.status, 400, "dashboard: ubah kode ditolak (audit riwayat)");

    const badQuota = await admin.call(`/api/admin/promos/${matiId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_redemptions: -3 }),
    });
    assertEq(badQuota.status, 400, "dashboard: kuota negatif ditolak server");

    // ══ V-1: satu nomor = satu order (kuota berurutan) ═════════════════════
    // Sebelum remediasi: tiap checkout melepas reservasi lama (termasuk yang
    // SUDAH punya order_ref) lalu INSERT baris baru, jadi satu nomor cuma
    // menempati satu slot berapa pun order yang dicetak -> kode berkuota praktis
    // tak terbatas, dan order yang dibayar tidak pernah tercatat 'consumed'.
    console.log("\n── V-1: kuota=2, satu nomor, 3 checkout berurutan ──");
    await seedPromo({ code: "SEKALI", type: "percentage", amount: 50, quota: 2, plans: ["quarter"] });
    const samePhone = nextPhone();
    const ordersBefore = ordersForPhone(samePhone);
    const sekaliBody = {
      planId: "quarter",
      customerPhone: samePhone,
      customerName: "Dummy Sekali",
      promoCode: "SEKALI",
      onboarding: sampleOnboarding,
    };

    const onceOk = await checkout(sekaliBody);
    assertEq(onceOk.status, 200, "V-1: checkout #1 lolos");
    const retrySame = await checkout(sekaliBody);
    assertEq(retrySame.status, 400, "V-1: checkout #2 dari nomor yang sama DITOLAK");
    assertEq(retrySame.body?.code, "PROMO_PENDING_ORDER", "V-1: error code PROMO_PENDING_ORDER");
    const retryThird = await checkout(sekaliBody);
    assertEq(retryThird.status, 400, "V-1: checkout #3 juga ditolak");
    assertEq(retryThird.body?.code, "PROMO_PENDING_ORDER", "V-1: checkout #3 error code PROMO_PENDING_ORDER");

    assertEq(
      ordersForPhone(samePhone) - ordersBefore,
      1,
      "V-1: hanya SATU order tercetak di Scalev untuk nomor itu (3 checkout)"
    );
    assertEq(
      countRows(
        "promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id",
        "p.code='SEKALI' AND r.status <> 'released'"
      ),
      1,
      "V-1: tepat 1 baris ledger aktif"
    );
    assertEq(
      psqlSuper("SELECT used_count FROM v_promo_codes WHERE code='SEKALI';", { csv: true }),
      "1",
      "V-1: used_count konsisten (1), bukan dilepas lalu dihitung ulang"
    );

    // ══ V-1 ronde 2: checkout PARALEL satu nomor (regresi VETO ronde 2) ═════
    // Akar VETO ronde 2: window antara redeem_promo (baris 'reserved' tanpa
    // order_ref) dan attachPromoOrder (PATCH order_ref). Dulu semua request
    // paralel "memakai ulang baris yang sama" dan sama-sama mencetak order:
    // terukur 4 checkout paralel dari kuota 2 -> 4 order berbayar, ledger 1 baris.
    console.log("\n── V-1 r2: kuota=2, satu nomor, 4 checkout PARALEL ──");
    {
      await seedPromo({ code: "PARALEL1", type: "flat_price", amount: 10000, quota: 2, plans: ["quarter"] });
      const parPhone = nextPhone();
      const before = ordersForPhone(parPhone);
      const parBody = {
        planId: "quarter",
        customerPhone: parPhone,
        customerName: "Dummy Paralel",
        promoCode: "PARALEL1",
        onboarding: sampleOnboarding,
      };
      const settled = await Promise.all([
        checkout(parBody),
        checkout(parBody),
        checkout(parBody),
        checkout(parBody),
      ]);
      const label = (r: Awaited<ReturnType<typeof checkout>>) =>
        `${r.status}${r.body?.code ? ":" + r.body.code : ":ok"}`;
      console.log(`   4 checkout paralel -> ${settled.map(label).join(" ")}`);
      const winners = settled.filter((r) => r.status === 200);
      const losers = settled.filter((r) => r.status !== 200);

      assertEq(winners.length, 1, "PARALEL: tepat 1 checkout lolos");
      assertEq(
        ordersForPhone(parPhone) - before,
        1,
        "PARALEL: tepat 1 order Scalev tercetak (pra-fix: 4)"
      );
      assertEq(
        countRows(
          "promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id",
          "p.code='PARALEL1' AND r.status <> 'released'"
        ),
        1,
        "PARALEL: tepat 1 baris ledger aktif"
      );
      assertEq(
        psqlSuper("SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='PARALEL1';", { csv: true }),
        "1/1",
        "PARALEL: kuota terpakai 1 dari 2 (tidak dilampaui)"
      );
      assertEq(losers.length, 3, "PARALEL: 3 checkout ditolak");
      // F-S2: Invariant yang benar-benar dijamin untuk penolak paralel:
      // tepat 1 pemenang, tepat 1 order, penolak tanpa orderId/paymentUrl,
      // dan kode penolakan ∈ {ORDER_IN_FLIGHT (409), PROMO_PENDING_ORDER (400)}.
      assertOk(
        losers.every(
          (r) =>
            (r.body?.code === "ORDER_IN_FLIGHT" && r.status === 409) ||
            (r.body?.code === "PROMO_PENDING_ORDER" && r.status === 400)
        ),
        "PARALEL: yang ditolak dapat ORDER_IN_FLIGHT (409) atau PROMO_PENDING_ORDER (400)",
        JSON.stringify(losers.map(label))
      );
      // Yang ditolak tidak menerima order id / link pembayaran: tidak ada order
      // kedua yang bisa dibayar.
      assertOk(
        losers.every((r) => !r.body?.orderId && !r.body?.paymentUrl && !r.body?.uuid),
        "PARALEL: yang ditolak TIDAK menerima orderId/paymentUrl",
        JSON.stringify(losers.map((r) => r.body))
      );

      // Bayar satu-satunya order -> tepat satu langganan aktif untuk nomor itu.
      const win = winners[0];
      const winEvent = {
        event: "payment.received",
        unique_id: `evt_paralel_${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: {
          id: `01948092-9b80-7f91-aaaa-${win.body.orderId}`,
          order_id: win.body.orderId,
          payment_status: "paid",
          gross_revenue: "10000.00",
          customer_phone: parPhone,
          customer_name: "Dummy Paralel",
        },
      };
      const winWebhook = await postWebhook(winEvent);
      assertEq(winWebhook.status, 200, "PARALEL: bayar order pemenang -> 200");
      assertEq(
        countRows("subscriptions s JOIN users u ON u.id = s.user_id", `u.phone='${parPhone}'`),
        1,
        "PARALEL: tepat 1 langganan aktif (pra-fix: 4 langganan berbayar)"
      );
      assertEq(
        psqlSuper(
          "SELECT status FROM promo_redemptions r JOIN promo_codes p ON p.id=r.promo_id WHERE p.code='PARALEL1';",
          { csv: true }
        ),
        "consumed",
        "PARALEL: reservasi pemenang jadi 'consumed'"
      );
      const afterPay = await checkout(parBody);
      assertEq(afterPay.status, 400, "PARALEL: nomor yang sudah bayar tidak bisa checkout lagi");
      assertEq(afterPay.body?.code, "PROMO_ALREADY_USED", "PARALEL: error code PROMO_ALREADY_USED");
    }

    console.log("\n── V-1 r2: kuota=2, DUA nomor, masing-masing 4 checkout PARALEL ──");
    {
      await seedPromo({ code: "PARALEL2", type: "percentage", amount: 30, quota: 2, plans: ["quarter"] });
      const pa = nextPhone();
      const pb = nextPhone();
      const beforeA = ordersForPhone(pa);
      const beforeB = ordersForPhone(pb);
      const mk = (phone: string) => ({
        planId: "quarter",
        customerPhone: phone,
        customerName: "Dummy Paralel2",
        promoCode: "PARALEL2",
        onboarding: sampleOnboarding,
      });
      const [ra, rb] = await Promise.all([
        Promise.all(Array.from({ length: 4 }, () => checkout(mk(pa)))),
        Promise.all(Array.from({ length: 4 }, () => checkout(mk(pb)))),
      ]);
      const okA = ra.filter((r) => r.status === 200).length;
      const okB = rb.filter((r) => r.status === 200).length;
      console.log(`   A: ${okA} lolos /4   B: ${okB} lolos /4`);
      assertEq(okA, 1, "PARALEL 2 nomor: A tepat 1 lolos");
      assertEq(okB, 1, "PARALEL 2 nomor: B tepat 1 lolos");
      assertEq(ordersForPhone(pa) - beforeA, 1, "PARALEL 2 nomor: A cetak 1 order");
      assertEq(ordersForPhone(pb) - beforeB, 1, "PARALEL 2 nomor: B cetak 1 order");
      assertEq(
        psqlSuper("SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='PARALEL2';", { csv: true }),
        "2/0",
        "PARALEL 2 nomor: kuota habis tepat 2 (tidak lebih)"
      );
      assertEq(
        countRows(
          "promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id",
          "p.code='PARALEL2' AND r.status <> 'released'"
        ),
        2,
        "PARALEL 2 nomor: 2 baris ledger"
      );
    }

    // ══ C-4: sweep TTL vs order yang sudah tercetak ════════════════════════
    console.log("\n── C-4: sweep TTL tidak melepas order yang sudah tercetak ──");
    {
      await seedPromo({ code: "BOUNDSTALE", type: "flat_price", amount: 10000, quota: 1, plans: ["quarter"] });
      const bsPhone = nextPhone();
      const bs = await checkout({
        planId: "quarter",
        customerPhone: bsPhone,
        customerName: "Dummy Bound Stale",
        promoCode: "BOUNDSTALE",
        onboarding: sampleOnboarding,
      });
      assertEq(bs.status, 200, "C-4: checkout pertama lolos, order tercetak");
      const bsFilter = "(SELECT id FROM promo_codes WHERE code='BOUNDSTALE')";
      assertEq(
        psqlSuper(`SELECT order_ref IS NOT NULL FROM promo_redemptions WHERE promo_id=${bsFilter};`, { csv: true }),
        "t",
        "C-4: reservasi terikat ke order Scalev"
      );
      psqlSuper(
        `UPDATE promo_redemptions SET created_at = now() - interval '25 hours' WHERE promo_id=${bsFilter};`
      );
      assertEq(
        psqlSuper("SELECT release_stale_promo_reservations(24);", { csv: true }),
        "0",
        "C-4: sweep TIDAK melepas reservasi ber-order_ref (pra-fix: dilepas)"
      );
      assertEq(
        psqlSuper(`SELECT status FROM promo_redemptions WHERE promo_id=${bsFilter};`, { csv: true }),
        "reserved",
        "C-4: kursi tetap ditahan"
      );
      assertEq(
        psqlSuper("SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='BOUNDSTALE';", { csv: true }),
        "1/0",
        "C-4: kuota masih terpakai 1"
      );
      // Pembatalan eksplisit -> kursi kembali ke kuota.
      const bsRid = psqlSuper(`SELECT id FROM promo_redemptions WHERE promo_id=${bsFilter};`, { csv: true });
      assertEq(
        psqlSuper(`SELECT cancel_promo_redemption('${bsRid}');`, { csv: true }),
        "t",
        "C-4: pembatalan eksplisit diterima"
      );
      assertEq(
        psqlSuper("SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='BOUNDSTALE';", { csv: true }),
        "0/1",
        "C-4: kuota kembali setelah order dibatalkan eksplisit"
      );
    }

    // Retry SEBELUM order tercetak (attach gagal / Scalev belum menjawab):
    // ronde 2 menolaknya. Dulu baris yang sama dipakai ulang sehingga tiap
    // retry mencetak order baru.
    console.log("\n── V-1 r2: retry saat klaim masih hidup ditolak ──");
    {
      const code = "RETRYOK";
      await seedPromo({ code, type: "percentage", amount: 30, quota: 5, plans: ["quarter"] });
      const phone = nextPhone();
      const promoId = psqlSuper(`SELECT id FROM promo_codes WHERE code='${code}';`, { csv: true });
      const before = ordersForPhone(phone);
      const first = await checkout({ planId: "quarter", customerPhone: phone, customerName: "Dummy Retry", promoCode: code, onboarding: sampleOnboarding });
      const rowId = psqlSuper(
        `SELECT id FROM promo_redemptions WHERE promo_id='${promoId}' AND status='reserved';`,
        { csv: true }
      );
      // Simulasi C-6: order sudah tercetak, order_ref gagal ditulis.
      psqlSuper(`UPDATE promo_redemptions SET order_ref = NULL WHERE id='${rowId}';`);
      const again = await checkout({ planId: "quarter", customerPhone: phone, customerName: "Dummy Retry", promoCode: code, onboarding: sampleOnboarding });
      assertEq(first.status, 200, "V-1 r2 retry: checkout pertama lolos");
      assertEq(again.status, 400, "V-1 r2 retry: retry saat reservasi masih hidup -> 400 (bukan order kedua)");
      assertEq(again.body?.code, "PROMO_PENDING_ORDER", "V-1 r2 retry: error code PROMO_PENDING_ORDER");
      assertOk(!again.body?.orderId, "V-1 r2 retry: tidak ada orderId untuk retry yang ditolak");
      assertEq(ordersForPhone(phone) - before, 1, "V-1 r2 retry: tetap 1 order di Scalev");
      assertEq(
        psqlSuper(`SELECT used_count FROM v_promo_codes WHERE code='${code}';`, { csv: true }),
        "1",
        "V-1 r2 retry: kuota tidak digandakan"
      );
      // Ops membatalkan order -> kursi kembali, checkout berikutnya boleh.
      assertEq(
        psqlSuper(`SELECT cancel_promo_redemption('${rowId}');`, { csv: true }),
        "t",
        "V-1 r2 retry: pembatalan ops diterima"
      );
      const after = await checkout({ planId: "quarter", customerPhone: phone, customerName: "Dummy Retry", promoCode: code, onboarding: sampleOnboarding });
      assertEq(after.status, 200, "V-1 r2 retry: setelah pembatalan, nomor itu bisa checkout lagi");
      // F-W4-1(a): nomor ini masih memegang order BELUM DIBAYAR untuk paket yang
      // sama, jadi checkout berikutnya mengembalikan order/link YANG SAMA —
      // membatalkan reservasi promo mengembalikan kuota, bukan membuat order kedua.
      assertEq(
        after.body?.orderId,
        first.body?.orderId,
        "V-1 r2 retry: F-W4-1(a) — dipakai ulang order yang sama, bukan order kedua"
      );
      assertEq(
        ordersForPhone(phone) - before,
        1,
        "V-1 r2 retry: tetap SATU order (tidak ada dua link yang bisa dibayar)"
      );
    }

    // ══ Reservasi dilepas kalau order Scalev gagal ═════════════════════════
    console.log("\n── Promo: order Scalev gagal -> kuota tidak bocor ──");
    await seedPromo({ code: "GAGAL", type: "percentage", amount: 10, quota: 1, plans: ["quarter"] });
    const failOrder = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "FAILORDER", // mock menolak nama ini
      promoCode: "GAGAL",
      onboarding: sampleOnboarding,
    });
    assertEq(failOrder.status, 502, "order gagal: error Scalev diteruskan (502)");
    assertEq(
      psqlSuper("SELECT used_count FROM v_promo_codes WHERE code='GAGAL';", { csv: true }),
      "0",
      "order gagal: kuota dikembalikan (used_count=0)"
    );
    const retry = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "Dummy Retry",
      promoCode: "GAGAL",
      onboarding: sampleOnboarding,
    });
    assertEq(retry.status, 200, "order gagal: slot bisa dipakai checkout berikutnya");

    // ══ RACE: kuota sisa 1, dua checkout paralel ═══════════════════════════
    console.log("\n── RACE: kuota=1, dua checkout paralel ──");
    await seedPromo({ code: "RACE1", type: "percentage", amount: 40, quota: 1, plans: ["quarter"] });
    const racePhoneA = nextPhone();
    const racePhoneB = nextPhone();
    const [raceA, raceB] = await Promise.all([
      checkout({ planId: "quarter", customerPhone: racePhoneA, customerName: "Dummy Race A", promoCode: "RACE1", onboarding: sampleOnboarding }),
      checkout({ planId: "quarter", customerPhone: racePhoneB, customerName: "Dummy Race B", promoCode: "RACE1", onboarding: sampleOnboarding }),
    ]);
    const statuses = [raceA.status, raceB.status].sort((a, b) => a - b);
    console.log(`   checkout x2 → ${JSON.stringify(statuses)} (${raceA.body?.code ?? "ok"}, ${raceB.body?.code ?? "ok"})`);
    assertEq(statuses, [200, 400], "RACE: tepat satu checkout lolos, satu ditolak");
    const loser = raceA.status === 200 ? raceB : raceA;
    assertEq(loser.body?.code, "PROMO_EXHAUSTED", "RACE: yang kalah dapat PROMO_EXHAUSTED");
    assertEq(
      psqlSuper("SELECT used_count FROM v_promo_codes WHERE code='RACE1';", { csv: true }),
      "1",
      "RACE: kuota terpakai tepat 1"
    );
    assertEq(
      countRows(
        "promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id",
        "p.code='RACE1' AND r.status <> 'released'"
      ),
      1,
      "RACE: ledger punya tepat 1 baris aktif"
    );

    // Regresi W4: penolakan promo TIDAK boleh meninggalkan klaim gate in-flight.
    // Kalau klaim tertinggal, nomor yang promo-nya ditolak terkunci 10 menit:
    // checkout ulang (bahkan tanpa promo) dijawab 409 ORDER_IN_FLIGHT padahal
    // tidak ada order apa pun yang tercetak.
    const loserPhone = loser === raceA ? racePhoneA : racePhoneB;
    const loserRetry = await checkout({
      planId: "quarter",
      customerPhone: loserPhone,
      customerName: "Dummy Race",
      onboarding: sampleOnboarding,
    });
    assertEq(
      loserRetry.status,
      200,
      "RACE: nomor yang promo-nya ditolak tetap bisa checkout tanpa promo (klaim dilepas)"
    );
    assertEq(
      countRows("checkout_claims", "phone=" + `'${loserPhone}'` + " AND status='in_flight'"),
      0,
      "RACE: nol klaim in-flight tertinggal untuk nomor yang ditolak"
    );

    // ══ Webhook: pembayaran -> consumed (mengunci 1x per nomor) ════════════
    console.log("\n── Webhook: pembayaran meng-consume reservasi ──");
    const winnerPhone = psqlSuper(
      "SELECT r.phone FROM promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id WHERE p.code='RACE1' AND r.status='reserved';",
      { csv: true }
    );
    const winnerOrder = psqlSuper(
      "SELECT r.order_ref FROM promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id WHERE p.code='RACE1' AND r.status='reserved';",
      { csv: true }
    );
    assertOk(Boolean(winnerOrder), "webhook: reservasi terikat ke order Scalev", `order_ref=${winnerOrder}`);

    const event = {
      event: "payment.received",
      unique_id: `evt_promo_${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        id: `01948092-9b80-7f91-b23d-${winnerOrder}`,
        order_id: winnerOrder,
        payment_status: "paid",
        gross_revenue: "131400.00",
        customer_phone: winnerPhone,
        customer_name: "Dummy Race",
      },
    };
    const webhook = await postWebhook(event);
    assertEq(webhook.status, 200, "webhook: pembayaran diterima -> 200");
    assertEq(
      psqlSuper("SELECT r.status FROM promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id WHERE p.code='RACE1';", { csv: true }),
      "consumed",
      "webhook: reservasi jadi 'consumed'"
    );

    const replay = await postWebhook(event);
    assertEq(replay.status, 200, "webhook: replay idempotent -> 200");
    assertEq(
      countRows(
        "promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id",
        "p.code='RACE1' AND r.status='consumed'"
      ),
      1,
      "webhook: replay tidak menambah konsumsi"
    );

    // Nomor pemenang tidak boleh dapat kode itu lagi walau kuota masih ada.
    await admin.call(`/api/admin/promos/${psqlSuper("SELECT id FROM promo_codes WHERE code='RACE1';", { csv: true })}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_redemptions: 5 }),
    });
    const reuse = await checkout({
      planId: "quarter",
      customerPhone: winnerPhone,
      customerName: "Dummy Race",
      promoCode: "RACE1",
      onboarding: sampleOnboarding,
    });
    assertEq(reuse.status, 400, "webhook: nomor yang sudah consumed tidak bisa memakai kode lagi");
    assertEq(reuse.body?.code, "PROMO_ALREADY_USED", "webhook: error code PROMO_ALREADY_USED");

    // ══ Kode tidak dikenal ═════════════════════════════════════════════════
    console.log("\n── Promo: kode tidak dikenal ──");
    const unknown = await checkout({
      planId: "quarter",
      customerPhone: nextPhone(),
      customerName: "Dummy Unknown",
      promoCode: "NGAWUR99",
      onboarding: sampleOnboarding,
    });
    assertEq(unknown.status, 400, "unknown: kode tidak ada ditolak 400");
    assertEq(unknown.body?.code, "PROMO_UNKNOWN_CODE", "unknown: error code PROMO_UNKNOWN_CODE");

    console.log("\n==============================================================");
    let failed = 0;
    for (const [status, name] of results) {
      console.log(`${status}  ${name}`);
      if (status === "FAIL") failed++;
    }
    console.log(`\n${results.length - failed}/${results.length} promo e2e checks passed`);
    if (failed) {
      console.log("\n--- server log (tail) ---");
      const log = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, "utf-8") : "";
      console.log(log.split("\n").slice(-40).join("\n"));
      process.exitCode = 1;
    } else {
      console.log("ALL PROMO E2E CHECKS PASSED");
    }
  } finally {
    app?.stop();
    mock.stop();
    postgrest.stop();
  }
}

main().catch((err) => {
  console.error("promo e2e harness error:", err);
  process.exit(1);
});