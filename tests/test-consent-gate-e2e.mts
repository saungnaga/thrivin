/**
 * End-to-end gate checkout + consent W4 (kartu t_f5ec336c).
 *
 *   node --experimental-strip-types tests/test-consent-gate-e2e.mts
 *
 * Stack: Next.js (build produksi) -> HTTP -> PostgREST -> Postgres lokal, dengan
 * mock Scalev lokal. Tidak ada Scalev nyata, tidak ada staging, tidak ada data
 * customer. Bukti per item ada di header setiap bagian.
 */
import fs from "fs";
import path from "path";
import { spawn, execFileSync } from "child_process";
import {
  POSTGREST_URL,
  SERVICE_KEY,
  startPostgrest,
  psqlSuper,
} from "./harness/stack.mts";
import { resolvePlanPrice } from "../src/lib/plans.ts";
import {
  DEFAULT_WA_SESSION_SECRET,
  TERMS_VERSION,
  armCheckout,
  craftWaSessionToken,
  fullStepPayloads,
  newIdempotencyKey,
  saveProgress,
  waSessionCookie,
} from "./helpers/checkout-arm.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const APP_PORT = Number(process.env.HARNESS_W4_APP_PORT || 3981);
const BROKEN_APP_PORT = Number(process.env.HARNESS_W4_BROKEN_PORT || 3982);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || 4121);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const BROKEN_URL = `http://127.0.0.1:${BROKEN_APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
const ORDERS_FILE = process.env.MOCK_SCALEV_ORDERS_FILE || "/tmp/thrivin-w4-mock-orders.json";
const LOG = "/tmp/thrivin-w4-server.log";
const BROKEN_LOG = "/tmp/thrivin-w4-broken.log";
/** Port tanpa apa-apa: mensimulasikan Supabase mati. */
const DEAD_SUPABASE = "http://127.0.0.1:59996";

const P = {
  happy: "6281200000801",
  price: "6281200000802",
  optIn: "6281200000803",
  stop: "6281200000804",
  replay: "6281200000805",
  race: "6281200000806",
  raceTwoKeys: "6281200000807",
  partial: "6281200000808",
  noConsent: "6281200000809",
  mismatched: "6281200000810",
  adminAllowed: "6281200000811",
  tampered: "6281200000812",
  invalidStep: "6281200000813",
  crossConsent: "6281200000814",
  repeatBuy: "6281200000815",
  neg: "6281200000816",
  mismatchBody: "6281200000817",
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

interface Stack {
  stop: () => void;
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
    SCALEV_API_KEY: "mock-scalev-key-not-real",
    SCALEV_API_BASE_URL: MOCK_URL,
    NINA_ADMIN_PHONES: P.adminAllowed,
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
  await waitFor(`http://127.0.0.1:${port}/privacy`);
  return {
    stop: () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    },
  };
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

async function postJson(
  base: string,
  pathname: string,
  cookie: string | null,
  body: unknown
): Promise<{ status: number; body: any }> {
  // IP berbeda per permintaan: suite ini menguji gate, bukan batas laju
  // (batas laju punya suite sendiri). Sama seperti suite W3/W5.
  const ip = `10.77.${(Date.now() % 200) + 1}.${(Date.now() % 250) + 1}`;
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  return { status: res.status, body: parsed };
}

/** `create-order` seperti yang dipanggil UI. */
function createOrder(
  phone: string,
  idempotencyKey: string,
  extra: Record<string, unknown> = {},
  base: string = APP_URL,
  cookieOverride?: string
) {
  return postJson(
    base,
    "/api/scalev/create-order",
    cookieOverride ?? waSessionCookie(phone),
    {
      planId: "quarter",
      customerPhone: phone,
      idempotencyKey,
      ...extra,
    }
  );
}

function consentRows(phone: string): Array<{ type: string; value: boolean; version: string; source: string }> {
  const out = psqlSuper(
    `select consent_type, value, text_version, source from consent_events where phone='${phone}' order by created_at`,
    { csv: true }
  );
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [type, value, version, source] = line.split("|");
    return { type, value: value === "t", version, source };
  });
}

function consentState(phone: string): any {
  const out = psqlSuper(`select consent_state_for_phone('${phone}')::text`, { csv: true });
  return JSON.parse(out.split("\n").pop() as string);
}

async function main() {
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  psqlSuper("TRUNCATE consent_events, onboarding_progress, checkout_claims RESTART IDENTITY CASCADE;");

  // Mock Scalev + PostgREST + dua instance app (normal & Supabase mati).
  const mock = spawn(process.execPath, [path.join(HERE, "mock-scalev.mjs"), String(MOCK_PORT)], {
    env: { ...process.env, MOCK_SCALEV_PORT: String(MOCK_PORT), MOCK_SCALEV_ORDERS_FILE: ORDERS_FILE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  mock.stderr.on("data", (d) => process.stderr.write(`[mock-scalev] ${d}`));
  const postgrest = await startPostgrest();
  const app = await startApp();
  const brokenApp = await startApp({ SUPABASE_URL: DEAD_SUPABASE }, BROKEN_APP_PORT, BROKEN_LOG);

  try {
    // ═══ A. Gate menolak SEBELUM efek samping eksternal ════════════════════
    section("A. gate menolak sebelum order eksternal");
    const baseOrders = mockOrderCount();

    const noSession = await postJson(APP_URL, "/api/scalev/create-order", null, {
      planId: "quarter",
      customerPhone: P.neg,
      idempotencyKey: newIdempotencyKey("nosession"),
    });
    assertEq(noSession.status, 401, "tanpa sesi ⇒ 401");
    assertEq(noSession.body?.code, "SESSION_REQUIRED", "kode SESSION_REQUIRED");

    const expiredCookie = waSessionCookie(P.happy, { ttlMs: -1000 });
    const expired = await createOrder(P.neg, newIdempotencyKey("expired"), {}, APP_URL, expiredCookie);
    assertEq(expired.status, 401, "sesi kedaluwarsa ⇒ 401");

    const forged =
      "eyJwaG9uZSI6IjYyODEyMDAwMDA4MDEiLCJleHAiOjQwMDAwMDAwMDAwMDB9.not-a-real-signature";
    const forgedRes = await createOrder(P.neg, newIdempotencyKey("forged"), {}, APP_URL, forged);
    assertEq(forgedRes.status, 401, "sesi dipalsukan ⇒ 401 (fail closed)");

    const noKey = await postJson(APP_URL, "/api/scalev/create-order", waSessionCookie(P.neg), {
      planId: "quarter",
      customerPhone: P.neg,
    });
    assertEq(noKey.status, 400, "tanpa kunci idempotensi ⇒ 400");
    assertEq(noKey.body?.code, "IDEMPOTENCY_KEY_REQUIRED", "kode IDEMPOTENCY_KEY_REQUIRED");

    // Disagreement server/client: nomor body ≠ nomor sesi.
    const mismatch = await postJson(
      APP_URL,
      "/api/scalev/create-order",
      waSessionCookie(P.mismatched),
      {
        planId: "quarter",
        customerPhone: P.mismatchBody,
        idempotencyKey: newIdempotencyKey("mismatch"),
      }
    );
    assertEq(mismatch.status, 403, "nomor body ≠ nomor sesi ⇒ 403");
    assertEq(mismatch.body?.code, "PHONE_SESSION_MISMATCH", "kode PHONE_SESSION_MISMATCH");

    // Langkah tidak lengkap (hanya 2–6).
    const partialSteps = fullStepPayloads(P.partial);
    delete partialSteps[7];
    delete partialSteps[8];
    await saveProgress({ base: APP_URL, phone: P.partial, cookie: waSessionCookie(P.partial), steps: partialSteps });
    const incomplete = await createOrder(P.partial, newIdempotencyKey("partial"));
    assertEq(incomplete.status, 400, "langkah belum lengkap ⇒ 400");
    assertEq(incomplete.body?.code, "INCOMPLETE_ONBOARDING", "kode INCOMPLETE_ONBOARDING");
    assertEq(incomplete.body?.missingSteps, [7, 8], "langkah yang hilang dilaporkan server");

    // Langkah lengkap tapi consent belum ada.
    await saveProgress({ base: APP_URL, phone: P.noConsent, cookie: waSessionCookie(P.noConsent) });
    const consentMissing = await createOrder(P.noConsent, newIdempotencyKey("noconsent"));
    assertEq(consentMissing.status, 400, "belum ada consent T&C ⇒ 400");
    assertEq(consentMissing.body?.code, "CONSENT_REQUIRED", "kode CONSENT_REQUIRED");

    // Nomor allowlist admin TIDAK melewati gate.
    const adminBypass = await createOrder(P.adminAllowed, newIdempotencyKey("adminbypass"));
    assertEq(adminBypass.status, 400, "nomor allowlist admin tetap kena gate");
    assertEq(adminBypass.body?.code, "INCOMPLETE_ONBOARDING", "allowlist tidak melewati langkah wajib");

    // Data tersimpan yang sudah tidak valid: validasi ULANG saat gate.
    await armCheckout({ base: APP_URL, phone: P.tampered, cookie: waSessionCookie(P.tampered) });
    psqlSuper(
      `UPDATE onboarding_progress SET steps = steps || '{"4": {"height": 500, "weight": 65}}'::jsonb WHERE phone='${P.tampered}'`
    );
    const tamperedStored = await createOrder(P.tampered, newIdempotencyKey("tampered"));
    assertEq(tamperedStored.status, 400, "data tersimpan tidak valid ⇒ 400");
    assertEq(tamperedStored.body?.code, "INVALID_ONBOARDING", "kode INVALID_ONBOARDING");

    // Langkah 8 dengan nomor berbeda dari sesi: ditolak di titik simpan.
    const step8Mismatch = await postJson(
      APP_URL,
      "/api/onboarding/progress",
      waSessionCookie(P.invalidStep),
      { step: 8, data: { communicationStyle: "Santai & Akrab", whatsappNumber: P.happy } }
    );
    assertEq(step8Mismatch.status, 409, "langkah 8 dengan nomor lain ⇒ 409");
    assertEq(step8Mismatch.body?.code, "SESSION_PHONE_MISMATCH", "kode SESSION_PHONE_MISMATCH");

    // Step tidak valid: ditolak server (bukan cuma UI).
    const invalidStep = await postJson(
      APP_URL,
      "/api/onboarding/progress",
      waSessionCookie(P.invalidStep),
      { step: 3, data: { gender: "Laki-laki", age: 5 } }
    );
    assertEq(invalidStep.status, 400, "data langkah di luar rentang ⇒ 400");
    assertEq(invalidStep.body?.code, "INVALID_STEP_DATA", "kode INVALID_STEP_DATA");

    assertEq(mockOrderCount(), baseOrders, "nol panggilan order ke Scalev pada semua kegagalan gate");

    // ═══ B. Happy path + integritas harga/paket ═══════════════════════════
    section("B. order sah + harga dari katalog server");
    const happyArm = await armCheckout({
      base: APP_URL,
      phone: P.happy,
      cookie: waSessionCookie(P.happy),
    });
    assertEq(happyArm.consent.status, 200, "consent tersimpan (200)");
    assertEq(happyArm.consent.body?.termsVersion, TERMS_VERSION, "versi T&C yang dicatat = versi yang ditampilkan");

    const happy = await createOrder(P.happy, happyArm.idempotencyKey, {
      // Klien mencoba menekan harga & paket: harus DIABAIKAN.
      amount: 1000,
      planName: "Paket Gratis",
      customerName: "HACKER",
      onboarding: { height: 500, weight: 500, age: 999 },
    });
    assertEq(happy.status, 200, "checkout sah ⇒ 200");
    assertOk(!!happy.body?.paymentUrl, "paymentUrl dikembalikan", JSON.stringify(happy.body));

    const createdOrders = mockOrders();
    assertEq(createdOrders.length, baseOrders + 1, "tepat satu order dibuat di Scalev");
    const payload = createdOrders[createdOrders.length - 1]?.body || {};
    const catalogPrice = resolvePlanPrice("quarter").price;
    const unit = 219000; // harga varian `quarter` di mock
    const qty = Number(payload.ordervariants?.[0]?.quantity || 0);
    const gross = unit * qty;
    const discount = Number(payload.product_discount || 0);
    assertEq(gross - discount, catalogPrice, "total yang akan ditagih = harga katalog server (bukan angka klien)");
    assertEq(payload.customer_phone, P.happy, "order memakai nomor sesi terverifikasi");
    assertEq(payload.customer_name, "Kawan Uji", "nama dari profil server, bukan body");
    assertOk(String(payload.notes || "").length > 0, "catatan order terisi (tanpa PII kesehatan)");
    assertOk(!JSON.stringify(payload).includes("HACKER"), "body klien tidak bocor ke Scalev");

    const happyState = consentState(P.happy);
    assertEq(happyState.terms_accepted, true, "T&C tercatat untuk nomor ini");
    assertEq(happyState.opt_in, false, "pengingat ditolak ⇒ opt_in false");
    assertEq(happyState.opted_out, false, "menolak pengingat BUKAN opt-out");
    assertEq(
      consentRows(P.happy).filter((r) => r.type === "reminder_whatsapp").map((r) => r.value),
      [false],
      "nilai `false` tetap disimpan sebagai baris (bukan 'tidak ada data')"
    );

    // Consent untuk nomor lain dari sesi ini: tidak bisa (nomor dari body diabaikan).
    const crossConsent = await postJson(APP_URL, "/api/consent", waSessionCookie(P.crossConsent), {
      termsAccepted: true,
      reminderOptIn: false,
      phone: P.happy,
      idempotencyKey: newIdempotencyKey("cross"),
    });
    assertEq(crossConsent.status, 200, "consent untuk sesi sendiri ⇒ 200");
    assertEq(
      consentRows(P.happy).filter((r) => r.source === "checkout_step9").length >= 2,
      true,
      "baris consent nomor lain tidak bertambah"
    );
    assertEq(consentRows(P.crossConsent).length, 2, "consent tercatat untuk nomor sesi (2 baris: T&C + pengingat)");

    // Opt-in true disimpan dan menyalakan status efektif.
    const optInArm = await armCheckout({
      base: APP_URL,
      phone: P.optIn,
      cookie: waSessionCookie(P.optIn),
      optIn: true,
    });
    await createOrder(P.optIn, optInArm.idempotencyKey);
    const optInState = consentState(P.optIn);
    assertEq(optInState.opt_in, true, "opt-in true tersimpan di users.opt_in");
    assertEq(optInState.opted_out, false, "opt-in tidak mengaktifkan opted_out");

    // ═══ C. Replay / race ═════════════════════════════════════════════════
    section("C. replay & race (satu order saja)");
    const beforeReplay = mockOrderCount();
    const replay = await createOrder(P.happy, happyArm.idempotencyKey);
    assertEq(replay.status, 200, "replay kunci yang sama ⇒ 200");
    assertEq(replay.body?.orderId, happy.body?.orderId, "replay mengembalikan order_id SAMA");
    assertEq(replay.body?.replay, true, "jawaban ditandai replay");
    assertEq(mockOrderCount(), beforeReplay, "replay TIDAK membuat order baru");

    // F-S1: Nomor B mencoba replay menggunakan kunci milik nomor A (happy)
    // Sesi B valid, tetapi kunci sudah terikat ke A ⇒ 409 IDEMPOTENCY_KEY_CONFLICT
    // Tidak boleh mengembalikan order_id atau payment_url.
    const crossPhone = await createOrder(P.replay, happyArm.idempotencyKey);
    assertEq(crossPhone.status, 409, "F-S1: replay kunci milik nomor lain ditolak 409");
    assertEq(crossPhone.body?.code, "IDEMPOTENCY_KEY_CONFLICT", "F-S1: kode IDEMPOTENCY_KEY_CONFLICT");
    assertOk(!crossPhone.body?.orderId, "F-S1: tidak ada orderId yang bocor");
    assertOk(!crossPhone.body?.paymentUrl, "F-S1: tidak ada paymentUrl yang bocor");

    const raceArm = await armCheckout({
      base: APP_URL,
      phone: P.race,
      cookie: waSessionCookie(P.race),
    });
    const beforeRace = mockOrderCount();
    const raceResults = await Promise.all([
      createOrder(P.race, raceArm.idempotencyKey),
      createOrder(P.race, raceArm.idempotencyKey),
      createOrder(P.race, raceArm.idempotencyKey),
    ]);
    const raceCreated = mockOrderCount() - beforeRace;
    assertEq(raceCreated, 1, "tiga permintaan paralel dengan kunci sama ⇒ satu order");
    const race200 = raceResults.filter((r) => r.status === 200);
    const race409 = raceResults.filter((r) => r.status === 409);
    assertEq(race200.length + race409.length, 3, "sisanya dijawab 200 (replay) atau 409 (in-flight)");
    assertEq(
      new Set(race200.map((r) => r.body?.orderId)).size,
      1,
      "semua jawaban 200 menunjuk order yang sama"
    );

    // Dua kunci BERBEDA, nomor sama, paralel, paket sama. F-W4-1 (opsi a) mulai
    // berlaku di sini: klik ulang / tab kedua / reload TIDAK boleh mencetak order
    // kedua selama order belum dibayar masih hidup. Yang dijamin (bukan asumsi
    // urutan): tepat SATU order tercetak, setiap jawaban 200 menunjuk order yang
    // SAMA, sisanya 409 (in-flight).
    const twoKeysArm = await armCheckout({
      base: APP_URL,
      phone: P.raceTwoKeys,
      cookie: waSessionCookie(P.raceTwoKeys),
    });
    const beforeTwoKeys = mockOrderCount();
    const twoKeysCount = 4;
    const twoKeyResults = await Promise.all(
      Array.from({ length: twoKeysCount }, (_, i) =>
        createOrder(P.raceTwoKeys, i === 0 ? twoKeysArm.idempotencyKey : newIdempotencyKey(`other${i}`))
      )
    );
    const twoKeysCreated = mockOrderCount() - beforeTwoKeys;
    const twoKeys200 = twoKeyResults.filter((r) => r.status === 200);
    assertEq(
      twoKeysCreated,
      1,
      `dua kunci berbeda paralel: tepat SATU order tercetak (pra-F-W4-1: 2 bisa tercetak, terukur ${twoKeysCreated})`
    );
    assertOk(
      twoKeys200.length >= 1,
      "dua kunci berbeda paralel: minimal satu permintaan dilayani",
      JSON.stringify(twoKeyResults.map((r) => r.status))
    );
    assertEq(
      new Set(twoKeys200.map((r) => r.body?.orderId)).size,
      1,
      "dua kunci berbeda paralel: semua jawaban 200 menunjuk order yang SAMA"
    );
    assertOk(
      twoKeyResults.every((r) => r.status === 200 || r.status === 409),
      "dua kunci berbeda paralel: status ∈ {200 (order yang sama), 409 (in-flight)}",
      JSON.stringify(twoKeyResults.map((r) => r.status))
    );

    // ═══ C2. F-W4-1 (keputusan owner 16/10, opsi a) ════════════════════════
    // Aturan: paket SAMA + masih ada order belum dibayar ⇒ kunci baru
    // DIKEMBALIKAN ke order/link yang sama; paket BEDA ⇒ diblokir eksplisit;
    // kunci sama dari nomor beda ⇒ tetap 409 IDEMPOTENCY_KEY_CONFLICT (F-S1).
    section("C2. F-W4-1: satu nomor = satu order belum dibayar");
    const fw1Arm = await armCheckout({
      base: APP_URL,
      phone: P.repeatBuy,
      cookie: waSessionCookie(P.repeatBuy),
    });
    const fw1First = await createOrder(P.repeatBuy, fw1Arm.idempotencyKey);
    assertEq(fw1First.status, 200, "F-W4-1: order pertama (quarter) ⇒ 200");
    const beforeReuse = mockOrderCount();

    // (1) paket sama + kunci baru ⇒ link lama, bukan order kedua.
    const reused = await createOrder(P.repeatBuy, newIdempotencyKey("fw1reuse"));
    assertEq(reused.status, 200, "F-W4-1(a): kunci baru paket sama ⇒ 200");
    assertEq(reused.body?.orderId, fw1First.body?.orderId, "F-W4-1(a): orderId yang SAMA");
    assertEq(reused.body?.paymentUrl, fw1First.body?.paymentUrl, "F-W4-1(a): link bayar yang SAMA");
    assertEq(reused.body?.unpaidOrderReused, true, "F-W4-1(a): jawaban ditandai unpaidOrderReused");
    assertEq(mockOrderCount(), beforeReuse, "F-W4-1(a): TIDAK ada order kedua di Scalev");

    // (2) paket BEDA ⇒ blokir eksplisit tanpa data order apa pun.
    const fw1Conflict = await createOrder(P.repeatBuy, newIdempotencyKey("fw1conflict"), {
      planId: "month",
    });
    assertEq(fw1Conflict.status, 409, "F-W4-1(a): paket beda ⇒ 409");
    assertEq(fw1Conflict.body?.code, "UNPAID_ORDER_EXISTS", "F-W4-1(a): kode UNPAID_ORDER_EXISTS");
    assertOk(
      !fw1Conflict.body?.orderId && !fw1Conflict.body?.paymentUrl,
      "F-W4-1(a): paket beda tidak membocorkan orderId/paymentUrl"
    );
    assertEq(mockOrderCount(), beforeReuse, "F-W4-1(a): paket beda juga tidak mencetak order");

    // (3) order pertama DIBAYAR (webhook memanggil mark_checkout_claim_paid) ⇒
    // pembelian ulang sah: kunci baru mencetak order baru.
    assertEq(
      psqlSuper(
        `select coalesce(paid_at::text,'') from checkout_claims where order_id='${fw1First.body.orderId}'`,
        { csv: true }
      ),
      "",
      "F-W4-1: pra-syarat — order pertama belum lunas"
    );
    psqlSuper(`select mark_checkout_claim_paid('${fw1First.body.orderId}')`);
    const afterPaid = await createOrder(P.repeatBuy, newIdempotencyKey("fw1paid"));
    assertEq(afterPaid.status, 200, "F-W4-1(a): setelah dibayar, kunci baru ⇒ 200");
    assertEq(mockOrderCount() - beforeReuse, 1, "F-W4-1(a): ... mencetak SATU order baru");
    assertOk(
      afterPaid.body?.orderId !== fw1First.body?.orderId,
      "F-W4-1(a): order baru itu memang order yang berbeda"
    );
    assertEq(
      mockOrderCount() - beforeReuse,
      1,
      "F-W4-1(a): totalnya tetap satu order baru (reuse tidak menghitung order)"
    );

    // (4) order belum dibayar yang DITINGGALKAN (> TTL 60 menit) tidak memblokir
    // selamanya — kalau tidak, pengguna tanpa tiket CS tidak punya jalan keluar.
    psqlSuper(
      `update checkout_claims set created_at = now() - interval '61 minutes' where order_id='${afterPaid.body.orderId}'`
    );
    const beforeAbandon = mockOrderCount();
    const abandoned = await createOrder(P.repeatBuy, newIdempotencyKey("fw1stale"));
    assertEq(abandoned.status, 200, "F-W4-1(a): order belum dibayar > TTL ⇒ checkout baru boleh");
    assertEq(mockOrderCount() - beforeAbandon, 1, "F-W4-1(a): ... mencetak satu order baru");
    assertEq(
      psqlSuper(
        `select status from checkout_claims where order_id='${afterPaid.body.orderId}'`,
        { csv: true }
      ),
      "failed",
      "F-W4-1(a): order yang ditinggalkan ditandai failed (tidak menahan nomor)"
    );

    // ═══ D. Opt-out eksplisit & retry lama ════════════════════════════════
    section("D. opt-out menang, retry lama tidak menyalakan ulang");
    await armCheckout({
      base: APP_URL,
      phone: P.stop,
      cookie: waSessionCookie(P.stop),
      optIn: true,
    });
    await createOrder(P.stop, newIdempotencyKey("stop"));
    assertEq(consentState(P.stop).opt_in, true, "pra-syarat: opt_in true");

    // Peristiwa BERHENTI eksplisit (jalur N2) — harus menang.
    psqlSuper(
      `select record_consent_event('${P.stop}','reminder_whatsapp',false,'whatsapp_optout','reminder-optin-2026-10-15-v1','stop-event-1', now() + interval '1 minute')`
    );
    const afterStop = consentState(P.stop);
    assertEq(afterStop.opt_in, false, "setelah BERHENTI ⇒ opt_in false");
    assertEq(afterStop.opted_out, true, "setelah BERHENTI ⇒ opted_out true");

    // Retry event opt-in LAMA (kunci baru, waktu kejadian lebih tua) tidak menyalakan ulang.
    psqlSuper(
      `select record_consent_event('${P.stop}','reminder_whatsapp',true,'checkout_step9','reminder-optin-2026-10-15-v1','stop-event-2', now() - interval '10 minutes')`
    );
    const afterStaleReplay = consentState(P.stop);
    assertEq(afterStaleReplay.opt_in, false, "retry lama (occurred_at lebih tua) tidak menyalakan opt_in");
    assertEq(afterStaleReplay.opted_out, true, "opt-out tetap menang");

    // Replay kunci event lama juga tidak mengubah state.
    psqlSuper(
      `select record_consent_event('${P.stop}','reminder_whatsapp',true,'checkout_step9','reminder-optin-2026-10-15-v1','stop-event-2', now())`
    );
    assertEq(consentState(P.stop).opted_out, true, "replay kunci lama (idempotent) tidak menghapus opt-out");

    // Bayar TIDAK menyalakan opt-in: nomor tanpa consent tetap butuh T&C, dan
    // order yang sudah dibayar tidak menyentuh kolom consent.
    assertEq(consentState(P.happy).opt_in, false, "order pada nomor lain tidak menyalakan opt-in");

    // ═══ E. Gagal simpan consent ⇒ tidak ada sukses palsu ═════════════════
    section("E. simpan consent gagal ⇒ tidak lanjut bayar");
    const brokenConsent = await postJson(BROKEN_URL, "/api/consent", waSessionCookie(P.replay), {
      termsAccepted: true,
      reminderOptIn: true,
      idempotencyKey: newIdempotencyKey("broken"),
    });
    assertEq(brokenConsent.status, 503, "store consent tak tersedia ⇒ 503");
    assertEq(brokenConsent.body?.code, "CONSENT_STORE_UNAVAILABLE", "kode CONSENT_STORE_UNAVAILABLE");

    const brokenOrder = await createOrder(P.replay, newIdempotencyKey("brokenorder"), {}, BROKEN_URL);
    assertOk(brokenOrder.status >= 500, "gate tidak bisa diverifikasi ⇒ 5xx (tidak lanjut)", String(brokenOrder.status));

    // T&C wajib: consent tanpa centang ditolak server.
    const noTerms = await postJson(APP_URL, "/api/consent", waSessionCookie(P.replay), {
      termsAccepted: false,
      reminderOptIn: true,
      idempotencyKey: newIdempotencyKey("noterms"),
    });
    assertEq(noTerms.status, 400, "T&C tidak dicentang ⇒ 400 (bukan cuma tombol mati)");
    assertEq(noTerms.body?.code, "CONSENT_REQUIRED", "kode CONSENT_REQUIRED");
    const noSessionConsent = await postJson(APP_URL, "/api/consent", null, {
      termsAccepted: true,
      reminderOptIn: true,
      idempotencyKey: newIdempotencyKey("nosess"),
    });
    assertEq(noSessionConsent.status, 401, "consent tanpa sesi ⇒ 401");

    // ═══ F. A6/A7 di UI (pemeriksaan sumber) ══════════════════════════════
    section("F. UI: dua checkbox terpisah + halaman legal");
    const stepPage = fs.readFileSync(
      path.join(REPO, "src/app/companion/nina/onboarding/[step]/page.tsx"),
      "utf-8"
    );
    assertOk(/id="consent-terms"/.test(stepPage), "checkbox T&C punya id");
    assertOk(/htmlFor="consent-terms"/.test(stepPage), "label T&C mengikat input (klik teks = klik kotak)");
    assertOk(/id="consent-reminder"/.test(stepPage), "checkbox pengingat punya id terpisah");
    assertOk(/htmlFor="consent-reminder"/.test(stepPage), "label pengingat mengikat inputnya");
    assertOk(
      /const \[termsAccepted, setTermsAccepted\] = useState\(false\)/.test(stepPage),
      "T&C mulai TIDAK tercentang"
    );
    assertOk(
      /const \[reminderOptIn, setReminderOptIn\] = useState\(false\)/.test(stepPage),
      "pengingat mulai TIDAK tercentang"
    );
    assertOk(!/defaultChecked/.test(stepPage), "tidak ada checkbox yang di-precheck");
    assertOk(
      /disabled=\{isCheckingOut \|\| checkoutComplete \|\| !termsAccepted\}/.test(stepPage),
      "tombol bayar mati sampai T&C dicentang"
    );
    assertOk(/aria-describedby="consent-terms-help"/.test(stepPage), "checkbox T&C punya teks bantu terhubung");
    assertOk(/aria-describedby="consent-reminder-help"/.test(stepPage), "checkbox pengingat punya teks bantu terhubung");
    assertOk(/role="alert"/.test(stepPage), "pesan error dibacakan sebagai alert");
    assertOk(/focus-visible:ring-2/.test(stepPage), "fokus keyboard terlihat pada checkbox");
    assertOk(
      stepPage.indexOf('"/api/consent"') < stepPage.lastIndexOf('"/api/scalev/create-order"'),
      "persetujuan dikirim SEBELUM permintaan order"
    );
    assertOk(/TERMS_PATH/.test(stepPage) && /PRIVACY_PATH/.test(stepPage), "dua tautan dokumen disediakan");

    // Halaman legal: diperiksa dari HTML yang BENAR-BENAR dirender app (bukan
    // dari sumber komponen), supaya konstanta dari lib/legal.ts ikut terbukti.
    const termsHtmlRaw = await (await fetch(`${APP_URL}/terms`)).text();
    // React SSR menyisipkan komentar di antara teks dan ekspresi.
    const termsHtml = termsHtmlRaw.replace(/<!--.*?-->/g, "");
    assertOk(termsHtml.length > 1000, "halaman /terms dirender");
    assertOk(termsHtml.includes(TERMS_VERSION), "versi dokumen tampil di /terms");
    assertOk(/18 tahun/.test(termsHtml), "batas usia 18+ (keputusan no. 12)");
    assertOk(/72 jam/.test(termsHtml), "garansi 72 jam (keputusan no. 1)");
    assertOk(/3 hari kerja/.test(termsHtml), "SLA klaim ≤3 hari kerja (keputusan no. 2)");
    assertOk(/100% tanpa potongan/.test(termsHtml), "refund 100% tanpa potongan (keputusan no. 3)");
    assertOk(/Scalev/.test(termsHtml) && /Meta/.test(termsHtml), "pihak ketiga disebut (keputusan no. 11)");
    assertOk(/hukum Indonesia/.test(termsHtml), "yurisdiksi Indonesia (keputusan no. 19)");
    assertOk(/usaha perorangan/.test(termsHtml), "entitas sesuai keputusan no. 17");
    assertOk(/09\.00–21\.00 WIB/.test(termsHtml), "jam layanan CS (keputusan no. 18)");
    assertOk(/30 hari/.test(termsHtml) && /7 hari/.test(termsHtml), "retensi 30 hari + SLA data 7 hari (keputusan no. 6-7)");
    assertOk(/opsional/.test(termsHtml), "pengingat ditandai opsional");
    assertOk(/BERHENTI/.test(termsHtml), "cara berhenti disebut");
    assertOk(!/100% aman/.test(termsHtml), "tidak ada klaim absolut '100% aman' di /terms");
    assertOk(!/UU PDP|GDPR|sesuai peraturan/.test(termsHtml), "tanpa klaim kepatuhan hukum");
    const placeholderCount = (termsHtml.match(/«/g) || []).length;
    assertEq(placeholderCount, 1, "hanya placeholder alamat yang tersisa di /terms");

    const privacyHtml = (await (await fetch(`${APP_URL}/privacy`)).text()).replace(/<!--.*?-->/g, "");
    assertOk(!/100% aman/.test(privacyHtml), "klaim absolut di /privacy sudah diganti");
    assertOk(/dienkripsi saat dikirim/.test(privacyHtml), "klaim enkripsi dibatasi (keputusan no. 10)");
    assertOk(/append-only/.test(privacyHtml), "status persetujuan disebut jujur sebagai append-only");
    assertOk(/Pengingat WhatsApp/.test(privacyHtml), "pasal pengingat & cara berhenti ada");
    assertOk(/30 hari/.test(privacyHtml), "retensi disebut di /privacy");
    assertOk(/Scalev/.test(privacyHtml) && /Meta/.test(privacyHtml), "pihak ketiga disebut di /privacy");
    assertOk(/data sensitif/.test(privacyHtml), "media Strava disebut data sensitif (keputusan no. 8)");
    assertOk(/href="\/terms"/.test(privacyHtml), "/privacy menautkan /terms");
    // F-S3: Buktikan placeholder di /privacy ter-render persis 1 (alamat)
    const privacyPlaceholderCount = (privacyHtml.match(/«/g) || []).length;
    assertEq(privacyPlaceholderCount, 1, "F-S3: hanya placeholder alamat yang tersisa di /privacy");

    const footer = fs.readFileSync(path.join(REPO, "src/components/Footer.tsx"), "utf-8");
    assertOk(/href="\/terms"/.test(footer), "footer menautkan /terms");
    const sitemap = fs.readFileSync(path.join(REPO, "src/app/sitemap.ts"), "utf-8");
    assertOk(/\/terms/.test(sitemap), "sitemap memuat /terms");
  } finally {
    try { app.stop(); } catch {}
    try { brokenApp.stop(); } catch {}
    try { postgrest?.stop(); } catch {}
    try { mock.kill("SIGKILL"); } catch {}
  }

  // ── Ringkasan ──────────────────────────────────────────────────────────────
  const failed = results.filter(([status]) => status === "FAIL");
  console.log(`\ne2e gate consent/checkout: ${results.length - failed.length} PASS, ${failed.length} FAIL`);
  for (const [status, name] of results) if (status === "FAIL") console.log(`  FAIL ${name}`);
  if (failed.length) {
    console.log("\nlog server terakhir:");
    try {
      console.log(fs.readFileSync(LOG, "utf-8").split("\n").slice(-25).join("\n"));
    } catch {}
    process.exit(1);
  }
  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
