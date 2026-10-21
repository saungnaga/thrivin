/**
 * Unit (murni, tanpa DB) untuk gate checkout W4 — kartu t_f5ec336c.
 *
 *   node --experimental-strip-types tests/test-consent-gate-units.mts
 *
 * Yang diuji di sini: definisi langkah wajib (server-side), validasi per langkah,
 * penolakan versi teks tak dikenal, dan sifat token sesi (palsu/kedaluwarsa/epoch).
 */
import {
  REQUIRED_STEPS,
  checkRequiredSteps,
  mergedProfileFromSteps,
  validateStepInput,
} from "../src/lib/onboarding-steps.ts";
import { authoritativeProfile } from "../src/lib/checkout-gate.ts";
import { isKnownReminderVersion, isKnownTermsVersion, KNOWN_TERMS_VERSIONS } from "../src/lib/consent.ts";
import { verifyWaSessionToken, createWaSessionToken, WA_SESSION_COOKIE } from "../src/lib/wa-session.ts";
import { fullStepPayloads, craftWaSessionToken, DEFAULT_WA_SESSION_SECRET } from "./helpers/checkout-arm.mts";

let pass = 0;
const failures: string[] = [];
function check(ok: boolean, name: string, detail = "") {
  if (ok) pass++;
  else failures.push(detail ? `${name} — ${detail}` : name);
}
function eq(actual: unknown, expected: unknown, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(ok, name, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const PHONE = "6281200000901";

// ── 1. Definisi langkah wajib ────────────────────────────────────────────────
eq(REQUIRED_STEPS, [2, 3, 4, 5, 6, 7, 8], "langkah wajib = 2..8 (langkah 1 intro, 9 checkout)");

// ── 2. Validasi per langkah ─────────────────────────────────────────────────
check(validateStepInput(2, { name: "  " }).ok === false, "nama kosong ditolak");
check(validateStepInput(2, { name: "Rina" }).ok === true, "nama valid diterima");
check(validateStepInput(3, { gender: "Laki-laki", age: 25 }).ok === true, "langkah 3 valid");
check(validateStepInput(3, { gender: "Laki-laki", age: 5 }).ok === false, "usia di luar rentang ditolak");
check(validateStepInput(3, { gender: "Laki-laki" }).ok === false, "usia hilang ditolak (bukan default)");
check(validateStepInput(4, { height: 170, weight: 65 }).ok === true, "langkah 4 valid");
check(validateStepInput(4, { height: 500, weight: 65 }).ok === false, "tinggi mustahil ditolak");
check(validateStepInput(5, { activityLevel: "Moderat", workoutLocation: "Di Rumah" }).ok === true, "langkah 5 valid");
check(validateStepInput(5, { activityLevel: "Mode Turbo", workoutLocation: "Di Rumah" }).ok === false, "enum asing ditolak");
check(validateStepInput(6, { programFocus: [] }).ok === false, "fokus program kosong ditolak");
check(validateStepInput(6, { programFocus: ["Workout & Strength", "Nutrisi"] }).ok === true, "fokus program valid");
check(validateStepInput(8, { communicationStyle: "Santai & Akrab", whatsappNumber: "0812-0000-0901" }).ok === true, "langkah 8 valid");
eq(
  validateStepInput(8, { communicationStyle: "Santai & Akrab", whatsappNumber: "+62 812 0000 0901" }).data.whatsappNumber,
  PHONE,
  "nomor dinormalisasi server-side saat disimpan"
);
check(validateStepInput(8, { communicationStyle: "Santai & Akrab", whatsappNumber: "123" }).ok === false, "nomor tak valid ditolak");
check(validateStepInput(9, { apa: "saja" }).ok === false, "langkah 9 tidak menyimpan data profil");

// ── 3. Kelengkapan dari data TERSIMPAN ──────────────────────────────────────
const full = fullStepPayloads(PHONE);
const complete = checkRequiredSteps(full);
check(complete.complete === true, "semua langkah ada ⇒ lengkap");
check(complete.missingSteps.length === 0, "tidak ada langkah hilang");

const missingOne: Record<string, unknown> = { ...full };
delete missingOne["6"];
const partial = checkRequiredSteps(missingOne);
check(partial.complete === false, "langkah hilang ⇒ tidak lengkap");
eq(partial.missingSteps, [6], "langkah yang hilang disebut eksplisit");

const tampered = { ...full, 4: { height: 170 } as Record<string, unknown> };
const tamperedResult = checkRequiredSteps(tampered);
check(tamperedResult.complete === false, "langkah ada tapi isinya tidak valid ⇒ tidak lengkap");
eq(tamperedResult.invalidSteps.map((s) => s.step), [4], "langkah rusak dilaporkan");

check(checkRequiredSteps({}).complete === false, "tanpa data ⇒ tidak lengkap");
check(checkRequiredSteps(null).missingSteps.length === REQUIRED_STEPS.length, "data null ⇒ semua langkah hilang");

// ── 4. Profil otoritatif (identitas harus sama dengan sesi) ─────────────────
const okProfile = authoritativeProfile(full, PHONE);
check(okProfile.ok === true, "profil lengkap + nomor sama ⇒ ok");
eq(okProfile.name, "Kawan Uji", "nama diambil dari langkah 2");
eq(okProfile.profile.age, 25, "profil berisi data langkah 3");

const otherPhoneProfile = authoritativeProfile(full, "6281200000902");
check(otherPhoneProfile.ok === false, "nomor profil ≠ nomor sesi ⇒ ditolak");

const noConsentProfile = authoritativeProfile({ ...full, 3: { gender: "Laki-laki", age: 25.6 } }, PHONE);
check(noConsentProfile.ok === true, "usia dibulatkan wajar (25.6 → 26)");

// ── 5. Versi teks: yang tak dikenal ditolak ─────────────────────────────────
check(isKnownTermsVersion(KNOWN_TERMS_VERSIONS[0]) === true, "versi T&C yang berlaku dikenal");
check(isKnownTermsVersion("terms-9999-v9") === false, "versi T&C asing ditolak");
check(isKnownTermsVersion("") === false, "versi kosong ditolak");
check(isKnownTermsVersion(undefined) === false, "versi undefined ditolak");
check(isKnownReminderVersion("reminder-optin-2026-10-15-v1") === true, "versi opt-in dikenal");
check(isKnownReminderVersion("reminder-optin-lain") === false, "versi opt-in asing ditolak");

// ── 6. Token sesi: dipalsukan / kedaluwarsa / epoch ─────────────────────────
process.env.WA_SESSION_SECRET = DEFAULT_WA_SESSION_SECRET;
process.env.WA_SESSION_EPOCH = "0";

const valid = createWaSessionToken(PHONE, 1_000_000);
check(verifyWaSessionToken(valid, 1_000_001) === PHONE, "token valid ⇒ nomor terverifikasi");

// Palsu: payload ditukar (nomor lain) tapi tanda tangan dibiarkan.
const crafted = craftWaSessionToken(PHONE);
const [payload, sig] = crafted.split(".");
const swappedPayload = Buffer.from(
  JSON.stringify({ phone: "6281299999999", iat: 0, exp: 4_000_000_000_000, epoch: "0" })
).toString("base64url");
check(verifyWaSessionToken(`${swappedPayload}.${sig}`, 1_000_001) === null, "payload ditukar ⇒ tanda tangan gagal");
check(verifyWaSessionToken(`${payload}.${sig}-x`, 1_000_001) === null, "tanda tangan dipotong ⇒ ditolak");
check(verifyWaSessionToken(undefined) === null, "tanpa token ⇒ null (fail closed)");
check(verifyWaSessionToken("bukan.token") === null, "token ngawur ⇒ null");

// Kedaluwarsa.
const shortLived = createWaSessionToken(PHONE, 1_000_000);
check(verifyWaSessionToken(shortLived, 1_000_000 + 60 * 60 * 1000 + 1) === null, "token kedaluwarsa ⇒ null");

// Secret lain tidak diterima.
const foreign = craftWaSessionToken(PHONE, { secret: "secret-lain-yang-cukup-panjang-0123456789" });
check(verifyWaSessionToken(foreign, 1_000_001) === null, "token bertanda tangan secret lain ⇒ ditolak");

// Epoch dicabut ⇒ semua sesi lama mati.
process.env.WA_SESSION_EPOCH = "1";
check(verifyWaSessionToken(crafted, Date.now()) === null, "epoch naik ⇒ sesi lama dicabut");
process.env.WA_SESSION_EPOCH = "0";

eq(WA_SESSION_COOKIE, "thrivin_wa_session", "nama cookie pelanggan terpisah dari sesi admin");

// ── Ringkasan ───────────────────────────────────────────────────────────────
console.log(`\nunit gate consent/checkout: ${pass} PASS, ${failures.length} FAIL`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length) process.exit(1);
console.log("OK");
