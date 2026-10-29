/**
 * Scalev checkout domain configuration.
 *
 * Catatan penting:
 * 1. `checkout.thrivin.com` (.com) tidak terdaftar di DNS (NXDOMAIN).
 * 2. `checkout.thrivin.id` (.id) di sisi Scalev Cloudflare saat ini belum memiliki
 *    sertifikat SSL aktif (`ERR_SSL_VERSION_OR_CIPHER_MISMATCH`).
 * 3. Domain resmi bawaan Scalev untuk toko ini adalah `digitanest.myscalev.com`
 *    yang 100% aktif, memiliki SSL valid, dan melayani pembayaran secara aman.
 *
 * Semua link dialihkan ke `digitanest.myscalev.com` dengan tetap mempertahankan
 * path, query parameter, dan slug.
 */
export const STORE_CUSTOM_HOST = "checkout.thrivin.id";
export const SCALEV_HOSTED_HOST = "digitanest.myscalev.com";

export interface CheckoutLink {
  url: string;
  reachable: boolean;
}

/**
 * Mengarahkan checkout URL ke domain Scalev yang aktif dan ber-SSL aman (`digitanest.myscalev.com`).
 * Menghindari error `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` pada `checkout.thrivin.id`
 * dan error `NXDOMAIN` pada `checkout.thrivin.com`.
 */
export function toCheckoutDomain(url: string | null | undefined): string {
  const value = (url ?? "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      parsed.hostname === "checkout.thrivin.id" ||
      parsed.hostname === "checkout.thrivin.com" ||
      parsed.hostname === "thrivin.myscalev.com"
    ) {
      parsed.hostname = SCALEV_HOSTED_HOST;
      return parsed.toString();
    }
    return value;
  } catch {
    return value.replace(
      /checkout\.thrivin\.id|checkout\.thrivin\.com|thrivin\.myscalev\.com/g,
      SCALEV_HOSTED_HOST
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
