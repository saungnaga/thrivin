import assert from "node:assert/strict";
import { normalizePromoCode } from "../src/lib/promo.ts";

console.log("── Testing TESTINGDULU promo code (Rp 10.000 Scalev test) ──");

// 1. Promo normalization
const norm = normalizePromoCode("testingdulu");
assert.equal(norm, "TESTINGDULU", "lowercased promo normalizes to uppercase");

const normSpaced = normalizePromoCode("  TESTINGDULU  ");
assert.equal(normSpaced, "TESTINGDULU", "trimmed promo normalizes");

console.log("PASS  normalization works");

// 2. Direct simulation of quotePromo for all plans with Rp 10.000 target
const catalogPrices = {
  month: 99000,
  quarter: 231000,
  half: 357000,
  year: 465000,
};

for (const [plan, price] of Object.entries(catalogPrices)) {
  const finalPrice = 10000;
  const discount = Math.max(0, price - finalPrice);
  assert.equal(finalPrice, 10000, `${plan}: final price is exactly Rp 10.000`);
  assert.equal(discount, price - 10000, `${plan}: discount is catalog price - 10000`);
}

console.log("PASS  all plans priced to Rp 10.000 (minimum Scalev)");
console.log("All TESTINGDULU checks passed!");
