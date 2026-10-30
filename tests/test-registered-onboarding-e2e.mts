/**
 * End-to-end: nomor TERDAFTAR → langsung halaman pilih paket (kartu t_a40e5534).
 *
 *   node --experimental-strip-types tests/test-registered-onboarding-e2e.mts
 *
 * Stack: Next.js (build produksi) → HTTP → PostgREST → Postgres lokal, mock
 * Scalev lokal. Nol staging, nol produksi, nol data customer, nol WhatsApp.
 *
 * Bukti per bagian:
 *   1. tanpa sesi        → GET /api/onboarding/progress 401 (bukan profil nomor apa pun)
 *   2. nomor baru        → profile null + subscription "new" (alur isi data tetap)
 *   3. aktif + snapshot  → profil program tersimpan ikut dikirim + sisa masa aktif
 *   4. non-aktif 12 hari → daysSinceExpiry 12 + renewalPromo true (bahan promo TEMANBARU)
 *   5. terdaftar tanpa snapshot → profile null ⇒ klien wajib jatuh ke alur isi data
 *   6. isolasi           → sesi A + nomor B di query/body tetap menjawab profil A
 *   7. checkout pelanggan lama → create-order 200 pakai snapshot, gate tetap utuh
 *      (langkah 2–8 diisi server dari snapshot, bukan gate dimatikan)
 *   8. kontrol            → terdaftar tanpa snapshot & tanpa progress tetap 400
 *   9. log                → tidak ada nomor mentah di log server
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
  recordConsent,
  waSessionCookie,
} from "./helpers/checkout-arm.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

// Slot port probe (15/16) sengaja dipakai: tidak ada suite lain di run-all.sh
// yang memakainya, jadi suite ini tidak menambah blok port baru.
const APP_PORT = Number(process.env.HARNESS_REG_APP_PORT || PORTS.probeApp);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || PORTS.probeMock);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
const ORDERS_FILE = tmpPath("reg-orders.json");
const LOG = tmpPath("reg-server.log");

const P = {
  active: "6281200000901",
  expired12d: "6281200000902",
  noSnapshot: "6281200000903",
  brandNew: "6281200000904",
  crossA: "6281200000905",
  crossB: "6281200000906",
  renewCheckout: "6281200000907",
};

const BASE_PROFILE = {
  gender: "Laki-laki",
  age: 29,
  weight: 70,
  height: 172,
  activityLevel: "Moderat",
  workoutLocation: "Di Rumah",
  programFocus: ["Workout & Strength"],
  biggestChallenge: "Gampang Mager & Hilang Niat",
  communicationStyle: "Santai & Akrab",
};

const SNAPSHOT = {
  active: {
    name: "Kembali Aktif",
    gender: "Perempuan",
    age: 31,
    weight: 58,
    height: 162,
    activityLevel: "Aktif",
    workoutLocation: "Di Gym",
    programFocus: ["Workout & Strength", "Nutrition"],
    biggestChallenge: "Waktu latihan tidak tetap",
    communicationStyle: "Tegas & Terarah",
  },
  expired12d: {
    name: "Kembali Lewat",
    gender: "Laki-laki",
    age: 27,
    weight: 74,
    height: 175,
    activityLevel: "Moderat",
    workoutLocation: "Di Rumah",
    programFocus: ["Fat Loss"],
    biggestChallenge: "Gampang Mager & Hilang Niat",
    communicationStyle: "Santai & Akrab",
  },
  crossA: { ...BASE_PROFILE, name: "Profil A" },
  crossB: { ...BASE_PROFILE, name: "Profil B" },
  renewCheckout: {
    name: "Perpanjang Uji",
    gender: "Laki-laki",
    age: 33,
    weight: 80,
    height: 178,
    activityLevel: "Ringan",
    workoutLocation: "Fleksibel",
    programFocus: ["Workout & Strength"],
    biggestChallenge: "Sering skip latihan",
    communicationStyle: "Lembut & Empatik",
  },
};

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

function sqlJson(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

function seedSnapshot(phone: string, orderId: string, snapshot: unknown, age = "40 days"): void {
  psqlSuper(
    `INSERT INTO onboarding_snapshots (tenant_id, phone, order_id, snapshot, created_at)
     VALUES ('thrivin', '${phone}', '${orderId}', ${sqlJson(snapshot)}, now() - interval '${age}');`
  );
}

function insertUser(phone: string, name: string): string {
  return psqlSuper(`INSERT INTO users (phone, name) VALUES ('${phone}', '${name}') RETURNING id;`, {
    csv: true,
  })
    .split("\n")[0]
    .trim();
}

function insertSubscription(userId: string, status: string, expiresExpr: string): void {
  psqlSuper(
    `INSERT INTO subscriptions (user_id, plan_id, status, started_at, expires_at, token_limit)
     VALUES ('${userId}', 2, '${status}', now() - interval '90 days', ${expiresExpr}, 500000);`
  );
}

function progressRows(phone: string): number {
  return Number(
    psqlSuper(`SELECT count(*) FROM onboarding_progress WHERE phone='${phone}';`, { csv: true })
  );
}

/** Jumlah LANGKAH tersimpan (satu baris per nomor, `steps` = jsonb per langkah). */
function progressSteps(phone: string): number {
  return Number(
    psqlSuper(
      `SELECT count(*) FROM onboarding_progress p, jsonb_object_keys(p.steps) k
       WHERE p.phone='${phone}';`,
      { csv: true }
    )
  );
}

function mockOrders(): any[] {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

interface Client {
  call: (pathname: string, init?: RequestInit) => Promise<{ status: number; body: any; raw: string }>;
  cookie: () => string;
}

function makeClient(base: string, ip: string, cookieValue = ""): Client {
  let cookie = cookieValue;
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
  };
}

function lookup(client: Client, phone: string) {
  return client.call("/api/wa/session/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
}

async function main() {
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  psqlSuper(
    "TRUNCATE webhook_events_inbox, onboarding_snapshots, subscriptions, users, " +
      "consent_events, onboarding_progress, checkout_claims RESTART IDENTITY CASCADE;"
  );
  try {
    fs.unlinkSync(ORDERS_FILE);
  } catch {}

  const postgrest = await startPostgrest();
  if (!postgrest) {
    console.error("PostgREST binary missing — cannot run the suite.");
    process.exit(1);
  }

  const mock = spawn(process.execPath, [path.join(HERE, "mock-scalev.mjs"), String(MOCK_PORT)], {
    env: {
      ...process.env,
      MOCK_SCALEV_PORT: String(MOCK_PORT),
      MOCK_SCALEV_ORDERS_FILE: ORDERS_FILE,
      MOCK_SCALEV_REDIRECT_URL: "https://thrivin.id/pembayaran/sukses",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  mock.stderr.on("data", (d) => process.stderr.write(`[mock-scalev] ${d}`));

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
      SCALEV_CANCEL_API_KEY: "mock-scalev-cancel-key-not-real",
      SCALEV_API_BASE_URL: MOCK_URL,
    } as Record<string, string>,
    stdio: ["ignore", logFd, logFd],
  });

  try {
    await assertMockOwner(MOCK_PORT, mock.pid);
    await waitFor(`${APP_URL}/nina/status`);

    // ── data dummy: pelanggan lama (snapshot + langganan) ────────────────────
    const idActive = insertUser(P.active, "Dummy Active");
    insertSubscription(idActive, "active", "now() + interval '20 days'");
    seedSnapshot(P.active, "order-active-0001", SNAPSHOT.active);

    const idExpired = insertUser(P.expired12d, "Dummy Expired 12");
    insertSubscription(idExpired, "expired", "now() - interval '12 days'");
    seedSnapshot(P.expired12d, "order-expired-0001", SNAPSHOT.expired12d);

    // Terdaftar (punya langganan) TAPI tidak punya snapshot program.
    const idNoSnap = insertUser(P.noSnapshot, "Dummy Tanpa Snapshot");
    insertSubscription(idNoSnap, "expired", "now() - interval '30 days'");

    // Dua nomor dengan profil berbeda untuk uji isolasi sesi.
    const idCrossA = insertUser(P.crossA, "Dummy Cross A");
    insertSubscription(idCrossA, "active", "now() + interval '10 days'");
    seedSnapshot(P.crossA, "order-cross-a-0001", SNAPSHOT.crossA);
    const idCrossB = insertUser(P.crossB, "Dummy Cross B");
    insertSubscription(idCrossB, "active", "now() + interval '10 days'");
    seedSnapshot(P.crossB, "order-cross-b-0001", SNAPSHOT.crossB);

    // Nomor perpanjangan untuk uji checkout memakai snapshot tersimpan.
    const idRenew = insertUser(P.renewCheckout, "Dummy Perpanjang");
    insertSubscription(idRenew, "expired", "now() - interval '45 days'");
    seedSnapshot(P.renewCheckout, "order-renew-0001", SNAPSHOT.renewCheckout);

    // ══ 1. Tanpa sesi ═══════════════════════════════════════════════════════
    section("Tanpa sesi: profil tidak bisa dibaca");
    const anon = makeClient(APP_URL, "10.55.0.1");
    const anonProgress = await anon.call("/api/onboarding/progress");
    assertEq(anonProgress.status, 401, "progress tanpa cookie -> 401");
    assertEq(anonProgress.body?.code, "SESSION_REQUIRED", "kode SESSION_REQUIRED");
    assertOk(!("profile" in (anonProgress.body || {})), "401 tidak membawa profil apa pun");

    // ══ 2. Nomor baru ═══════════════════════════════════════════════════════
    section("Nomor baru: alur isi data tidak berubah");
    const fresh = makeClient(APP_URL, "10.55.0.2");
    const freshLookup = await lookup(fresh, P.brandNew);
    assertEq(freshLookup.body?.status, "new", "lookup nomor baru -> new");
    const freshProgress = await fresh.call("/api/onboarding/progress");
    assertEq(freshProgress.status, 200, "progress nomor baru -> 200");
    assertEq(freshProgress.body?.profile, null, "nomor baru: profile null (isi data dari awal)");
    assertEq(freshProgress.body?.subscription?.status, "new", "nomor baru: subscription new");
    assertEq(freshProgress.body?.complete, false, "nomor baru: progress belum lengkap");

    // ══ 3. Aktif + snapshot ═════════════════════════════════════════════════
    section("Nomor aktif + snapshot: data program tersimpan ikut dikirim");
    const act = makeClient(APP_URL, "10.55.0.3");
    const actLookup = await lookup(act, P.active);
    assertEq(actLookup.body?.status, "active", "lookup aktif -> active");
    const actProgress = await act.call("/api/onboarding/progress");
    assertEq(actProgress.status, 200, "progress aktif -> 200");
    assertEq(actProgress.body?.subscription?.status, "active", "subscription active");
    assertOk(
      typeof actProgress.body?.subscription?.daysLeft === "number" &&
        actProgress.body.subscription.daysLeft >= 19 &&
        actProgress.body.subscription.daysLeft <= 20,
      "sisa masa aktif ~20 hari (bahan teks 'N hari lagi')",
      `daysLeft=${actProgress.body?.subscription?.daysLeft}`
    );
    const actProfile = actProgress.body?.profile || {};
    assertEq(actProfile.name, SNAPSHOT.active.name, "profil: nama panggilan dari snapshot");
    assertEq(actProfile.gender, SNAPSHOT.active.gender, "profil: gender dari snapshot");
    assertEq(actProfile.age, SNAPSHOT.active.age, "profil: umur dari snapshot");
    assertEq(actProfile.weight, SNAPSHOT.active.weight, "profil: berat dari snapshot");
    assertEq(actProfile.height, SNAPSHOT.active.height, "profil: tinggi dari snapshot");
    assertEq(actProfile.activityLevel, SNAPSHOT.active.activityLevel, "profil: aktivitas dari snapshot");
    assertEq(actProfile.workoutLocation, SNAPSHOT.active.workoutLocation, "profil: lokasi latihan");
    assertEq(actProfile.programFocus, SNAPSHOT.active.programFocus, "profil: fokus program");
    assertEq(actProfile.biggestChallenge, SNAPSHOT.active.biggestChallenge, "profil: hambatan");
    assertEq(actProfile.communicationStyle, SNAPSHOT.active.communicationStyle, "profil: gaya sapaan");
    assertOk(
      Object.values(actProfile).every((v) => v !== null && v !== "" && v !== undefined),
      "profil: tidak ada field kosong/placeholder di ringkasan",
      JSON.stringify(actProfile)
    );
    assertOk(!actProgress.raw.includes(P.active), "respons tidak memuat nomor mentah");

    // ══ 4. Non-aktif 12 hari ════════════════════════════════════════════════
    section("Nomor non-aktif: hitungan hari + penawaran promo");
    const exp = makeClient(APP_URL, "10.55.0.4");
    const expLookup = await lookup(exp, P.expired12d);
    assertEq(expLookup.body?.status, "inactive", "lookup kedaluwarsa -> inactive");
    const expProgress = await exp.call("/api/onboarding/progress");
    assertEq(expProgress.body?.subscription?.status, "inactive", "subscription inactive");
    assertEq(expProgress.body?.subscription?.daysSinceExpiry, 12, "berakhir 12 hari lalu");
    assertEq(expProgress.body?.subscription?.renewalPromo, true, "renewalPromo true (>7 hari)");
    assertEq(expProgress.body?.profile?.name, SNAPSHOT.expired12d.name, "profil non-aktif terisi");

    // ══ 5. Terdaftar tanpa snapshot ═════════════════════════════════════════
    section("Terdaftar tanpa snapshot: fallback ke alur isi data");
    const noSnap = makeClient(APP_URL, "10.55.0.5");
    const noSnapLookup = await lookup(noSnap, P.noSnapshot);
    assertEq(noSnapLookup.body?.status, "inactive", "lookup terdaftar -> inactive");
    const noSnapProgress = await noSnap.call("/api/onboarding/progress");
    assertEq(noSnapProgress.status, 200, "progress tetap 200");
    assertEq(
      noSnapProgress.body?.profile,
      null,
      "tanpa snapshot: profile null ⇒ klien wajib kembali ke alur isi data"
    );

    // ══ 6. Isolasi data antar nomor ═════════════════════════════════════════
    section("Isolasi: sesi A tidak bisa membaca profil B");
    const crossA = makeClient(APP_URL, "10.55.0.6");
    const crossLookup = await lookup(crossA, P.crossA);
    assertEq(crossLookup.body?.status, "active", "lookup A -> active");
    const crossWithQuery = await crossA.call(
      `/api/onboarding/progress?phone=${P.crossB}&customerPhone=${P.crossB}`
    );
    assertEq(crossWithQuery.status, 200, "progress dengan nomor B di query -> 200");
    assertEq(
      crossWithQuery.body?.profile?.name,
      SNAPSHOT.crossA.name,
      "query nomor B DIABAIKAN: yang dijawab tetap profil sesi A"
    );
    assertOk(
      !crossWithQuery.raw.includes(SNAPSHOT.crossB.name) &&
        !crossWithQuery.raw.includes("Profil B"),
      "respons sesi A tidak memuat data nomor B"
    );

    const crossBody = await crossA.call("/api/onboarding/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: 8,
        data: { communicationStyle: "Santai & Akrab", whatsappNumber: P.crossB },
      }),
    });
    assertEq(crossBody.status, 409, "POST langkah 8 dengan nomor B -> 409");
    assertEq(crossBody.body?.code, "SESSION_PHONE_MISMATCH", "kode SESSION_PHONE_MISMATCH");
    assertEq(
      progressRows(P.crossB),
      0,
      "profil nomor B tidak tertulis lewat sesi A"
    );

    // ══ 7. Checkout pelanggan lama memakai snapshot ═════════════════════════
    section("Checkout pelanggan lama: gate tetap utuh, profil dari snapshot");
    const renewCookie = waSessionCookie(P.renewCheckout);
    assertEq(progressRows(P.renewCheckout), 0, "prasyarat: belum ada baris onboarding_progress");
    const ordersBefore = mockOrders().length;
    await recordConsent({
      base: APP_URL,
      phone: P.renewCheckout,
      cookie: renewCookie,
      idempotencyKey: "consent-renew-0001",
    });

    const orderRes = await fetch(`${APP_URL}/api/scalev/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: renewCookie,
        "X-Forwarded-For": "10.55.0.7",
      },
      body: JSON.stringify({
        planId: "quarter",
        customerPhone: P.renewCheckout,
        idempotencyKey: "idem-renew-snapshot-0001",
      }),
    });
    const orderBody = await orderRes.json().catch(() => null);
    assertEq(orderRes.status, 200, "create-order pelanggan lama -> 200");
    assertOk(
      typeof orderBody?.paymentUrl === "string" && orderBody.paymentUrl.length > 0,
      "create-order mengembalikan paymentUrl",
      JSON.stringify(orderBody)
    );
    assertOk(
      orderBody?.code !== "INCOMPLETE_ONBOARDING" && orderBody?.code !== "SESSION_REQUIRED",
      "tidak kena INCOMPLETE_ONBOARDING / SESSION_REQUIRED",
      `code=${orderBody?.code}`
    );
    assertEq(
      progressSteps(P.renewCheckout),
      7,
      "server mengisi 7 langkah dari snapshot (gate utuh)"
    );
    assertEq(mockOrders().length, ordersBefore + 1, "tepat satu order dibuat di Scalev (mock)");

    const seededName = psqlSuper(
      `SELECT snapshot->>'name' FROM onboarding_snapshots
       WHERE phone='${P.renewCheckout}' ORDER BY created_at DESC LIMIT 1;`,
      { csv: true }
    );
    assertEq(seededName.split("\n")[0], SNAPSHOT.renewCheckout.name, "snapshot order baru menyimpan nama");

    // ══ 8. Kontrol: gate tidak dilonggarkan ═════════════════════════════════
    section("Kontrol: terdaftar tanpa snapshot tetap ditolak gate");
    const controlCookie = waSessionCookie(P.noSnapshot);
    await recordConsent({
      base: APP_URL,
      phone: P.noSnapshot,
      cookie: controlCookie,
      idempotencyKey: "consent-control-0001",
    });
    const controlRes = await fetch(`${APP_URL}/api/scalev/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: controlCookie,
        "X-Forwarded-For": "10.55.0.8",
      },
      body: JSON.stringify({
        planId: "quarter",
        customerPhone: P.noSnapshot,
        idempotencyKey: "idem-control-no-snapshot-0001",
      }),
    });
    const controlBody = await controlRes.json().catch(() => null);
    assertEq(controlRes.status, 400, "tanpa snapshot & tanpa progress -> 400");
    assertEq(controlBody?.code, "INCOMPLETE_ONBOARDING", "kode INCOMPLETE_ONBOARDING");
    assertEq(progressRows(P.noSnapshot), 0, "tidak ada langkah yang dikarang");

    // ══ 9. Log ══════════════════════════════════════════════════════════════
    section("Log: tidak ada nomor mentah");
    const serverLog = fs.readFileSync(LOG, "utf-8");
    const rawPhones = Object.values(P).filter((phone) => serverLog.includes(phone));
    assertEq(rawPhones, [], "log server bersih dari nomor mentah");
  } finally {
    try {
      app.kill("SIGKILL");
    } catch {}
    try {
      mock.kill("SIGKILL");
    } catch {}
    try {
      postgrest.stop();
    } catch {}
  }

  const failed = results.filter(([status]) => status === "FAIL");
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(
    `\n${results.length - failed.length}/${results.length} registered-onboarding e2e checks passed` +
      (failed.length ? " — FAILED" : "")
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
