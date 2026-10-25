/**
 * Scalev builds every order URL on the store's custom domain
 * (`checkout.thrivin.id`). Two facts proved live on 2026-10-25:
 *
 *  1. That host fails TLS at Scalev's edge (`sslv3 alert handshake failure`,
 *     ERR_SSL_VERSION_OR_CIPHER_MISMATCH from a third-party fetcher too), so a
 *     buyer who opens it sees a browser error.
 *  2. Scalev resolves a public order by HOST + secret slug
 *     (`/v2/order/public/<host>/<slug>/`). Swapping the host to any other
 *     domain — e.g. `thrivin.myscalev.com` — returns 404, which is the
 *     "ERROR 404" buyers saw after paying.
 *
 * So the URL must never be rewritten: a rewritten host is a guaranteed 404.
 * The only useful thing to do is report that the canonical host is unreachable
 * so the UI can show a contact path instead of navigating into a dead end.
 */
export const STORE_CUSTOM_HOST = "checkout.thrivin.id";

export interface CheckoutLink {
  url: string;
  /** false only when the canonical host was probed and did not answer. */
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
    return { url: value, reachable: false };
  }
}
