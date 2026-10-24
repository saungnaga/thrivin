/**
 * Scalev hands back public URLs on the store's custom domain
 * (`checkout.thrivin.id`). That host currently fails TLS, so a buyer who is
 * sent there sees a browser error instead of the page. Never forward a URL on
 * that host without probing it first; when it does not answer, swap in the
 * Scalev-hosted domain that serves the same paths.
 *
 * Applies to every Scalev URL the browser is about to open: the checkout
 * `paymentUrl` AND the canonical `redirectUrl` (Scalev builds that one from
 * "After Checkout" and it also carries the custom host).
 */
export const DEAD_CUSTOM_HOST = "checkout.thrivin.id";
export const SCALEV_HOSTED_HOST = "thrivin.myscalev.com";

export async function reachableScalevUrl(
  url: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 1500
): Promise<string> {
  const value = (url ?? "").trim();
  if (!value.includes(DEAD_CUSTOM_HOST)) return value;
  try {
    await fetchImpl(value, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
    return value;
  } catch {
    return value.split(DEAD_CUSTOM_HOST).join(SCALEV_HOSTED_HOST);
  }
}
