/**
 * Unit checks untuk jalur "nomor terdaftar → langsung pilih paket"
 * (kartu t_a40e5534). Murni: tanpa server, tanpa DB, tanpa HTTP.
 *
 *   node --experimental-strip-types tests/test-registered-onboarding-units.mts
 *
 * Dua lapis bukti:
 *  1. `stepPayloadsFromProfile()` — snapshot tersimpan jadi payload langkah 2–8,
 *     divalidasi validator yang sama dengan jalur UI (satu field jelek ⇒ gagal,
 *     bukan langkah setengah jadi).
 *  2. Source-level (HTML langkah 9 dirender kosong di server, jadi perilaku UI
 *     hanya bisa dikunci dari sumber): jalur terdaftar memanggil `goToStep(9)`
 *     dan TIDAK pernah `goToStep(2)`; blok status berada SEBELUM daftar paket;
 *     CTA menggulir, bukan navigasi; angka promo dari `TEMANBARU_PROMO`.
 */
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

process.env.THRIVIN_TENANT_ID = "thrivin";

const { stepPayloadsFromProfile, REQUIRED_STEPS, STEP_FIELDS } = await import(
  "../src/lib/onboarding-steps.ts"
);

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(import.meta.dirname, "..");
const PAGE = path.join(REPO, "src/app/nina/onboarding/[step]/page.tsx");
const PROGRESS_ROUTE = path.join(REPO, "src/app/api/onboarding/progress/route.ts");

const pageSrc = fs.readFileSync(PAGE, "utf-8");
const progressSrc = fs.readFileSync(PROGRESS_ROUTE, "utf-8");

const results: Array<[string, string]> = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", `${name} — ${(err as Error).message}`]);
  }
}
function slice(from: string, to: string): string {
  const start = pageSrc.indexOf(from);
  assert.ok(start > -1, `anchor tidak ditemukan: ${from}`);
  const end = pageSrc.indexOf(to, start);
  assert.ok(end > start, `anchor akhir tidak ditemukan: ${to}`);
  return pageSrc.slice(start, end);
}

// ── 1. Snapshot -> payload langkah ──────────────────────────────────────────
const PHONE = "6281200000901";
const FULL_PROFILE = {
  name: "Kembali Uji",
  gender: "Perempuan",
  age: 31,
  weight: 58,
  height: 162,
  activityLevel: "Aktif",
  workoutLocation: "Di Gym",
  programFocus: ["Workout & Strength", "Nutrition"],
  biggestChallenge: "Waktu latihan tidak tetap",
  communicationStyle: "Tegas & Terarah",
};

check("mapping: profil lengkap -> 7 langkah, semua lolos validator", () => {
  const seeded = stepPayloadsFromProfile(FULL_PROFILE, PHONE);
  assert.equal(seeded.ok, true, seeded.errors.join("; "));
  assert.deepEqual(Object.keys(seeded.payloads).map(Number).sort(), [...REQUIRED_STEPS]);
});

check("mapping: nama & nomor panggilan dipakai dari snapshot/sesi", () => {
  const seeded = stepPayloadsFromProfile(FULL_PROFILE, PHONE);
  assert.equal(seeded.payloads[2].name, "Kembali Uji");
  assert.equal(seeded.payloads[8].whatsappNumber, PHONE);
});

check("mapping: field program ikut terbawa apa adanya", () => {
  const seeded = stepPayloadsFromProfile(FULL_PROFILE, PHONE);
  assert.deepEqual(seeded.payloads[6].programFocus, ["Workout & Strength", "Nutrition"]);
  assert.equal(seeded.payloads[7].biggestChallenge, "Waktu latihan tidak tetap");
  assert.equal(seeded.payloads[8].communicationStyle, "Tegas & Terarah");
  assert.equal(seeded.payloads[4].weight, 58);
});

check("mapping: snapshot lama tanpa nama -> fallback 'Kawan Thrivin'", () => {
  const { name, ...noName } = FULL_PROFILE;
  const seeded = stepPayloadsFromProfile(noName, PHONE);
  assert.equal(seeded.ok, true, seeded.errors.join("; "));
  assert.equal(seeded.payloads[2].name, "Kawan Thrivin");
});

check("mapping: field tidak valid -> ok=false, langkah itu TIDAK ditulis", () => {
  const seeded = stepPayloadsFromProfile({ ...FULL_PROFILE, age: 5 }, PHONE);
  assert.equal(seeded.ok, false, "umur di luar rentang harus menolak snapshot");
  assert.equal(seeded.payloads[3], undefined, "langkah 3 tidak boleh setengah jadi");
  assert.ok(seeded.errors.some((e) => e.startsWith("step 3:")), seeded.errors.join("; "));
});

check("mapping: snapshot kosong/null -> ok=false (jatuh ke alur isi data)", () => {
  for (const empty of [null, undefined, {}]) {
    const seeded = stepPayloadsFromProfile(empty as never, PHONE);
    assert.equal(seeded.ok, false, `snapshot ${JSON.stringify(empty)} harus ditolak`);
  }
});

check("mapping: setiap langkah tetap memakai daftar field STEP_FIELDS", () => {
  for (const step of REQUIRED_STEPS) {
    assert.ok(STEP_FIELDS[step]?.length > 0, `STEP_FIELDS[${step}] kosong`);
  }
});

// ── 2. Source: jalur terdaftar tidak mengulang isi data ─────────────────────
check("source: handleWaLookup memanggil goToStep(9) untuk nomor terdaftar", () => {
  const lookup = slice("const handleWaLookup = async () => {", "const applyPromo = async () => {");
  assert.ok(/goToStep\(9\)/.test(lookup), "jalur terdaftar wajib langsung ke langkah 9");
});

check("source: handleWaLookup TIDAK pernah mengirim ke langkah 2", () => {
  const lookup = slice("const handleWaLookup = async () => {", "const applyPromo = async () => {");
  assert.ok(
    !/goToStep\(2\)/.test(lookup),
    "nomor terdaftar tidak boleh masuk alur isi data (goToStep(2))"
  );
});

check("source: nomor baru tetap lewat slide intro (early return sebelum langkah 9)", () => {
  const lookup = slice("const handleWaLookup = async () => {", "const applyPromo = async () => {");
  const early = lookup.indexOf('if (body.status === "new") return;');
  const toNine = lookup.indexOf("goToStep(9)");
  assert.ok(early > -1, "harus ada early-return untuk nomor baru");
  assert.ok(early < toNine, "nomor baru harus keluar SEBELUM lompat ke langkah 9");
});

check("source: profil & status diambil dari endpoint sesi, bukan nomor dari body", () => {
  const lookup = slice("const handleWaLookup = async () => {", "const applyPromo = async () => {");
  assert.ok(
    lookup.includes("loadServerOnboarding()"),
    "jalur terdaftar wajib membaca profil lewat sesi"
  );
  assert.ok(
    !/phone\s*[:=]\s*(data\.whatsappNumber|body\.phone)/.test(
      slice("const loadServerOnboarding", "const applySavedProfile")
    ),
    "endpoint profil tidak boleh dikirimi nomor dari body"
  );
});

check("source: terdaftar tanpa snapshot -> fallback isi data + alasan", () => {
  assert.ok(/setSnapshotMissing\(true\)/.test(pageSrc), "harus menandai snapshot hilang");
  const fallback = slice("{snapshotMissing ? (", ") : (");
  assert.ok(fallback.includes("goToStep(2)"), "fallback wajib ke alur isi data");
  assert.ok(
    /belum tersimpan lengkap/i.test(fallback),
    "alasan fallback harus ditampilkan ke pelanggan"
  );
});

// ── 3. Source: blok status di atas daftar paket ─────────────────────────────
const statusBlock = slice("{/* ── 1b. STATUS LANGGANAN", "{/* ── 2. CARD PILIHAN PAKET");

check("source: blok status berada SEBELUM daftar paket", () => {
  const statusIdx = pageSrc.indexOf("1b. STATUS LANGGANAN");
  const plansIdx = pageSrc.indexOf("2. CARD PILIHAN PAKET");
  assert.ok(statusIdx > -1 && plansIdx > -1, "anchor blok status / daftar paket hilang");
  assert.ok(statusIdx < plansIdx, "blok status harus di ATAS daftar paket");
});

check("source: blok status memuat teks aktif & berakhir + sisa hari", () => {
  assert.ok(statusBlock.includes("Langganan aktif"), "teks 'Langganan aktif' hilang");
  assert.ok(/Sisa masa aktif/.test(statusBlock), "teks 'Sisa masa aktif' hilang");
  assert.ok(statusBlock.includes("Langganan sudah berakhir"), "teks 'berakhir' hilang");
  assert.ok(/hari lagi/.test(statusBlock) && /hari lalu/.test(statusBlock), "hitungan hari hilang");
});

check("source: promo perpanjangan memakai TEMANBARU_PROMO, bukan angka", () => {
  assert.ok(statusBlock.includes("TEMANBARU_PROMO.code"), "kode promo harus dari konstanta");
  assert.ok(
    statusBlock.includes("TEMANBARU_PROMO.discountPercent"),
    "persentase promo harus dari konstanta"
  );
  assert.ok(
    !/TEMANBARU["'`]/.test(statusBlock),
    "kode promo tidak boleh ditulis sebagai literal"
  );
});

check("source: CTA perpanjang menggulir ke daftar paket (bukan navigasi)", () => {
  assert.ok(statusBlock.includes("Perpanjang sekarang"), "label CTA hilang");
  assert.ok(statusBlock.includes("onClick={scrollToPlans}"), "CTA harus memakai scrollToPlans");
  const scroll = slice("const scrollToPlans = () => {", "// Height & Weight sensible bounds");
  assert.ok(scroll.includes('getElementById("pilih-paket")'), "target gulir harus daftar paket");
  assert.ok(scroll.includes("scrollIntoView"), "harus menggulir, bukan pindah halaman");
  assert.ok(!/goToStep|router\.push/.test(scroll), "CTA tidak boleh navigasi ke halaman lain");
  assert.ok(/id="pilih-paket"/.test(pageSrc), "daftar paket harus punya anchor id");
});

check("source: ringkasan program diisi dari profil server (bukan placeholder)", () => {
  const hydrate = slice("const applySavedProfile", "// ── A2: kirim langkah ke server");
  for (const field of [
    "programFocus",
    "workoutLocation",
    "communicationStyle",
    "biggestChallenge",
    "weight",
    "height",
  ]) {
    assert.ok(hydrate.includes(field), `hydrate profil harus mengisi ${field}`);
  }
});

// ── 4. Source: endpoint progress berbasis sesi ──────────────────────────────
check("route: GET progress memakai nomor SESI, bukan nomor dari request", () => {
  assert.ok(progressSrc.includes("getWaSessionPhone()"), "wajib memakai sesi");
  assert.ok(/getOnboardingSnapshot\(phone\)/.test(progressSrc), "profil dibaca untuk nomor sesi");
  assert.ok(
    !/searchParams|req\.json|request\.json/.test(progressSrc.split("export async function POST")[0]),
    "GET tidak boleh membaca nomor dari request"
  );
});

check("route: GET progress mengembalikan profil + status langganan", () => {
  assert.ok(/profile:\s*profile \?\? null/.test(progressSrc), "field profile hilang");
  assert.ok(progressSrc.includes("buildWaLookupPayload(subscription)"), "status langganan hilang");
});

check("route: tanpa sesi -> 401 (tanpa fallback ke nomor body)", () => {
  const getBlock = progressSrc.split("export async function GET")[1].split("export async function POST")[0];
  assert.ok(getBlock.includes("SESSION_REQUIRED"), "kode 401 SESSION_REQUIRED hilang");
  assert.ok(/status\s*=\s*401|, 401\)/.test(getBlock), "status 401 hilang");
});

const failed = results.filter(([status]) => status === "FAIL");
for (const [status, name] of results) console.log(`${status}  ${name}`);
console.log(
  `\n${results.length - failed.length}/${results.length} registered-onboarding unit checks passed` +
    (failed.length ? " — FAILED" : "")
);
process.exit(failed.length ? 1 : 0);
