/**
 * Scalev builds every order URL on the store's custom domain
 * (`checkout.thrivin.id`). Proved live 2026-10-25:
 *
 *  1. That host fails TLS at Scalev's edge (`sslv3 alert handshake failure`,
 *     and `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` in a real browser), so a buyer
 *     who opens it sees a browser error — the "error after paying" report.
 *  2. The store's Scalev-hosted domain is `digitanest.myscalev.com` (the
 *     business username), NOT `thrivin.myscalev.com`. An earlier attempt swapped
 *     to the wrong host and produced "ERROR 404" because Scalev resolves a
 *     public order by HOST + secret slug. `digitanest.myscalev.com` serves both
 *     `/pay/<id>` and `/o/<slug>/success` for this store (verified in a browser).
 *
 * So: probe the canonical host, and only when it does not answer, swap it to
 * the verified hosted domain of THIS store, preserving path and query.
 */
export const STORE_CUSTOM_HOST = "checkout.thrivin.id";
export const SCALEV_HOSTED_HOST = "digitanest.myscalev.com";

export interface CheckoutLink {
  url: string;
  /** false only when the canonical host was probed, failed, and no fallback exists. */
  reachable: boolean;
}

export async function checkCheckoutLink(
  url: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 1500
): Promise<CheckoutLink> {
  const value = (url ?? "").trim();
  if (!value.includes(STORE_CUSTOM_HOST)) return { url: value, reachable: true };
  try {
    await fetchImpl(value, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
    return { url: value, reachable: true };
  } catch {
    // Dead custom host: same path + query on the store's verified hosted domain.
    return {
      url: value.split(STORE_CUSTOM_HOST).join(SCALEV_HOSTED_HOST),
      reachable: true,
    };
  }
}
