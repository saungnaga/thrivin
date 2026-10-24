/**
 * Unit checks for the Scalev URL host rule (kartu t_170cdb60).
 *
 *   node --experimental-strip-types tests/test-scalev-url.mts
 *
 * The store's custom domain `checkout.thrivin.id` fails TLS (proven live:
 * curl exit 35, `sslv3 alert handshake failure`). Any Scalev URL handed to the
 * browser must be probed and swapped to the Scalev-hosted domain when the
 * custom host does not answer — for `paymentUrl` AND `redirectUrl`.
 */
import assert from "node:assert/strict";
import {
  DEAD_CUSTOM_HOST,
  SCALEV_HOSTED_HOST,
  reachableScalevUrl,
} from "../src/lib/scalev-url.ts";

const results: Array<[string, string]> = [];
function check(ok: boolean, name: string, detail = "") {
  results.push([ok ? "PASS" : "FAIL", `${name}${detail ? " — " + detail : ""}`]);
}

const DEAD_URL = `https://${DEAD_CUSTOM_HOST}/o/abc123/success`;
const calls: string[] = [];

// 1. Dead custom host + HEAD fails => rewritten to the hosted domain.
{
  calls.length = 0;
  const out = await reachableScalevUrl(DEAD_URL, (async (url: string) => {
    calls.push(String(url));
    throw new Error("sslv3 alert handshake failure");
  }) as unknown as typeof fetch);
  check(out === `https://${SCALEV_HOSTED_HOST}/o/abc123/success`, "dead host fails -> hosted host", out);
  check(calls.length === 1 && calls[0] === DEAD_URL, "dead host is probed before rewriting", `${calls.length} call(s)`);
}

// 2. Dead custom host but reachable (SSL fixed later) => untouched, not rewritten blindly.
{
  const out = await reachableScalevUrl(DEAD_URL, (async () => new Response(null, { status: 200 })) as unknown as typeof fetch);
  check(out === DEAD_URL, "reachable custom host is kept verbatim", out);
}

// 3. Any other host: no probe, no rewrite (no latency on the happy path).
{
  calls.length = 0;
  const other = "https://thrivin.myscalev.com/pay/xyz";
  const out = await reachableScalevUrl(other, (async (url: string) => {
    calls.push(String(url));
    throw new Error("must not be called");
  }) as unknown as typeof fetch);
  check(out === other, "hosted host passes through", out);
  check(calls.length === 0, "non-custom host is not probed", `${calls.length} call(s)`);
}

// 4. Missing URL stays empty (caller keeps its existing fallback path).
{
  check((await reachableScalevUrl("")) === "", "empty stays empty");
  check((await reachableScalevUrl(null)) === "", "null becomes empty");
}

// 5. Rewrite covers future redirect targets too (path preserved exactly).
{
  const direct = `https://${DEAD_CUSTOM_HOST}/o/zz9/success?src=nota`;
  const out = await reachableScalevUrl(direct, (async () => {
    throw new Error("down");
  }) as unknown as typeof fetch);
  check(out === `https://${SCALEV_HOSTED_HOST}/o/zz9/success?src=nota`, "path and query preserved", out);
}

const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) console.log(`${status} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL`);
assert.equal(failed.length, 0, "one or more checks failed");
