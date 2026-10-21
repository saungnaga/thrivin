/**
 * Binding between a SERVER promo quote and the plan that quote priced.
 *
 * A quote from `/api/scalev/create-order` (`checkPromoOnly: true`) is only true
 * for the plan it was issued for. Without that binding the checkout kept showing
 * the old plan's discount after a plan switch: the 1-year card rendered
 * "Subtotal Rp 465.000 | Potongan −Rp 46.200 | Total Rp 184.800" because
 * Rp 184.800 was the 3-month quote. The server still charged the right amount,
 * but the screen lied about it — a dispute risk, so the quote is now tied to its
 * plan and reused for nothing else.
 *
 * Display-only, like `pricing-copy.ts`: the amount charged always comes from the
 * server. Pure module so `tests/test-promo-quote-plan-binding.mts` can exercise
 * it directly under `node --experimental-strip-types`.
 */

// Explicit .ts extension: tests import this module directly under
// `node --experimental-strip-types`, which does not resolve extensionless
// specifiers. tsconfig has allowImportingTsExtensions for exactly this.
import { PLAN_CATALOG, type PlanKey } from "./plans.ts";
import { monthlyPrice, planMonths } from "./pricing-copy.ts";

export interface PromoQuote {
  code: string;
  /** Plan the server priced this quote for. A quote is never reused across plans. */
  planId: PlanKey;
  discount: number;
  finalPrice: number;
}

export interface PlanPricing {
  originalTotal: number;
  discountedTotal: number;
  originalMonthly: number;
  discountedMonthly: number;
  hasDiscount: boolean;
}

/**
 * The quote, but only when it belongs to this code AND this plan.
 * Any mismatch (other plan, other code, no quote) ⇒ null, so the caller falls
 * back to the catalog price instead of showing a stale discount.
 */
export function quoteForPlan(
  quote: PromoQuote | null,
  code: string,
  planId: PlanKey
): PromoQuote | null {
  if (!quote) return null;
  if (quote.code !== code) return null;
  if (quote.planId !== planId) return null;
  return quote;
}

/**
 * Card/summary numbers for one plan. Promo figures come only from a bound quote.
 */
export function planPricing(planId: PlanKey, quote: PromoQuote | null): PlanPricing {
  const base = PLAN_CATALOG[planId].basePrice;
  const perMonth = monthlyPrice(planId);
  if (!quote) {
    return {
      originalTotal: base,
      discountedTotal: base,
      originalMonthly: perMonth,
      discountedMonthly: perMonth,
      hasDiscount: false,
    };
  }
  return {
    originalTotal: base,
    discountedTotal: quote.finalPrice,
    originalMonthly: perMonth,
    discountedMonthly: Math.max(0, Math.round(quote.finalPrice / planMonths(planId))),
    hasDiscount: quote.discount > 0,
  };
}

/**
 * Key for the checkout's map of held quotes: exactly one quote per
 * (code, plan) pair, so a quote can never be looked up for another plan.
 */
export function quoteKey(code: string, planId: PlanKey): string {
  return `${code.trim().toUpperCase()}|${planId}`;
}

/**
 * Quote for this code+plan out of the map the checkout holds (it asks the server
 * once per plan so EVERY card can show its struck-through price). Missing entry,
 * other plan, or other code ⇒ null, i.e. the catalog price — never a stale quote.
 */
export function quoteFromMap(
  quotes: Readonly<Record<string, PromoQuote>>,
  code: string,
  planId: PlanKey
): PromoQuote | null {
  const normalized = code.trim().toUpperCase();
  return quoteForPlan(quotes[quoteKey(normalized, planId)] ?? null, normalized, planId);
}
