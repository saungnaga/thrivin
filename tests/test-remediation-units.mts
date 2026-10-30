/**
 * Tests for the pure helpers introduced by the remediation.
 * Run: node --experimental-strip-types tests/test-remediation-units.mts
 *
 * Covers: shared normalizePhone (M-5), plan catalog + promo pricing (B-2/M-6),
 * onboarding validation (B-2), rate limiter (L-5), config fail-closed (H-1),
 * real-body timestamp guard (L-2), payload whitelist (H-2).
 */
import assert from "node:assert/strict";
import { normalizePhone } from "../src/lib/phone.ts";
import {
  PLAN_CATALOG,
  resolvePlanPrice,
  resolveSubscriptionPlan,
  isPlanKey,
} from "../src/lib/plans.ts";
import {
  validateOnboardingProfile,
  AGE_RANGE,
  WEIGHT_RANGE,
  HEIGHT_RANGE,
} from "../src/lib/validate-onboarding.ts";
import { checkRateLimit } from "../src/lib/rate-limit.ts";
import {
  isTimestampWithinReplayWindow,
  redactError,
  buildAuditPayload,
  getSupabaseConfig,
} from "../src/lib/onboarding-store.ts";

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", `${name} — ${err.message}`]);
  }
}

// ── M-5: one normalizePhone, invalid input rejected (never substituted) ──────
check("normalizePhone: local 0-prefix -> 62", () => {
  assert.equal(normalizePhone("081234567890"), "6281234567890");
});
check("normalizePhone: already 62 kept", () => {
  assert.equal(normalizePhone("6281299988877"), "6281299988877");
});
check("normalizePhone: separators stripped", () => {
  assert.equal(normalizePhone("+62 812-3456-7890"), "6281234567890");
});
check("M-5: short input rejected, NOT replaced with 6281234567890", () => {
  assert.equal(normalizePhone("0812"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});
check("M-5: two different invalid inputs both rejected (no shared fake identity)", () => {
  assert.equal(normalizePhone("0812"), null);
  assert.equal(normalizePhone("0813"), null);
});

// ── B-2: price is server-side ────────────────────────────────────────────────
check("B-2: list prices come from the server catalog", () => {
  for (const key of ["month", "quarter", "half", "year"] as const) {
    assert.equal(resolvePlanPrice(key).price, PLAN_CATALOG[key].basePrice);
  }
});
check("B-2: resolvePlanPrice tidak lagi mengenal promo hardcoded (promo dari DB)", () => {
  // TEMANBARU/TEMANBAIKHATI dulu jadi konstanta di sini; sekarang ada di tabel
  // promo_codes (seed migrasi) dan diskon dihitung RPC redeem_promo.
  assert.equal(resolvePlanPrice("quarter").price, 231000);
  assert.equal(resolvePlanPrice("year").price, 465000);
  assert.equal(resolvePlanPrice("quarter").promoApplied, null);
});
check("B-2: plan ids outside the catalog are rejected", () => {
  assert.equal(isPlanKey("quarter"), true);
  assert.equal(isPlanKey("premium_free"), false);
  assert.equal(isPlanKey(undefined), false);
});

// ── M-6: quota follows the plan actually bought ──────────────────────────────
check("M-6: subscription plan derives from the purchased plan, not a hardcode", () => {
  assert.deepEqual(resolveSubscriptionPlan("quarter"), {
    lastPlanKey: "quarter",
    planId: 2,
    tokenLimit: 500000,
    durationDays: 90,
  });
  assert.deepEqual(resolveSubscriptionPlan("month"), {
    lastPlanKey: "month",
    planId: 1,
    tokenLimit: 100000,
    durationDays: 30,
  });
});
check("M-6: unknown/absent plan falls back to the SMALLEST tier, not the biggest", () => {
  const fallback = resolveSubscriptionPlan(undefined);
  assert.equal(fallback.lastPlanKey, "month");
  assert.equal(fallback.tokenLimit, 100000);
});

// ── B-2: onboarding range + enum validation ──────────────────────────────────
check("B-2: valid profile passes and is normalised", () => {
  const res = validateOnboardingProfile({
    gender: "Laki-laki",
    age: "26",
    weight: 70,
    height: 175,
    activityLevel: "Moderat",
    workoutLocation: "Di Gym",
    communicationStyle: "Tegas & Terarah",
    programFocus: ["Workout & Strength", "Fat Loss"],
  });
  assert.equal(res.ok, true);
  assert.equal(res.profile.age, 26);
  assert.equal(res.profile.weight, 70);
});
check("B-2: out-of-range age/weight/height rejected", () => {
  assert.equal(validateOnboardingProfile({ age: 5, weight: 70, height: 175 }).ok, false);
  assert.equal(validateOnboardingProfile({ age: 30, weight: 500, height: 175 }).ok, false);
  assert.equal(validateOnboardingProfile({ age: 30, weight: 70, height: 400 }).ok, false);
});
check("B-2: boundary values accepted", () => {
  assert.equal(
    validateOnboardingProfile({ age: AGE_RANGE.min, weight: WEIGHT_RANGE.min, height: HEIGHT_RANGE.min }).ok,
    true
  );
  assert.equal(
    validateOnboardingProfile({ age: AGE_RANGE.max, weight: WEIGHT_RANGE.max, height: HEIGHT_RANGE.max }).ok,
    true
  );
});
check("B-2: non-numeric / garbage values rejected", () => {
  assert.equal(validateOnboardingProfile({ age: "abc", weight: 70, height: 175 }).ok, false);
  assert.equal(validateOnboardingProfile({ age: 30, weight: {}, height: 175 }).ok, false);
});
check("B-2: enum violations rejected", () => {
  assert.equal(validateOnboardingProfile({ age: 30, weight: 70, height: 175, gender: "Robot" }).ok, false);
  assert.equal(
    validateOnboardingProfile({ age: 30, weight: 70, height: 175, activityLevel: "Ekstrem" }).ok,
    false
  );
  assert.equal(
    validateOnboardingProfile({ age: 30, weight: 70, height: 175, workoutLocation: "Di Mars" }).ok,
    false
  );
});
check("B-2: absent onboarding is allowed (endpoint is optional-profile)", () => {
  assert.equal(validateOnboardingProfile(undefined).ok, true);
  assert.equal(validateOnboardingProfile(null).ok, true);
});
check("B-2: non-object onboarding rejected", () => {
  assert.equal(validateOnboardingProfile("Laki-laki").ok, false);
});

// ── L-5: rate limiter ────────────────────────────────────────────────────────
check("L-5: within limit passes, over limit is rejected with retry hint", () => {
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(checkRateLimit({ key: "t:ip:a", limit: 3, windowMs: 60_000 }, now).ok, true);
  }
  const blocked = checkRateLimit({ key: "t:ip:a", limit: 3, windowMs: 60_000 }, now);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});
check("L-5: window resets after expiry", () => {
  const now = 2_000_000;
  for (let i = 0; i < 2; i++) checkRateLimit({ key: "t:ip:b", limit: 2, windowMs: 1000 }, now);
  assert.equal(checkRateLimit({ key: "t:ip:b", limit: 2, windowMs: 1000 }, now).ok, false);
  assert.equal(checkRateLimit({ key: "t:ip:b", limit: 2, windowMs: 1000 }, now + 1001).ok, true);
});
check("L-5: keys are independent", () => {
  const now = 3_000_000;
  for (let i = 0; i < 2; i++) checkRateLimit({ key: "t:ip:c", limit: 2, windowMs: 1000 }, now);
  assert.equal(checkRateLimit({ key: "t:ip:d", limit: 2, windowMs: 1000 }, now).ok, true);
});

// ── H-1: no anon-key fallback, loud on partial config ────────────────────────
check("H-1: anon key alone is not accepted as the write key", () => {
  const saved = { ...process.env };
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.throws(() => getSupabaseConfig(), /Refusing to fall back to anon/);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
check("H-1: service-role key is returned when configured", () => {
  const saved = { ...process.env };
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    const cfg = getSupabaseConfig();
    assert.equal(cfg.key, "service-key");
    assert.equal(cfg.url, "https://example.supabase.co");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

// ── H-2: audit payload is a whitelist + hash, not the raw body ───────────────
check("H-2: audit payload drops PII and keeps only whitelisted fields + sha256", () => {
  const rawBody = JSON.stringify({
    event: "payment.received",
    data: {
      order_id: "250130JQHFZG",
      payment_status: "paid",
      gross_revenue: "219000.00",
      customer_name: "Budi Santoso",
      customer_phone: "628112345678",
      destination_address: { email: "budi@example.com", address: "Jl. Merdeka 1" },
    },
  });
  const payload = buildAuditPayload(JSON.parse(rawBody).data, rawBody);
  const serialised = JSON.stringify(payload);

  assert.equal(payload.payment_status, "paid");
  assert.equal(payload.gross_revenue, "219000.00");
  assert.match(payload.body_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(payload).sort(), ["body_sha256", "gross_revenue", "payment_status"]);
  assert.ok(!serialised.includes("Budi Santoso"), "name leaked");
  assert.ok(!serialised.includes("628112345678"), "phone leaked");
  assert.ok(!serialised.includes("budi@example.com"), "email leaked");
  assert.ok(!serialised.includes("Jl. Merdeka"), "address leaked");
});

// ── L-2: replay guard is one-sided ───────────────────────────────────────────
check("L-2: stale timestamp rejected, fresh accepted", () => {
  const now = Date.parse("2026-10-12T20:00:00.000Z");
  assert.equal(isTimestampWithinReplayWindow("2026-10-12T19:50:00.000Z", now).ok, false);
  assert.equal(isTimestampWithinReplayWindow("2026-10-12T19:59:30.000Z", now).ok, true);
});
check("L-2: far-future timestamp rejected, small clock skew tolerated", () => {
  const now = Date.parse("2026-10-12T20:00:00.000Z");
  assert.equal(isTimestampWithinReplayWindow("2026-10-12T20:30:00.000Z", now).ok, false);
  assert.equal(isTimestampWithinReplayWindow("2026-10-12T20:00:10.000Z", now).ok, true);
});

// ── redaction still works ────────────────────────────────────────────────────
check("redactError strips phone/email/secret/jwt and truncates", () => {
  const raw = "failed for 6281299988877 / a@b.com with «redacted:sk_live_…» and eyJhbG...NiJ9.abc.def";
  const red = redactError(raw);
  assert.ok(!red.includes("6281299988877"), "phone leaked");
  assert.ok(!red.includes("a@b.com"), "email leaked");
  assert.ok(!red.includes("«redacted:sk_live_…»"), "secret leaked");
  assert.ok(red.includes("[phone]") && red.includes("[email]"), "markers missing");
  assert.ok(redactError("x".repeat(900)).length <= 501);
});
check("W-8: redactError handles Error object containing phone number", () => {
  const err = new Error("customer 6281299988877 failed");
  const red = redactError(err);
  assert.ok(!red.includes("6281299988877"), "phone leaked from Error object");
  assert.ok(red.includes("[phone]"), "phone marker missing");
});

// ── report ───────────────────────────────────────────────────────────────────
let failed = 0;
for (const [status, name] of results) {
  console.log(`${status}  ${name}`);
  if (status === "FAIL") failed++;
}
console.log(`\n${results.length - failed}/${results.length} unit checks passed`);
if (failed) process.exit(1);
console.log("ALL REMEDIATION UNIT CHECKS PASSED");