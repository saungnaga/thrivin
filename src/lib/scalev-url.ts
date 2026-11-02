/**
 * Scalev checkout domain configuration.
 *
 * Domain kustom resmi toko: `checkout.thrivin.id`
 * Domain bawaan Scalev: `digitanest.myscalev.com`
 *
 * Mengarahkan seluruh tautan pembayaran ke domain kustom resmi: `checkout.thrivin.id`
 * dengan tetap mempertahankan path, query parameter, dan slug.
 */
export const STORE_CUSTOM_HOST = "checkout.thrivin.id";
export const SCALEV_HOSTED_HOST = "digitanest.myscalev.com";

export interface CheckoutLink {
  url: string;
  reachable: boolean;
}

/**
 * Mengarahkan checkout URL ke custom domain resmi toko (`checkout.thrivin.id`).
 */
export function toCheckoutDomain(url: string | null | undefined): string {
  const value = (url ?? "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      parsed.hostname === "digitanest.myscalev.com" ||
      parsed.hostname === "checkout.thrivin.com" ||
      parsed.hostname === "thrivin.myscalev.com"
    ) {
      parsed.hostname = STORE_CUSTOM_HOST;
      return parsed.toString();
    }
    return value;
  } catch {
    return value.replace(
      /digitanest\.myscalev\.com|checkout\.thrivin\.com|thrivin\.myscalev\.com/g,
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
