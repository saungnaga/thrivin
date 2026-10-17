/**
 * Unit checks for the display-copy helpers (W1: prices, promo label, guarantee).
 * Run: node --experimental-strip-types tests/test-web-copy-units.mts
 *
 * These numbers are the ones customers see. They must equal the server catalog
 * (`PLAN_CATALOG`) and the server promo quote — never a hand-typed figure.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  REFUND_GUARANTEE_TEXT,
  REFUND_GUARANTEE_TITLE,
  TEMANBARU_PROMO,
  entryPrice,
  formatIdr,
  monthlyPrice,
  offerRange,
  planPriceLine,
  promoAppliedNote,
  promoDiscountPill,
  savingsVsMonthlyPercent,
} from "../src/lib/pricing-copy.ts";
import { PLAN_CATALOG } from "../src/lib/plans.ts";

/** The promo store seed — the server's numbers, never re-typed in UI copy. */
const PROMO_SEED = fs.readFileSync(
  path.resolve(import.meta.dirname, "../staging/schema-promo-codes.sql"),
  "utf8"
);

const results: [string, string][] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", `${name} — ${(err as Error).message}`]);
  }
}

// ── A1: prices shown are the catalog prices ──────────────────────────────────
check("formatIdr: Indonesian separators", () => {
  assert.equal(formatIdr(99000), "99.000");
  assert.equal(formatIdr(465000), "465.000");
  assert.equal(formatIdr(10000), "10.000");
});
check("monthlyPrice: derived from catalog basePrice/duration", () => {
  assert.equal(monthlyPrice("month"), 99000);
  assert.equal(monthlyPrice("quarter"), 77000);
  assert.equal(monthlyPrice("half"), 59500);
  assert.equal(monthlyPrice("year"), 38750);
});
check("monthlyPrice: matches PLAN_CATALOG for every plan", () => {
  for (const key of ["month", "quarter", "half", "year"] as const) {
    const months = Math.round(PLAN_CATALOG[key].durationDays / 30);
    assert.equal(monthlyPrice(key), Math.round(PLAN_CATALOG[key].basePrice / months));
  }
});
check("entryPrice: cheapest plan a customer can buy (not 39.000)", () => {
  assert.equal(entryPrice(), 99000);
  assert.equal(entryPrice(), PLAN_CATALOG.month.basePrice);
});
check("savingsVsMonthlyPercent: computed vs paying monthly", () => {
  assert.equal(savingsVsMonthlyPercent("quarter"), 22);
  assert.equal(savingsVsMonthlyPercent("half"), 40);
  assert.equal(savingsVsMonthlyPercent("year"), 61);
});
check("offerRange: JSON-LD range comes from the catalog", () => {
  assert.deepEqual(offerRange(), { low: 99000, high: 465000, count: 4 });
});
check("planPriceLine: lists all four plans with catalog prices", () => {
  const line = planPriceLine();
  for (const key of ["month", "quarter", "half", "year"] as const) {
    assert.ok(line.includes(PLAN_CATALOG[key].name), `missing ${key}`);
    assert.ok(line.includes(formatIdr(PLAN_CATALOG[key].basePrice)), `missing price ${key}`);
  }
});

// ── A3: promo label is derived from the SERVER quote ─────────────────────────
check("promoDiscountPill: TEMANBARU 20% reads as a clean percentage", () => {
  // 20% off Rp 231.000 (quarter) and Rp 465.000 (year)
  assert.equal(promoDiscountPill(46200, 231000), "OFF 20%");
  assert.equal(promoDiscountPill(93000, 465000), "OFF 20%");
  assert.equal(promoDiscountPill(71400, 357000), "OFF 20%");
});
check("promoDiscountPill: TEMANBAIKHATI flat Rp 10.000 shows the rupiah saving, not OFF 96%", () => {
  assert.equal(promoDiscountPill(231000 - 10000, 231000), "HEMAT Rp 221.000");
});
check("promoDiscountPill: no discount -> no pill", () => {
  assert.equal(promoDiscountPill(0, 231000), null);
  assert.equal(promoDiscountPill(-1, 231000), null);
  assert.equal(promoDiscountPill(1000, 0), null);
});
check("promoAppliedNote: final price is the server's number, rounded for display", () => {
  assert.equal(
    promoAppliedNote("TEMANBAIKHATI", 10000),
    "Kode promo TEMANBAIKHATI terpasang — total jadi Rp 10.000."
  );
  assert.equal(
    promoAppliedNote("TEMANBARU", 184800),
    "Kode promo TEMANBARU terpasang — total jadi Rp 184.800."
  );
});
check("promoAppliedNote: never prints a percentage claim", () => {
  assert.ok(!promoAppliedNote("TEMANBAIKHATI", 10000).includes("20%"));
});

// ── A3: advertised promo claim matches the server-side promo store ───────────
check("TEMANBARU_PROMO: the advertised claim matches the promo seed", () => {
  const pct = PROMO_SEED.match(/'TEMANBARU',\s*'percentage',\s*(\d+)/);
  assert.ok(pct, "TEMANBARU percentage row missing from the promo seed");
  assert.equal(
    TEMANBARU_PROMO.discountPercent,
    Number(pct![1]),
    "UI advertises a percentage the promo store does not have"
  );
  assert.ok(
    PROMO_SEED.includes(`('thrivin', '${TEMANBARU_PROMO.code}'`),
    "advertised code is not in the promo seed"
  );
  const plans = PROMO_SEED.match(/'TEMANBARU',\s*'percentage',\s*\d+,\s*ARRAY\[([^\]]+)\]/);
  assert.ok(
    plans && plans[1].includes("'quarter'") && plans[1].includes("'half'") && plans[1].includes("'year'"),
    "promo must cover 3 months and up to match the copy"
  );
});
check("TEMANBAIKHATI: flat price stays a server quote, not advertised copy", () => {
  const flat = PROMO_SEED.match(/'TEMANBAIKHATI',\s*'flat_price',\s*(\d+)/);
  assert.ok(flat, "TEMANBAIKHATI flat_price row missing from the promo seed");
  // The pill/note helpers are fed the server quote; this pins the seed number the
  // unit checks above (Rp 10.000 on quarter = Rp 231.000) are written against.
  assert.equal(Number(flat![1]), 10000);
  assert.equal(
    promoDiscountPill(PLAN_CATALOG.quarter.basePrice - Number(flat![1]), PLAN_CATALOG.quarter.basePrice),
    "HEMAT Rp 221.000"
  );
});

// ── A4: guarantee wording stays inside the approved policy ───────────────────
check("guarantee: 3 days, 100% refund, no extra promise", () => {
  assert.equal(REFUND_GUARANTEE_TITLE, "Garansi Uang Kembali 3 Hari");
  assert.ok(REFUND_GUARANTEE_TEXT.includes("3 hari pertama"));
  assert.ok(REFUND_GUARANTEE_TEXT.includes("pengembalian dana 100%"));
  for (const overclaim of ["tanpa syarat", "otomatis", "kapan pun", "seumur hidup"]) {
    assert.ok(
      !REFUND_GUARANTEE_TEXT.toLowerCase().includes(overclaim),
      `overclaim: ${overclaim}`
    );
  }
});

let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} copy unit checks passed`);
process.exit(failed === 0 ? 0 : 1);
