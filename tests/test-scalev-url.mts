/**
 * Unit checks for the Scalev checkout-link rule (kartu t_170cdb60).
 *
 *   node --experimental-strip-types tests/test-scalev-url.mts
 *
 * Proved live 2026-10-25 in a real browser:
 *  - `checkout.thrivin.id` (store custom domain) fails TLS at Scalev's edge:
 *    ERR_SSL_VERSION_OR_CIPHER_MISMATCH. Buyers see a browser error.
 *  - Scalev resolves a public order by HOST + secret slug, and the store's
 *    verified hosted domain is `digitanest.myscalev.com` (business username).
 *    `/pay/<id>` and `/o/<slug>/success` both render there.
 *  - `thrivin.myscalev.com` is NOT this store's domain and answers 404 — that
 *    was the wrong fallback used before.
 *
 * Rule under test: probe the canonical host; when it does not answer, swap to
 * `digitanest.myscalev.com` preserving path and query.
 */
import assert from "node:assert/strict";
import {
  SCALEV_HOSTED_HOST,
  STORE_CUSTOM_HOST,
  checkCheckoutLink,
} from "../src/lib/scalev-url.ts";

const results: Array<[string, string]> = [];
function check(ok: boolean, name: string, detail = "") {
  results.push([ok ? "PASS" : "FAIL", `${name}${detail ? " — " + detail : ""}`]);
}

const DEAD_URL = `https://${STORE_CUSTOM_HOST}/o/abc123/success`;
const calls: string[] = [];

// 1. Dead custom host => swapped to the store's verified hosted domain.
{
  calls.length = 0;
  const out = await checkCheckoutLink(DEAD_URL, (async (url: string) => {
    calls.push(String(url));
    throw new Error("sslv3 alert handshake failure");
  }) as unknown as typeof fetch);
  check(
    out.url === `https://${SCALEV_HOSTED_HOST}/o/abc123/success`,
    "dead host falls back to the verified hosted domain",
    out.url
  );
  check(out.reachable === true, "fallback URL is usable", String(out.reachable));
  check(calls.length === 1 && calls[0] === DEAD_URL, "host is probed before swapping", `${calls.length} call(s)`);
}

// 2. The fallback host must be the business username domain, never thrivin.myscalev.com.
{
  check(SCALEV_HOSTED_HOST === "digitanest.myscalev.com", "fallback host is digitanest.myscalev.com", SCALEV_HOSTED_HOST);
  check(!SCALEV_HOSTED_HOST.includes("thrivin"), "fallback host is not thrivin.myscalev.com", SCALEV_HOSTED_HOST);
}

// 3. Host answers (SSL fixed later) => kept verbatim, no rewrite.
{
  const out = await checkCheckoutLink(DEAD_URL, (async () => new Response(null, { status: 200 })) as unknown as typeof fetch);
  check(out.url === DEAD_URL && out.reachable === true, "reachable custom host is kept verbatim", out.url);
}

// 4. Any other host: no probe (no latency on the happy path).
{
  calls.length = 0;
  const other = `https://${SCALEV_HOSTED_HOST}/pay/xyz`;
  const out = await checkCheckoutLink(other, (async (url: string) => {
    calls.push(String(url));
    throw new Error("must not be called");
  }) as unknown as typeof fetch);
  check(out.url === other && out.reachable === true, "hosted host passes through", out.url);
  check(calls.length === 0, "non-custom host is not probed", `${calls.length} call(s)`);
}

// 5. Missing URL stays empty and is not treated as an outage.
{
  const empty = await checkCheckoutLink("");
  const nil = await checkCheckoutLink(null);
  check(empty.url === "" && empty.reachable, "empty stays empty");
  check(nil.url === "" && nil.reachable, "null becomes empty");
}

// 6. Path + query are preserved exactly.
{
  const direct = `https://${STORE_CUSTOM_HOST}/o/zz9/success?src=nota`;
  const out = await checkCheckoutLink(direct, (async () => {
    throw new Error("down");
  }) as unknown as typeof fetch);
  check(out.url === `https://${SCALEV_HOSTED_HOST}/o/zz9/success?src=nota`, "path and query preserved", out.url);
}

const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) console.log(`${status} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL`);
assert.equal(failed.length, 0, "one or more checks failed");
