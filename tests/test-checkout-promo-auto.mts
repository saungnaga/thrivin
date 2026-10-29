/**
 * Checks for checkout promo and pricing alignment:
 *   1. Step 9 starts clean without forcing phantom promo codes that Scalev cannot charge.
 *   2. Struck-through prices on cards derive 100% from server quotes and PLAN_CATALOG.
 *   3. Summary card Subtotal / Potongan / Total Investasi remain intact.
 *   4. Promo checks are safe, deduplicated, and rate-limited appropriately.
 *
 * Run: npx tsx tests/test-checkout-promo-auto.mts
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

// ── 1: no phantom auto-apply ───────────────────────────────────────────────
check("no-auto: kode tidak dipaksa otomatis agar tidak beda dengan Scalev", () => {
  assert.ok(!src.includes("setCommittedCode(AUTO_PROMO_CODE)"), "must not force promo code on step 9");
  assert.ok(!src.includes("updateData({ promoCode: AUTO_PROMO_CODE })"), "must not fill promo input automatically");
});
check("input: kolom promo terhubung ke data.promoCode", () => {
  assert.ok(
    /value=\{data\.promoCode\}/.test(src),
    "promo input must render data.promoCode"
  );
});

// ── 2: harga coret di SEMUA paket, angka dari server ───────────────────────
check("semua kartu: quarter/half/year coret + harga promo, month normal", () => {
  const map = heldQuotes();
  for (const planId of ["quarter", "half", "year"] as PlanKey[]) {
    const base = PLAN_CATALOG[planId].basePrice;
    const discount = Math.round((base * TEMANBARU_PROMO.discountPercent) / 100);
    const p = shown(map, planId);
    assert.equal(p.originalTotal, base, `${planId}: subtotal katalog`);
    assert.equal(p.discountedTotal, base - discount, `${planId}: harga promo dari server`);
    assert.equal(p.hasDiscount, true, `${planId}: harus ada coretan ketika quote tersedia`);
  }
  const month = shown(map, "month");
  assert.equal(month.discountedTotal, PLAN_CATALOG.month.basePrice, "month: harga normal");
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
      `${planId}: kartu harus berharga promo ketika quote ada`
    );
  }
});
check("semua kartu: getPlanPricing memakai kutipan paketnya sendiri (bukan paket terpilih)", () => {
  assert.match(
    src,
    /const getPlanPricing = \(planKey: PlanKey\) =>\s*\r?\n\s*planPricing\(planKey, quoteFromMap\(promoQuotes, committedCode, planKey\)\)/,
    "getPlanPricing must resolve each card's OWN quote"
  );
  assert.ok(
    !/planKey === data\.selectedPlan \? promoQuote : null/.test(src),
    "the selected-plan-only lookup leaves the other cards at full price"
  );
});
check("kartu tidak boleh memakai angka paket lain (anti-regresi fa57056)", () => {
  const map = heldQuotes(["quarter"]); // baru quarter yang dijawab server
  const expectedQuarter = PLAN_CATALOG.quarter.basePrice - Math.round(PLAN_CATALOG.quarter.basePrice * 0.2);
  assert.equal(shown(map, "quarter").discountedTotal, expectedQuarter, "quarter memakai kutipannya");
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
  const qPrice = PLAN_CATALOG.quarter.basePrice - Math.round(PLAN_CATALOG.quarter.basePrice * 0.2);
  const yPrice = PLAN_CATALOG.year.basePrice - Math.round(PLAN_CATALOG.year.basePrice * 0.2);
  const hPrice = PLAN_CATALOG.half.basePrice - Math.round(PLAN_CATALOG.half.basePrice * 0.2);
  assert.deepEqual(seen, [qPrice, yPrice, hPrice, yPrice, qPrice]);
});
check("satu permintaan per (kode, paket) — dedupe, bukan tiap render", () => {
  assert.match(src, /quoteRequestedRef = useRef<Set<string>>\(new Set\(\)\)/, "needs a requested-key set");
  assert.ok(
    /PLAN_ORDER\.filter\(\s*\r?\n?\s*\(planId\) => !quoteRequestedRef\.current\.has\(quoteKey\(committedCode, planId\)\)/.test(src),
    "only missing (code, plan) pairs should be fetched"
  );
});

// ── 3: UI bersih ───────────────────────────────────────────────────────────
check("negatif: banner 'Kode promo terpasang' tidak ada lagi", () => {
  assert.ok(!src.includes("Kode promo terpasang"), "success banner was removed");
  assert.ok(!src.includes("promoAppliedBanner"), "state was removed");
});
check("negatif: countdown 1 jam hilang dari state, localStorage, dan UI", () => {
  assert.ok(!src.includes("promo_deadline"), "deadline localStorage key was removed");
  assert.ok(!src.includes("timeLeft"), "timer state was removed");
  assert.ok(!src.includes("formatTime"), "timer formatter was removed");
});
check("ringkasan Subtotal / Potongan / Total Investasi TETAP ada", () => {
  assert.ok(src.includes("Subtotal ("), "summary must show base price");
  assert.ok(src.includes("Potongan Kode Promo"), "summary must show discount line");
  assert.ok(src.includes("Total Investasi"), "summary must show final price");
});

// ── 4: resilience ──────────────────────────────────────────────────────────
check("429: di-retry sekali diam-diam, bukan langsung error", () => {
  assert.match(
    src,
    /for \(let attempt = 0; attempt < 2; attempt\+\+\) \{[\s\S]{0,400}?res\.status === 429[\s\S]{0,120}?continue;/,
    "quote request must retry 429 once before failing"
  );
});
check("error hanya dari aksi eksplisit: jalur otomatis membuang pesan", () => {
  assert.ok(
    src.includes("if (quote) next[quoteKey(committedCode, planId)] = quote;"),
    "auto quotes drop failures silently so cards simply stay at full price"
  );
  assert.ok(
    src.includes('setCheckoutError(error || "Kode promo tidak bisa dipakai.");'),
    "explicit apply shows the returned error"
  );
});
check("kode promo hanya dikirim ke order kalau server mengutipnya untuk paket ini", () => {
  assert.match(
    src,
    /promoCode:\s*promoQuote \? promoQuote\.code : ""/,
    "checkout body must only include the promo if the server confirmed it for the chosen plan"
  );
});

// ── Report ─────────────────────────────────────────────────────────────────
let passed = 0;
for (const [status, name] of results) {
  const pad = status === "PASS" ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${pad}  ${name}`);
  if (status === "PASS") passed++;
}
console.log(`\n${passed}/${results.length} checkout-promo-auto checks passed`);
if (passed !== results.length) process.exit(1);
