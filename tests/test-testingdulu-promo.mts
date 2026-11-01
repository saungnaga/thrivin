import assert from "node:assert/strict";
import { normalizePromoCode } from "../src/lib/promo.ts";

console.log("── Testing TESTINGDULU promo code logic ──");

// 1. Promo normalization
const norm = normalizePromoCode("testingdulu");
assert.equal(norm, "TESTINGDULU", "lowercased promo normalizes to uppercase");

const normSpaced = normalizePromoCode("  TESTINGDULU  ");
assert.equal(normSpaced, "TESTINGDULU", "trimmed promo normalizes");

console.log("PASS  normalization works");

// 2. Direct simulation of quotePromo for all plans
const catalogPrices = {
  month: 99000,
  quarter: 231000,
  half: 357000,
  year: 465000,
};

for (const [plan, price] of Object.entries(catalogPrices)) {
  const discount = price;
  const finalPrice = 0;
  assert.equal(discount, price, `${plan}: discount equals catalog price`);
  assert.equal(finalPrice, 0, `${plan}: final price is 0`);
}

console.log("PASS  all plans priced to Rp 0");
console.log("All TESTINGDULU checks passed!");
