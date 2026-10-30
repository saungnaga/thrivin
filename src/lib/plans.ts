/**
 * Server-side plan catalog (B-2 + M-6).
 *
 * The browser used to send `amount` and the server trusted it, then computed
 * `product_discount` so Scalev charged exactly that number. Price now comes
 * from here; the client's `amount` is ignored entirely.
 *
 * `subscriptionPlanId` / `tokenLimit` / `durationDays` are what the webhook uses
 * to provision the subscription, so quota follows the plan actually bought
 * instead of a hardcoded `plan_id: 2, token_limit: 500000` (M-6).
 *
 * ponytail: static table, not DB-driven — upgrade to a `subscription_plans`
 * lookup when pricing needs to change without a deploy.
 */

export type PlanKey = "month" | "quarter" | "half" | "year";

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  durationDays: number;
  /** List price in IDR, must match the catalog rendered by the onboarding page. */
  basePrice: number;
  /** subscription_plans.id */
  subscriptionPlanId: number;
  tokenLimit: number;
  /** Scalev variant used when the live product lookup is unavailable. */
  fallbackVariantId: string;
  fallbackVariantPrice: number;
}

export const SHARED_SCALEV_CUSTOMER_PRICE_VARIANT_ID = "variant_HQdTVIe99NfKi4yjdryOprFc";

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  month: {
    key: "month",
    name: "Paket 1 Bulan (Trial)",
    durationDays: 30,
    basePrice: 99000,
    subscriptionPlanId: 1,
    tokenLimit: 100000,
    fallbackVariantId: SHARED_SCALEV_CUSTOMER_PRICE_VARIANT_ID,
    fallbackVariantPrice: 99000,
  },
  quarter: {
    key: "quarter",
    name: "Paket 3 Bulan (Quarter)",
    durationDays: 90,
    basePrice: 219000,
    subscriptionPlanId: 2,
    tokenLimit: 500000,
    fallbackVariantId: SHARED_SCALEV_CUSTOMER_PRICE_VARIANT_ID,
    fallbackVariantPrice: 219000,
  },
  half: {
    key: "half",
    name: "Paket 6 Bulan (Half-Year)",
    durationDays: 180,
    basePrice: 359000,
    subscriptionPlanId: 3,
    tokenLimit: 2000000,
    fallbackVariantId: SHARED_SCALEV_CUSTOMER_PRICE_VARIANT_ID,
    fallbackVariantPrice: 359000,
  },
  year: {
    key: "year",
    name: "Paket 1 Tahun (Yearly)",
    durationDays: 365,
    basePrice: 465000,
    subscriptionPlanId: 3,
    tokenLimit: 2000000,
    fallbackVariantId: SHARED_SCALEV_CUSTOMER_PRICE_VARIANT_ID,
    fallbackVariantPrice: 465000,
  },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && value in PLAN_CATALOG;
}

/** Product-name keywords used to resolve the live Scalev variant per plan. */
export const PLAN_LOOKUP_KEYWORDS: Record<PlanKey, string[]> = {
  month: ["1 bulan", "30 hari"],
  quarter: ["3 bulan", "90 hari"],
  half: ["6 bulan", "180 hari"],
  year: ["1 tahun", "12 bulan", "365 hari"],
};

/**
 * Category price (harga katalog) for a plan. Lifeline for when the promo store
 * is unreachable — the caller then refuses the promo and charges the list price,
 * rather than silently honouring a discount it cannot verify.
 *
 * Promo pricing lives in the `promo_codes` table now (dashboard-managed); the
 * old hardcoded TEMANBARU / TEMANBAIKHATI rules moved into the migration seed.
 */
export function resolvePlanPrice(plan: PlanKey): { price: number; promoApplied: null } {
  return { price: PLAN_CATALOG[plan].basePrice, promoApplied: null };
}

/** Provisioning values for the plan key recorded on the onboarding snapshot. */
export function resolveSubscriptionPlan(planKey: unknown): {
  lastPlanKey: PlanKey;
  planId: number;
  tokenLimit: number;
  durationDays: number;
} {
  // ponytail: unknown/missing plan falls back to the 1-month tier (smallest
  // quota), never to the biggest one. Add a DB lookup when plans get dynamic.
  const key: PlanKey = isPlanKey(planKey) ? planKey : "month";
  const def = PLAN_CATALOG[key];
  return {
    lastPlanKey: key,
    planId: def.subscriptionPlanId,
    tokenLimit: def.tokenLimit,
    durationDays: def.durationDays,
  };
}