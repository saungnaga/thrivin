/**
 * Teeth for "checkout sederhana" (permintaan owner 21/10/2026):
 *   1. `TEMANBARU` terpasang SENDIRI saat langkah 9 dibuka — nol klik.
 *   2. Harga coret tampil di SEMUA kartu paket sejak halaman dibuka, angkanya
 *      100% dari kutipan server, dan tiap kartu memakai kutipan paketnya sendiri.
 *   3. Banner "Kode promo terpasang" + countdown 1 jam hilang dari UI dan state.
 *   4. Cek promo otomatis tidak pernah memunculkan error merah (429 di-retry
 *      diam-diam); error hanya untuk aksi eksplisit "Terapkan".
 *   5. Ringkasan Subtotal / Potongan / Total Investasi tetap ada.
 *
 * Run: node --experimental-strip-types tests/test-checkout-promo-auto.mts
 *
 * Teeth (dibuktikan di komentar commit): kembalikan `getPlanPricing` ke versi
 * hanya-paket-terpilih ⇒ pemeriksaan "semua kartu" FAIL.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  planPricing,
  quoteFromMap,
  quoteKey,
  type PromoQuote,
} from "../src/lib/promo-quote.ts";
import { PLAN_CATALOG, type PlanKey } from "../src/lib/plans.ts";
import { PLAN_ORDER, TEMANBARU_PROMO } from "../src/lib/pricing-copy.ts";

const results: [string, string][] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", `${name} — ${(err as Error).message}`]);
  }
}

const REPO = path.resolve(import.meta.dirname, "..");
const PAGE = path.join(REPO, "src/app/companion/nina/onboarding/[step]/page.tsx");
const src = fs.readFileSync(PAGE, "utf8");
const CODE = TEMANBARU_PROMO.code;

/** What the server answers for TEMANBARU on `planId` (20% off the catalog). */
function serverQuote(planId: PlanKey): PromoQuote {
  const base = PLAN_CATALOG[planId].basePrice;
  const discount = Math.round((base * TEMANBARU_PROMO.discountPercent) / 100);
  return { code: CODE, planId, discount, finalPrice: base - discount };
}

/**
 * The quote map the client ends up holding: ONE request per plan in `plans`,
 * and plans the server rejects (1 bulan, minMonths 3) simply store nothing.
 */
function heldQuotes(plans: readonly PlanKey[] = PLAN_ORDER): Record<string, PromoQuote> {
  const map: Record<string, PromoQuote> = {};
  for (const planId of plans) {
    if (planId === "month") continue; // server: "tidak berlaku untuk paket ini"
    map[quoteKey(CODE, planId)] = serverQuote(planId);
  }
  return map;
}

/** What the customer sees on the card for `planId`. */
function shown(map: Record<string, PromoQuote>, planId: PlanKey) {
  return planPricing(planId, quoteFromMap(map, CODE, planId));
}

// ── 1: auto-apply, nol klik ────────────────────────────────────────────────
check("auto: kode terpasang sendiri diambil dari TEMANBARU_PROMO (satu sumber)", () => {
  assert.match(
    src,
    /const AUTO_PROMO_CODE = TEMANBARU_PROMO\.code;/,
    "page must derive the auto code from TEMANBARU_PROMO, not retype it"
  );
  assert.ok(!src.includes('AUTO_PROMO_CODE = "'), "auto code must not be a hardcoded string");
});
check("auto: effect mengisi kolom + mengunci kode saat langkah 9 dibuka", () => {
  const effect = src.match(/useEffect\(\(\) => \{\s*\n\s*if \(!isLoaded \|\| stepNum !== 9\) return;[\s\S]{0,400}?\}, \[[^\]]*\]\);/);
  assert.ok(effect, "missing the step-9 auto-apply effect");
  assert.ok(effect![0].includes("updateData({ promoCode: AUTO_PROMO_CODE })"), "field must be filled automatically");
  assert.ok(effect![0].includes("setCommittedCode(AUTO_PROMO_CODE)"), "the code must also become the committed one");
  assert.ok(!/onClick[\s\S]{0,80}AUTO_PROMO_CODE/.test(src), "auto-apply must not need a click");
});
check("auto: kolom promo menampilkan kode yang terpasang (bukan state lokal lain)", () => {
  assert.ok(
    /value=\{data\.promoCode\}/.test(src),
    "promo input must render data.promoCode, the field the auto-apply fills"
  );
});

// ── 2: harga coret di SEMUA paket, angka dari server ───────────────────────
check("semua kartu: quarter/half/year coret + harga promo, month normal", () => {
  const map = heldQuotes();
  const expected: Array<[PlanKey, number, number]> = [
    ["quarter", 231000, 184800],
    ["half", 357000, 285600],
    ["year", 465000, 372000],
  ];
  for (const [planId, original, discounted] of expected) {
    const p = shown(map, planId);
    assert.equal(p.originalTotal, original, `${planId}: subtotal katalog`);
    assert.equal(p.discountedTotal, discounted, `${planId}: harga promo dari server`);
    assert.equal(p.hasDiscount, true, `${planId}: harus ada coretan tanpa memilih dulu`);
  }
  const month = shown(map, "month");
  assert.equal(month.discountedTotal, 99000, "month: harga normal");
  assert.equal(month.hasDiscount, false, "month: tanpa coretan (minMonths 3)");
});
check("semua kartu: tidak butuh paket terpilih — peta kutipan dipakai apa adanya", () => {
  const map = heldQuotes();
  for (const planId of PLAN_ORDER) {
    const p = shown(map, planId);
    if (planId === "month") continue;
    assert.equal(
      p.discountedTotal,
      PLAN_CATALOG[planId].basePrice - Math.round(PLAN_CATALOG[planId].basePrice * 0.2),
      `${planId}: kartu harus sudah berharga promo tanpa klik`
    );
  }
});
check("semua kartu: getPlanPricing memakai kutipan paketnya sendiri (bukan paket terpilih)", () => {
  assert.match(
    src,
    /const getPlanPricing = \(planKey: PlanKey\) =>\s*\n\s*planPricing\(planKey, quoteFromMap\(promoQuotes, committedCode, planKey\)\)/,
    "getPlanPricing must resolve each card's OWN quote"
  );
  assert.ok(
    !/planKey === data\.selectedPlan \? promoQuote : null/.test(src),
    "the selected-plan-only lookup leaves the other cards at full price"
  );
});
check("kartu tidak boleh memakai angka paket lain (anti-regresi fa57056)", () => {
  const map = heldQuotes(["quarter"]); // baru quarter yang dijawab server
  assert.equal(shown(map, "quarter").discountedTotal, 184800, "quarter memakai kutipannya");
  for (const planId of ["half", "year", "month"] as PlanKey[]) {
    const p = shown(map, planId);
    assert.equal(p.hasDiscount, false, `${planId} tidak boleh ikut diskon quarter`);
    assert.equal(p.discountedTotal, PLAN_CATALOG[planId].basePrice, `${planId} harus harga katalog`);
  }
});
check("bolak-balik paket: angka tiap kartu tetap milik paketnya", () => {
  const map = heldQuotes();
  const order: PlanKey[] = ["quarter", "year", "half", "year", "quarter"];
  const seen = order.map((planId) => shown(map, planId).discountedTotal);
  assert.deepEqual(seen, [184800, 372000, 285600, 372000, 184800]);
});
check("satu permintaan per (kode, paket) — dedupe, bukan tiap render", () => {
  assert.match(src, /quoteRequestedRef = useRef<Set<string>>\(new Set\(\)\)/, "needs a requested-key set");
  assert.ok(
    /PLAN_ORDER\.filter\(\s*\n?\s*\(planId\) => !quoteRequestedRef\.current\.has\(quoteKey\(committedCode, planId\)\)/.test(src),
    "missing plans must be derived from PLAN_ORDER minus already-requested keys"
  );
  assert.ok(
    /for \(const planId of missing\) quoteRequestedRef\.current\.add\(quoteKey\(committedCode, planId\)\)/.test(src),
    "keys must be marked before the requests are fired"
  );
});

// ── 3: banner + countdown hilang ──────────────────────────────────────────
check("negatif: banner 'Kode promo terpasang' tidak ada lagi", () => {
  assert.ok(!src.includes("Kode promo terpasang"), "banner text still in the page");
  assert.ok(!src.includes("Promo applied banner"), "banner block still in the page");
  assert.ok(!/HEMAT Rp \{promoQuote\.discount/.test(src), "HEMAT badge still rendered");
});
check("negatif: countdown 1 jam hilang dari state, localStorage, dan UI", () => {
  for (const gone of [
    "COUNTDOWN_STORAGE_KEY",
    "thrivin_promo_1h_countdown",
    "countdownSeconds",
    "formatCountdown",
    "setCountdownSeconds",
  ]) {
    assert.ok(!src.includes(gone), `${gone} masih ada di halaman`);
  }
  assert.ok(!src.includes("<Clock"), "ikon Clock masih dirender");
  assert.ok(!/countdown/i.test(src), "masih ada sisa kata 'countdown' di halaman");
});
check("ringkasan Subtotal / Potongan / Total Investasi TETAP ada", () => {
  for (const label of ["Subtotal (", "Potongan Kode Promo (", "Total Investasi"]) {
    assert.ok(src.includes(label), `ringkasan kehilangan "${label}"`);
  }
});

// ── 4: 429 tidak pernah jadi banner merah di jalur otomatis ────────────────
check("429: di-retry sekali diam-diam, bukan langsung error", () => {
  assert.ok(
    /if \(res\.status === 429\) \{[\s\S]{0,120}?continue;/.test(src),
    "429 must be retried silently inside requestPromoQuote"
  );
  assert.match(src, /for \(let attempt = 0; attempt < 2; attempt\+\+\)/, "needs exactly one retry");
});
check("error hanya dari aksi eksplisit: jalur otomatis membuang pesan", () => {
  assert.ok(
    /const \{ quote \} = await requestPromoQuote\(committedCode, planId, data\.whatsappNumber\)/.test(src),
    "the automatic path must ignore the error text"
  );
  const autoEffect = src.match(/quoteRequestedRef\.current\.has[\s\S]{0,900}?\}, \[isLoaded, stepNum, committedCode, data\.whatsappNumber\]\);/);
  assert.ok(autoEffect, "missing the quote-loading effect");
  assert.ok(!autoEffect![0].includes("setCheckoutError"), "automatic quote loading must not raise the red banner");
  assert.ok(
    /if \(!quote\) \{[\s\S]{0,400}?setCheckoutError\(error/.test(src),
    "only the explicit Terapkan path reports the server error"
  );
});
check("kode promo hanya dikirim ke order kalau server mengutipnya untuk paket ini", () => {
  assert.ok(
    /promoCode: promoQuote \? promoQuote\.code : ""/.test(src),
    "order body must send a promo code only when the selected plan has a quote"
  );
});

let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} checkout-promo-auto checks passed`);
process.exit(failed === 0 ? 0 : 1);
