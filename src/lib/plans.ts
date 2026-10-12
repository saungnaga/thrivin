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

export const PUBLIC_PROMO_CODE = "TEMANBARU";
export const PUBLIC_PROMO_RATE = 0.2; // 20% off, plans longer than 1 month
export const SECRET_PROMO_CODE = "TEMANBAIKHATI";
export const SECRET_PROMO_PRICE = 10000; // flat Rp 10k, 3-month plan only
export const SECRET_PROMO_PLAN: PlanKey = "quarter";

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  month: {
    key: "month",
    name: "Paket 1 Bulan (Trial)",
    durationDays: 30,
    basePrice: 99000,
    subscriptionPlanId: 1,
    tokenLimit: 100000,
    fallbackVariantId: "variant_vF4j4Pwv1wIizRu3VP6FVOgt",
    fallbackVariantPrice: 99000,
  },
  quarter: {
    key: "quarter",
    name: "Paket 3 Bulan (Quarter)",
    durationDays: 90,
    basePrice: 231000,
    subscriptionPlanId: 2,
    tokenLimit: 500000,
    fallbackVariantId: "variant_HQdTVIe99NfKi4yjdryOprFc",
    fallbackVariantPrice: 219000,
  },
  half: {
    key: "half",
    name: "Paket 6 Bulan (Half-Year)",
    durationDays: 180,
    basePrice: 357000,
    subscriptionPlanId: 3,
    tokenLimit: 2000000,
    fallbackVariantId: "variant_f_rx-DoyHQGghKA9LCQsaoz9",
    fallbackVariantPrice: 359000,
  },
  year: {
    key: "year",
    name: "Paket 1 Tahun (Yearly)",
    durationDays: 365,
    basePrice: 465000,
    subscriptionPlanId: 3,
    tokenLimit: 2000000,
    fallbackVariantId: "variant_f_rx-DoyHQGghKA9LCQsaoz9",
    fallbackVariantPrice: 359000,
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

export function isKnownPromoCode(code: string): boolean {
  return code === PUBLIC_PROMO_CODE || code === SECRET_PROMO_CODE;
}

/**
 * Authoritative price. Returns base list price when no (or ineligible) promo.
 * TEMANBAIKHATI is only valid on the 3-month plan, matching the UI.
 */
export function resolvePlanPrice(
  plan: PlanKey,
  promoCode: string
): { price: number; promoApplied: string | null } {
  if (promoCode === SECRET_PROMO_CODE) {
    if (plan === SECRET_PROMO_PLAN) {
      return { price: SECRET_PROMO_PRICE, promoApplied: SECRET_PROMO_CODE };
    }
    return { price: PLAN_CATALOG[plan].basePrice, promoApplied: null };
  }
  if (promoCode === PUBLIC_PROMO_CODE && plan !== "month") {
    return {
      price: Math.round(PLAN_CATALOG[plan].basePrice * (1 - PUBLIC_PROMO_RATE)),
      promoApplied: PUBLIC_PROMO_CODE,
    };
  }
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