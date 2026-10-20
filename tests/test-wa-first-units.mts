/**
 * Unit checks untuk slice WA-first (kartu W3) — murni, tanpa server.
 *   node --experimental-strip-types tests/test-wa-first-units.mts
 *
 * Fokus: batas eligibility reaktivasi (tepat 7 hari = TIDAK eligible),
 * normalisasi nomor, hashing kode OTP (tidak menyimpan kode polos), dan
 * katalog harga server yang dipakai untuk perpanjangan.
 */
import assert from "node:assert/strict";

process.env.WA_OTP_SECRET = "wa-otp-unit-secret-0123456789-abcdef-XZ";
process.env.WA_SESSION_SECRET = "wa-session-unit-secret-0123456789-abcdef-XZ";
process.env.THRIVIN_TENANT_ID = "thrivin";

const { normalizePhone } = await import("../src/lib/phone.ts");
const { PLAN_CATALOG } = await import("../src/lib/plans.ts");
const {
  generateOtpCode,
  hashOtpCode,
  opaqueHash,
  OTP_CODE_LENGTH,
} = await import("../src/lib/otp.ts");
const {
  REACTIVATION_GAP_MS,
  REACTIVATION_CANDIDATE_CODE,
  catalogPlans,
  isReactivationEligible,
} = await import("../src/lib/renewal.ts");
const { createWaSessionToken, verifyWaSessionToken, WA_SESSION_COOKIE } = await import(
  "../src/lib/wa-session.ts"
);
const { getOtpProvider } = await import("../src/lib/otp-provider.ts");

const results: Array<[string, string]> = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", `${name} — ${(err as Error).message}`]);
  }
}

const NOW = Date.parse("2026-10-15T12:00:00.000Z");
const HOUR_MS = 3_600_000;

// ── Eligibility: batas 7×24 jam ─────────────────────────────────────────────
check("eligibility: tepat 7×24 jam -> TIDAK eligible (batas spec)", () => {
  assert.equal(isReactivationEligible(new Date(NOW - REACTIVATION_GAP_MS).toISOString(), NOW), false);
});
check("eligibility: 7×24 jam + 1 ms -> eligible", () => {
  assert.equal(
    isReactivationEligible(new Date(NOW - REACTIVATION_GAP_MS - 1).toISOString(), NOW),
    true
  );
});
check("eligibility: 7×24 jam - 1 ms -> belum eligible", () => {
  assert.equal(
    isReactivationEligible(new Date(NOW - REACTIVATION_GAP_MS + 1).toISOString(), NOW),
    false
  );
});
check("eligibility: 30 hari -> eligible", () => {
  assert.equal(isReactivationEligible(new Date(NOW - 30 * 24 * HOUR_MS).toISOString(), NOW), true);
});
check("eligibility: belum kedaluwarsa / kosong -> tidak eligible", () => {
  assert.equal(isReactivationEligible(new Date(NOW + HOUR_MS).toISOString(), NOW), false);
  assert.equal(isReactivationEligible(null, NOW), false);
  assert.equal(isReactivationEligible("bukan-tanggal", NOW), false);
});

// ── Kode kandidat & katalog ─────────────────────────────────────────────────
check("kandidat reaktivasi = TEMENANLAGI (satu mekanisme promo existing)", () => {
  assert.equal(REACTIVATION_CANDIDATE_CODE, "TEMENANLAGI");
});
check("katalog perpanjangan = PLAN_CATALOG server (4 paket, harga katalog)", () => {
  const plans = catalogPlans();
  assert.equal(plans.length, 4);
  for (const plan of plans) {
    assert.equal(plan.price, PLAN_CATALOG[plan.key as keyof typeof PLAN_CATALOG].basePrice);
  }
  assert.deepEqual(
    plans.map((p) => p.price),
    [99000, 231000, 357000, 465000]
  );
});

// ── Normalisasi nomor (server-side, tanpa substitusi) ───────────────────────
check("normalizePhone: 08… -> 62…, sampah -> null (tidak disubstitusi)", () => {
  assert.equal(normalizePhone("0812-3456-7890"), "6281234567890");
  assert.equal(normalizePhone("+62 812 3456 7890"), "6281234567890");
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

// ── OTP: hash, bukan kode polos ─────────────────────────────────────────────
check("generateOtpCode: 6 digit, bukan string kosong, bervariasi", () => {
  const codes = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const code = generateOtpCode();
    assert.match(code, /^[0-9]{6}$/);
    assert.equal(code.length, OTP_CODE_LENGTH);
    codes.add(code);
  }
  assert.ok(codes.size > 150, `kode tidak cukup bervariasi: ${codes.size}/200`);
});
check("hashOtpCode: deterministik per (nomor, kode), terikat nomor, bukan kode polos", () => {
  const a = hashOtpCode("123456", "6281234567890");
  const b = hashOtpCode("123456", "6281234567890");
  const c = hashOtpCode("123456", "6281299999999");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("123456"));
});
check("hashOtpCode: tanpa WA_OTP_SECRET -> melempar (gagal-tertutup)", () => {
  const saved = process.env.WA_OTP_SECRET;
  delete process.env.WA_OTP_SECRET;
  try {
    assert.throws(() => hashOtpCode("123456", "6281234567890"));
  } finally {
    process.env.WA_OTP_SECRET = saved;
  }
});
check("opaqueHash: 32 hex, tidak mengandung nilai mentah", () => {
  const h = opaqueHash("103.20.1.7");
  assert.match(h, /^[0-9a-f]{32}$/);
  assert.ok(!h.includes("103"));
});

// ── F-2: mock DITOLAK di produksi (gagal-tertutup) ──────────────────────────
check("provider OTP: mock ditolak saat NODE_ENV=production (F-2)", () => {
  const saved = {
    provider: process.env.WA_OTP_PROVIDER,
    nodeEnv: process.env.NODE_ENV,
    allow: process.env.WA_OTP_MOCK_ALLOW_IN_PRODUCTION,
  };
  const savedError = console.error;
  console.error = () => {}; // penolakan memang dicetak keras; jangan bisingkan suite
  try {
    process.env.WA_OTP_PROVIDER = "mock";
    delete process.env.WA_OTP_MOCK_ALLOW_IN_PRODUCTION;

    process.env.NODE_ENV = "production";
    assert.equal(getOtpProvider(), null, "mock lolos di produksi tanpa pintu darurat");

    process.env.WA_OTP_MOCK_ALLOW_IN_PRODUCTION = "1";
    assert.equal(getOtpProvider()?.name, "mock", "pintu darurat eksplisit tidak bekerja");

    delete process.env.WA_OTP_MOCK_ALLOW_IN_PRODUCTION;
    process.env.NODE_ENV = "development";
    assert.equal(getOtpProvider()?.name, "mock", "mock ditolak di luar produksi");

    process.env.WA_OTP_PROVIDER = "cloud";
    assert.equal(getOtpProvider(), null, "provider tak dikenal tidak diterima");
  } finally {
    console.error = savedError;
    if (saved.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.nodeEnv;
    if (saved.provider === undefined) delete process.env.WA_OTP_PROVIDER;
    else process.env.WA_OTP_PROVIDER = saved.provider;
    if (saved.allow === undefined) delete process.env.WA_OTP_MOCK_ALLOW_IN_PRODUCTION;
    else process.env.WA_OTP_MOCK_ALLOW_IN_PRODUCTION = saved.allow;
  }
});

// ── Sesi pelanggan: HMAC, terikat nomor, terpisah dari admin ────────────────
check("sesi WA: nama cookie terpisah dari cookie admin", () => {
  assert.equal(WA_SESSION_COOKIE, "thrivin_wa_session");
  assert.notEqual(WA_SESSION_COOKIE, "thrivin_admin_session");
});
check("sesi WA: token valid -> nomor; token diubah / epoch beda / kedaluwarsa -> null", () => {
  const token = createWaSessionToken("6281234567890", NOW);
  assert.ok(token);
  assert.equal(verifyWaSessionToken(token, NOW + 1000), "6281234567890");

  const [payload, sig] = (token as string).split(".");
  assert.equal(verifyWaSessionToken(`${payload}.${sig.slice(0, -2)}xx`, NOW), null);
  assert.equal(verifyWaSessionToken(`${Buffer.from('{"phone":"6281234567890","exp":9999999999999,"epoch":"0"}').toString("base64url")}.${sig}`, NOW), null);
  assert.equal(verifyWaSessionToken(token, NOW + 61 * 60 * 1000), null);

  process.env.WA_SESSION_EPOCH = "7";
  assert.equal(verifyWaSessionToken(token, NOW), null);
  process.env.WA_SESSION_EPOCH = "0";
});
check("sesi WA: secret lemah / kosong -> tidak ada sesi (gagal-tertutup)", () => {
  const saved = process.env.WA_SESSION_SECRET;
  process.env.WA_SESSION_SECRET = "a".repeat(32);
  try {
    assert.equal(createWaSessionToken("6281234567890", NOW), null);
  } finally {
    process.env.WA_SESSION_SECRET = saved;
  }
});

// ── WA-first TANPA OTP: pemetaan tiga status (kartu 2026-10-20) ─────────────
const { buildWaLookupPayload, RENEWAL_PROMO_AFTER_MS } = await import("../src/lib/wa-status.ts");
const { limitRequest } = await import("../src/lib/rate-limit.ts");

const DAY = 24 * HOUR_MS;
function iso(ms: number) {
  return new Date(ms).toISOString();
}

check("lookup: 'none' -> {ok,status:'new'} persis (tanpa field lain)", () => {
  const payload = buildWaLookupPayload({ state: "none", expiresAt: null, lastPlanKey: null }, NOW);
  assert.deepEqual(payload, { ok: true, status: "new" });
});

check("lookup: aktif -> daysLeft dari expires_at, planName null (RPC tak punya nama)", () => {
  const payload = buildWaLookupPayload(
    { state: "active", expiresAt: iso(NOW + 21 * DAY), lastPlanKey: "month" },
    NOW
  );
  assert.deepEqual(payload, { ok: true, status: "active", planName: null, daysLeft: 21 });
  const half = buildWaLookupPayload(
    { state: "active", expiresAt: iso(NOW + 12 * HOUR_MS), lastPlanKey: null },
    NOW
  );
  assert.equal((half as { daysLeft: number }).daysLeft, 1, "sisa 12 jam tetap '1 hari'");
});

check("lookup: nonaktif 12 hari -> renewalPromo true, daysSinceExpiry 12", () => {
  const payload = buildWaLookupPayload(
    { state: "expired", expiresAt: iso(NOW - 12 * DAY), lastPlanKey: "quarter" },
    NOW
  );
  assert.deepEqual(payload, {
    ok: true,
    status: "inactive",
    daysSinceExpiry: 12,
    renewalPromo: true,
  });
});

check("lookup: renewalPromo HANYA saat > 7 hari (3 hari & tepat 7 hari = false)", () => {
  const three = buildWaLookupPayload(
    { state: "expired", expiresAt: iso(NOW - 3 * DAY), lastPlanKey: null },
    NOW
  );
  assert.equal((three as { renewalPromo: boolean }).renewalPromo, false);
  const exact7 = buildWaLookupPayload(
    { state: "expired", expiresAt: iso(NOW - RENEWAL_PROMO_AFTER_MS), lastPlanKey: null },
    NOW
  );
  assert.equal((exact7 as { renewalPromo: boolean }).renewalPromo, false, "tepat 7×24 jam = belum promo");
  const over7 = buildWaLookupPayload(
    { state: "expired", expiresAt: iso(NOW - RENEWAL_PROMO_AFTER_MS - 1), lastPlanKey: null },
    NOW
  );
  assert.equal((over7 as { renewalPromo: boolean }).renewalPromo, true, "7×24 jam + 1 ms = promo");
});

check("lookup: expires_at tidak terbaca -> angka null, promo TIDAK ditawarkan (gagal-tertutup)", () => {
  const active = buildWaLookupPayload({ state: "active", expiresAt: null, lastPlanKey: null }, NOW);
  assert.deepEqual(active, { ok: true, status: "active", planName: null, daysLeft: null });
  const expired = buildWaLookupPayload(
    { state: "expired", expiresAt: "bukan-tanggal", lastPlanKey: null },
    NOW
  );
  assert.deepEqual(expired, {
    ok: true,
    status: "inactive",
    daysSinceExpiry: null,
    renewalPromo: false,
  });
});

check("lookup: payload TIDAK memuat nama/profil/subscription_id/token/nomor", () => {
  const forbidden = [
    "name",
    "profile",
    "subscription",
    "subscription_id",
    "token",
    "token_limit",
    "phone",
    "maskedPhone",
    "weight",
    "height",
    "age",
  ];
  const payloads = [
    buildWaLookupPayload({ state: "none", expiresAt: null, lastPlanKey: null }, NOW),
    buildWaLookupPayload({ state: "active", expiresAt: iso(NOW + DAY), lastPlanKey: "month" }, NOW),
    buildWaLookupPayload({ state: "expired", expiresAt: iso(NOW - 9 * DAY), lastPlanKey: null }, NOW),
  ];
  for (const payload of payloads) {
    const keys = Object.keys(payload);
    for (const field of forbidden) {
      assert.ok(!keys.includes(field), `field terlarang "${field}" ikut keluar`);
    }
  }
});

check("rate limit: 5 permintaan/nomor per menit, yang ke-6 ditolak", () => {
  const makeReq = (ip: string) =>
    new Request("http://127.0.0.1/api/wa/session/request", {
      headers: { "x-forwarded-for": ip },
    });
  const opts = { ipLimit: 20, phoneLimit: 5, phone: "6281200009999", windowMs: 60_000 };
  for (let i = 0; i < 5; i += 1) {
    assert.equal(limitRequest(makeReq("10.5.5.5"), "wa-status-lookup-unit", opts).ok, true);
  }
  const denied = limitRequest(makeReq("10.5.5.5"), "wa-status-lookup-unit", opts);
  assert.equal(denied.ok, false, "permintaan ke-6 untuk nomor sama harus ditolak");
  assert.ok(denied.retryAfterSeconds > 0);
  // Nomor lain dari IP yang sama masih boleh (bucket terpisah per nomor).
  assert.equal(
    limitRequest(makeReq("10.5.5.5"), "wa-status-lookup-unit", {
      ...opts,
      phone: "6281200009998",
    }).ok,
    true
  );
});

let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status}  ${name}`);
}
console.log(
  `\n${results.length - failed}/${results.length} unit checks passed` + (failed ? " — FAILED" : "")
);
process.exit(failed ? 1 : 0);
