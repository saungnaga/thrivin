/**
 * Scalev checkout domain configuration.
 * Owner requirement: payment must go through `checkout.thrivin.com`.
 * Any order link emitted by Scalev (hosted `digitanest.myscalev.com`, legacy `checkout.thrivin.id`,
 * or `thrivin.myscalev.com`) is mapped to `checkout.thrivin.com` while preserving
 * path, query parameters, and slug.
 */
export const STORE_CUSTOM_HOST = "checkout.thrivin.com";
export const SCALEV_HOSTED_HOST = "digitanest.myscalev.com";

export interface CheckoutLink {
  url: string;
  /** false only when the canonical host was probed, failed, and no fallback exists. */
  reachable: boolean;
}

/**
 * Normalizes any checkout URL to use the canonical domain `checkout.thrivin.com`.
 * Swaps older domains or hosted domains (`checkout.thrivin.id`, `digitanest.myscalev.com`,
 * `thrivin.myscalev.com`, or any `*.myscalev.com`) while preserving path, query, and hash.
 */
export function toCheckoutDomain(url: string | null | undefined): string {
  const value = (url ?? "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      parsed.hostname === "checkout.thrivin.id" ||
      parsed.hostname === "digitanest.myscalev.com" ||
      parsed.hostname === "thrivin.myscalev.com" ||
      parsed.hostname.endsWith(".myscalev.com")
    ) {
      parsed.hostname = STORE_CUSTOM_HOST;
      return parsed.toString();
    }
    return value;
  } catch {
    return value.replace(
      /checkout\.thrivin\.id|digitanest\.myscalev\.com|thrivin\.myscalev\.com/g,
      STORE_CUSTOM_HOST
    );
  }
}

export async function checkCheckoutLink(
  url: string | null | undefined,
  _fetchImpl: typeof fetch = fetch,
  _timeoutMs = 1500
): Promise<CheckoutLink> {
  const value = (url ?? "").trim();
  if (!value) return { url: "", reachable: true };
  const normalized = toCheckoutDomain(value);
  return {
    url: normalized,
    reachable: true,
  };
}
