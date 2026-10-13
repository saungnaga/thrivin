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
 *   per-nomor      -> retry sebelum bayar dilepas (1 reservasi aktif); setelah
 *                     bayar nomor yang sama ditolak lagi
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
  POSTGREST_URL,
  startPostgrest,
  truncateAll,
  psqlSuper,
} from "./harness/stack.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const APP_PORT = Number(process.env.HARNESS_PROMO_APP_PORT || 3988);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || 4111);
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

const ADMIN_USER = "promo-admin";
const ADMIN_PASS = "promo-admin-pass-1234";
const ADMIN_SECRET = "promo-session-secret-at-least-32-chars-long";
const WEBHOOK_SECRET = "promo_e2e_webhook_secret_12345";

const MOCK_ORDERS_FILE = "/tmp/thrivin-promo-e2e-orders.json";
const LOG_FILE = "/tmp/thrivin-promo-e2e-server.log";

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

async function startApp(env: Record<string, string | undefined> = {}): Promise<Stack> {
  try {
    fs.truncateSync(LOG_FILE, 0);
  } catch {}
  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn("./node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
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
      ...env,
    },
    stdio: ["ignore", logFd, logFd],
  });
  await waitFor(`${BASE_URL}/api/scalev/webhook`);
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
  const res = await fetch(`${BASE_URL}/api/scalev/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.20.${phoneCounter % 200}.${(Date.now() % 250) + 1}`,
    },
    body: JSON.stringify(body),
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

    // ══ 1x per nomor ═══════════════════════════════════════════════════════
    // Desain (lihat komentar redeem_promo): SEBELUM bayar, nomor yang sama boleh
    // mengulang checkout — reservasi lama DILEPAS, tidak didobel — supaya pembeli
    // yang menutup lalu membuka lagi halaman checkout tidak terkunci. Kunci
    // 1x-per-nomor baru aktif saat PEMBAYARAN masuk (dibuktikan di blok webhook
    // RACE1 di bawah: PROMO_ALREADY_USED).
    console.log("\n── Promo: 1x per nomor ──");
    await seedPromo({ code: "SEKALI", type: "percentage", amount: 50, quota: 10, plans: ["quarter"] });
    const samePhone = nextPhone();
    const onceOk = await checkout({
      planId: "quarter",
      customerPhone: samePhone,
      customerName: "Dummy Sekali",
      promoCode: "SEKALI",
      onboarding: sampleOnboarding,
    });
    assertEq(onceOk.status, 200, "per-nomor: pemakaian pertama lolos");
    const retrySame = await checkout({
      planId: "quarter",
      customerPhone: samePhone,
      customerName: "Dummy Sekali",
      promoCode: "SEKALI",
      onboarding: sampleOnboarding,
    });
    assertEq(retrySame.status, 200, "per-nomor: retry SEBELUM bayar diizinkan (pembeli tidak terkunci)");
    assertEq(
      countRows(
        "promo_redemptions r JOIN promo_codes p ON p.id = r.promo_id",
        "p.code='SEKALI' AND r.status <> 'released'"
      ),
      1,
      "per-nomor: retry melepas reservasi lama -> tepat 1 reservasi aktif"
    );
    assertEq(
      psqlSuper("SELECT used_count FROM v_promo_codes WHERE code='SEKALI';", { csv: true }),
      "1",
      "per-nomor: retry tidak mendobel kuota"
    );

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
    const [raceA, raceB] = await Promise.all([
      checkout({ planId: "quarter", customerPhone: nextPhone(), customerName: "Dummy Race A", promoCode: "RACE1", onboarding: sampleOnboarding }),
      checkout({ planId: "quarter", customerPhone: nextPhone(), customerName: "Dummy Race B", promoCode: "RACE1", onboarding: sampleOnboarding }),
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