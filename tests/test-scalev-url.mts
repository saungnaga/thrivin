/**
 * Unit checks for the Scalev checkout-link rule (kartu t_170cdb60).
 *
 *   node --experimental-strip-types tests/test-scalev-url.mts
 *
 * Proved live 2026-10-25: Scalev resolves a public order by HOST + secret slug,
 * so a URL rewritten to another domain is a guaranteed 404 (that is the
 * "ERROR 404" buyers saw). The helper must therefore NEVER swap the host — it
 * only reports whether the canonical host answered.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STORE_CUSTOM_HOST, checkCheckoutLink } from "../src/lib/scalev-url.ts";

const results: Array<[string, string]> = [];
function check(ok: boolean, name: string, detail = "") {
  results.push([ok ? "PASS" : "FAIL", `${name}${detail ? " — " + detail : ""}`]);
}

const DEAD_URL = `https://${STORE_CUSTOM_HOST}/o/abc123/success`;
const calls: string[] = [];

// 1. Canonical host unreachable => flagged, URL untouched (no host swap).
{
  calls.length = 0;
  const out = await checkCheckoutLink(DEAD_URL, (async (url: string) => {
    calls.push(String(url));
    throw new Error("sslv3 alert handshake failure");
  }) as unknown as typeof fetch);
  check(out.url === DEAD_URL, "unreachable host keeps the canonical URL", out.url);
  check(out.reachable === false, "unreachable host is reported", String(out.reachable));
  check(calls.length === 1 && calls[0] === DEAD_URL, "host is probed before flagging", `${calls.length} call(s)`);
}

// 2. Host answers (SSL fixed later) => reachable, URL untouched.
{
  const out = await checkCheckoutLink(DEAD_URL, (async () => new Response(null, { status: 200 })) as unknown as typeof fetch);
  check(out.url === DEAD_URL && out.reachable === true, "reachable host passes through", out.url);
}

// 3. Any other host: no probe (no latency on the happy path), always reachable.
{
  calls.length = 0;
  const other = "https://thrivin.myscalev.com/pay/xyz";
  const out = await checkCheckoutLink(other, (async (url: string) => {
    calls.push(String(url));
    throw new Error("must not be called");
  }) as unknown as typeof fetch);
  check(out.url === other && out.reachable === true, "foreign host passes through", out.url);
  check(calls.length === 0, "non-custom host is not probed", `${calls.length} call(s)`);
}

// 4. Missing URL stays empty and is not treated as an outage.
{
  const empty = await checkCheckoutLink("");
  const nil = await checkCheckoutLink(null);
  check(empty.url === "" && empty.reachable, "empty stays empty");
  check(nil.url === "" && nil.reachable, "null becomes empty");
}

// 5. Regression guard: no substitute host may be hardcoded again. Swapping the
//    host is what produced the 404; only the canonical host may appear.
{
  const src = readFileSync(new URL("../src/lib/scalev-url.ts", import.meta.url), "utf8");
  const code = src
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n");
  const hosts = [...code.matchAll(/["'`](?:https:\/\/)?([a-z0-9.-]*myscalev\.com)["'`]/g)].map((m) => m[1]);
  check(hosts.length === 0, "no substitute Scalev host is hardcoded", hosts.join(",") || "none");
}

const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) console.log(`${status} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL`);
assert.equal(failed.length, 0, "one or more checks failed");
