/**
 * Teeth for the promo-quote ↔ plan binding (BUG UANG: total promo salah setelah
 * ganti paket).
 *
 * Production reproduction (83e7522): apply TEMANBARU on the 3-month plan
 * (Rp 231.000 − Rp 46.200 = Rp 184.800), then click the 1-year card. The screen
 * kept showing "Potongan −Rp 46.200 | Total Rp 184.800" next to a Rp 465.000
 * subtotal, while the server would charge Rp 372.000.
 *
 * Two layers are checked:
 *   A. binding  — the client NEVER reads a quote issued for another plan
 *                 (instant after the switch: plain catalog price, no discount);
 *   B. revalidation — once the server answers for the new plan, the numbers are
 *                 that plan's own quote (Rp 465.000 − Rp 93.000 = Rp 372.000).
 *
 * Run: node --experimental-strip-types tests/test-promo-quote-plan-binding.mts
 *
 * Teeth: delete the `quote.planId !== planId` check in src/lib/promo-quote.ts
 * (or drop `planId` from PromoQuote) and the layer-A cases fail with Rp 184.800.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { planPricing, quoteForPlan, type PromoQuote } from "../src/lib/promo-quote.ts";
import { PLAN_CATALOG, type PlanKey } from "../src/lib/plans.ts";
import { TEMANBARU_PROMO } from "../src/lib/pricing-copy.ts";

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
const CODE = TEMANBARU_PROMO.code;
const PLANS: PlanKey[] = ["month", "quarter", "half", "year"];

/** What the server answers for TEMANBARU on `planId` (20% off the catalog). */
function serverQuote(planId: PlanKey): PromoQuote {
  const base = PLAN_CATALOG[planId].basePrice;
  const discount = Math.round((base * TEMANBARU_PROMO.discountPercent) / 100);
  return { code: CODE, planId, discount, finalPrice: base - discount };
}

/** Highest discount a valid quote could ever carry for a plan. */
function maxDiscount(planId: PlanKey): number {
  return Math.round((PLAN_CATALOG[planId].basePrice * TEMANBARU_PROMO.discountPercent) / 100);
}

/** Layer A: customer view for `planId` while the held quote was issued for `quotedFor`. */
function shown(quotedFor: PlanKey, planId: PlanKey) {
  return planPricing(planId, quoteForPlan(serverQuote(quotedFor), CODE, planId));
}

/** Layer B: customer view for `planId` after the client revalidated with the server. */
function shownAfterRevalidation(planId: PlanKey) {
  return planPricing(planId, quoteForPlan(serverQuote(planId), CODE, planId));
}

// ── 0: the server numbers in the bug report ─────────────────────────────────
check("server quote numbers match the bug report", () => {
  assert.deepEqual(serverQuote("quarter"), {
    code: CODE,
    planId: "quarter",
    discount: 46200,
    finalPrice: 184800,
  });
  assert.deepEqual(serverQuote("half"), {
    code: CODE,
    planId: "half",
    discount: 71400,
    finalPrice: 285600,
  });
  assert.deepEqual(serverQuote("year"), {
    code: CODE,
    planId: "year",
    discount: 93000,
    finalPrice: 372000,
  });
});

// ── A1: quote only survives for the plan it was priced for ─────────────────
check("quoteForPlan: same plan + same code ⇒ quote kept", () => {
  const q = serverQuote("quarter");
  assert.equal(quoteForPlan(q, CODE, "quarter"), q);
});
check("quoteForPlan: other plan ⇒ null (no stale quote)", () => {
  const q = serverQuote("quarter");
  for (const plan of PLANS) {
    if (plan === "quarter") continue;
    assert.equal(quoteForPlan(q, CODE, plan), null, `leaked into ${plan}`);
  }
});
check("quoteForPlan: other code ⇒ null", () => {
  assert.equal(quoteForPlan(serverQuote("quarter"), "LAINNYA", "quarter"), null);
});
check("quoteForPlan: no quote ⇒ null", () => {
  assert.equal(quoteForPlan(null, CODE, "quarter"), null);
});

// ── A2: the exact production bug must be unreachable ───────────────────────
check("quarter→year: no Rp 184.800 leak, catalog Rp 465.000 until server answers", () => {
  const pricing = shown("quarter", "year");
  assert.notEqual(pricing.discountedTotal, 184800, "stale 3-month total leaked into 1-year");
  assert.equal(pricing.discountedTotal, 465000);
  assert.equal(pricing.hasDiscount, false);
});
check("quarter→month: no promo (min 3 bulan) ⇒ catalog Rp 99.000", () => {
  const pricing = shown("quarter", "month");
  assert.equal(pricing.discountedTotal, 99000);
  assert.equal(pricing.hasDiscount, false);
});

// ── B: after revalidation, the new plan's own quote is used ────────────────
check("quarter→year: total = Rp 465.000 − Rp 93.000 = Rp 372.000", () => {
  const pricing = shownAfterRevalidation("year");
  assert.equal(pricing.originalTotal, 465000);
  assert.equal(pricing.discountedTotal, 372000);
  assert.equal(pricing.originalTotal - pricing.discountedTotal, 93000);
  assert.equal(pricing.hasDiscount, true);
});
check("quarter→half: total = Rp 357.000 − Rp 71.400 = Rp 285.600", () => {
  assert.equal(shownAfterRevalidation("half").discountedTotal, 285600);
});
check("quarter quote is unchanged for quarter itself (Rp 184.800)", () => {
  const pricing = shownAfterRevalidation("quarter");
  assert.equal(pricing.discountedTotal, 184800);
  assert.equal(pricing.originalTotal - pricing.discountedTotal, 46200);
});

// ── C: back and forth stays consistent ─────────────────────────────────────
check("quarter→year→quarter: Rp 184.800 → Rp 372.000 → Rp 184.800", () => {
  assert.equal(shownAfterRevalidation("quarter").discountedTotal, 184800);
  assert.equal(shownAfterRevalidation("year").discountedTotal, 372000);
  assert.equal(shownAfterRevalidation("quarter").discountedTotal, 184800);
  // …and a year quote never leaks back onto the 3-month plan either.
  assert.equal(shown("year", "quarter").discountedTotal, 231000);
});

// ── D: displayed total is never below (catalog − max possible discount) ────
check("no combination shows a total below catalog − max discount", () => {
  for (const quotedFor of PLANS) {
    for (const planId of PLANS) {
      const pricing = shown(quotedFor, planId);
      const floor = PLAN_CATALOG[planId].basePrice - maxDiscount(planId);
      assert.ok(
        pricing.discountedTotal >= floor,
        `quote(${quotedFor}) on ${planId}: ${pricing.discountedTotal} < floor ${floor}`
      );
      assert.ok(
        pricing.discountedTotal <= pricing.originalTotal,
        `quote(${quotedFor}) on ${planId}: total above catalog`
      );
      // A discount may only be shown when the quote really belongs to the plan.
      assert.equal(pricing.hasDiscount, quotedFor === planId, `hasDiscount(${quotedFor}→${planId})`);
    }
  }
});

// ── E: the page cannot go back to an unbound quote ─────────────────────────
check("onboarding page binds the quote to data.selectedPlan", () => {
  const src = fs.readFileSync(
    path.join(REPO, "src/app/companion/nina/onboarding/[step]/page.tsx"),
    "utf8"
  );
  assert.ok(
    src.includes("quoteForPlan(promoCheck, activePromoCode, data.selectedPlan)"),
    "page must resolve the quote through quoteForPlan(promoCheck, code, selectedPlan)"
  );
  assert.ok(
    /planId: data\.selectedPlan,\s*\n\s*discount:/.test(src),
    "setPromoCheck must record the plan the server quoted"
  );
  assert.ok(
    /if \(!res\.ok \|\| !check\?\.valid\)[\s\S]{0,400}setPromoCheck\(null\)/.test(src),
    "a rejected revalidation must drop the quote"
  );
});

let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} promo plan-binding checks passed`);
process.exit(failed === 0 ? 0 : 1);
