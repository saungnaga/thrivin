/**
 * Customer-facing pricing copy, derived from the server price catalog.
 *
 * Rule (S0 contract §5 + §11, W1 slice): `PLAN_CATALOG` in `plans.ts` is the
 * single source of prices. Pages derive what they show from here instead of
 * retyping numbers in JSX, so a catalog change can never leave a stale claim
 * (the old hardcoded "Mulai dari Rp 39.000/bulan" was never a price anyone
 * could actually pay).
 *
 * This module is display-only. It never decides what a customer is charged —
 * the order amount comes from `PLAN_CATALOG` / the promo store on the server.
 */

// Explicit .ts extension: tests run this module directly under
// `node --experimental-strip-types`, which does not resolve extensionless
// specifiers. tsconfig has allowImportingTsExtensions for exactly this.
import { PLAN_CATALOG, type PlanKey } from "./plans.ts";

export const PLAN_ORDER: readonly PlanKey[] = ["month", "quarter", "half", "year"];

/**
 * Marketing claim for the only promo advertised in static copy.
 *
 * The authoritative promo lives in the `promo_codes` table (dashboard-managed);
 * this constant exists so the "diskon 20%" sentence is typed ONCE and
 * `tests/test-web-copy-units.mts` can prove it still matches the migration seed.
 * TEMANBAIKHATI (flat Rp 10.000, quarter) is deliberately NOT advertised here —
 * its wording is a candidate awaiting owner approval, and the checkout shows its
 * real numbers from the server quote only.
 */
export const TEMANBARU_PROMO = {
  code: "TEMANBARU",
  discountPercent: 20,
  minMonths: 3,
} as const;

/** 99000 -> "99.000" (id-ID thousands separator, no currency symbol). */
export function formatIdr(amount: number): string {
  return Math.round(amount).toLocaleString("id-ID");
}

/** Billed months in a plan (catalog durations are exact multiples of 30 days). */
export function planMonths(key: PlanKey): number {
  return Math.round(PLAN_CATALOG[key].durationDays / 30);
}

/** Effective price per month for one plan, rounded to whole rupiah. */
export function monthlyPrice(key: PlanKey): number {
  return Math.round(PLAN_CATALOG[key].basePrice / planMonths(key));
}

/** Cheapest plan a customer can actually buy today (not a per-month figure). */
export function entryPrice(): number {
  return Math.min(...PLAN_ORDER.map((key) => PLAN_CATALOG[key].basePrice));
}

/** Savings vs buying the same months one month at a time, whole percent. */
export function savingsVsMonthlyPercent(key: PlanKey): number {
  const stepwise = PLAN_CATALOG.month.basePrice * planMonths(key);
  return Math.round((1 - PLAN_CATALOG[key].basePrice / stepwise) * 100);
}

/** Offer range for structured data (JSON-LD), straight from the catalog. */
export function offerRange(): { low: number; high: number; count: number } {
  const prices = PLAN_ORDER.map((key) => PLAN_CATALOG[key].basePrice);
  return { low: Math.min(...prices), high: Math.max(...prices), count: prices.length };
}

/** One-line catalog summary, e.g. for chat answers. */
export function planPriceLine(): string {
  return PLAN_ORDER.map(
    (key) => `${PLAN_CATALOG[key].name} Rp ${formatIdr(PLAN_CATALOG[key].basePrice)}`
  ).join(" · ");
}

/**
 * Pill next to a struck-through price, built from a SERVER promo quote.
 * Clean percentages read as "OFF 20%"; anything else (e.g. the flat Rp 10.000
 * TEMANBAIKHATI price on the 3-month plan) reads as the rupiah saving, because
 * "OFF 96%" would be technically true and useless.
 */
export function promoDiscountPill(discount: number, originalTotal: number): string | null {
  if (!(discount > 0) || !(originalTotal > 0)) return null;
  const percent = (discount / originalTotal) * 100;
  const rounded = Math.round(percent);
  return Math.abs(percent - rounded) < 0.05
    ? `OFF ${rounded}%`
    : `HEMAT Rp ${formatIdr(discount)}`;
}

/** Confirmation line under the promo field, from the SERVER quote only. */
export function promoAppliedNote(code: string, finalPrice: number): string {
  return `Kode promo ${code} terpasang — total jadi Rp ${formatIdr(finalPrice)}.`;
}

/**
 * Refund policy wording. ONE copy for every page, and it must not promise more
 * than the approved policy in `src/app/privacy/page.tsx` §3 ("dalam 3 hari
 * pertama ... berhak mengajukan klaim garansi pengembalian dana 100%").
 * Change here, not in JSX — a stronger claim on one page would be a legal gap.
 */
export const REFUND_GUARANTEE_TITLE = "Garansi Uang Kembali 3 Hari";
export const REFUND_GUARANTEE_TEXT =
  "Dalam 3 hari pertama setelah pembelian, kamu berhak klaim pengembalian dana 100% kalau merasa pendampingan Nina belum cocok.";
