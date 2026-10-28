/**
 * Unit checks for the Scalev checkout-link domain mapping.
 * Target domain: checkout.thrivin.com
 */
import assert from "node:assert/strict";
import {
  SCALEV_HOSTED_HOST,
  STORE_CUSTOM_HOST,
  checkCheckoutLink,
  toCheckoutDomain,
} from "../src/lib/scalev-url.ts";

const results: Array<[string, string]> = [];
function check(ok: boolean, name: string, detail = "") {
  results.push([ok ? "PASS" : "FAIL", `${name}${detail ? " — " + detail : ""}`]);
}

// 1. Target custom host is checkout.thrivin.com
{
  check(STORE_CUSTOM_HOST === "checkout.thrivin.com", "target host is checkout.thrivin.com", STORE_CUSTOM_HOST);
}

// 2. Swaps legacy checkout.thrivin.id to checkout.thrivin.com
{
  const legacy = "https://checkout.thrivin.id/pay/250130ABCD";
  const out = toCheckoutDomain(legacy);
  check(
    out === "https://checkout.thrivin.com/pay/250130ABCD",
    "legacy checkout.thrivin.id maps to checkout.thrivin.com",
    out
  );
}

// 3. Swaps digitanest.myscalev.com to checkout.thrivin.com
{
  const hosted = "https://digitanest.myscalev.com/pay/order_123";
  const out = toCheckoutDomain(hosted);
  check(
    out === "https://checkout.thrivin.com/pay/order_123",
    "hosted digitanest.myscalev.com maps to checkout.thrivin.com",
    out
  );
}

// 4. Swaps thrivin.myscalev.com to checkout.thrivin.com
{
  const wrong = "https://thrivin.myscalev.com/pay/order_456";
  const out = toCheckoutDomain(wrong);
  check(
    out === "https://checkout.thrivin.com/pay/order_456",
    "thrivin.myscalev.com maps to checkout.thrivin.com",
    out
  );
}

// 5. Preserves path, query parameters, and slug
{
  const direct = "https://digitanest.myscalev.com/o/slug_xyz123/success?src=promo&ref=wa";
  const out = toCheckoutDomain(direct);
  check(
    out === "https://checkout.thrivin.com/o/slug_xyz123/success?src=promo&ref=wa",
    "path, query params, and slug preserved",
    out
  );
}

// 6. Already checkout.thrivin.com is kept verbatim
{
  const target = "https://checkout.thrivin.com/pay/250130ABCD";
  const out = toCheckoutDomain(target);
  check(out === target, "already canonical domain kept verbatim", out);
}

// 7. checkCheckoutLink returns reachable: true with canonical domain
{
  const link = await checkCheckoutLink("https://digitanest.myscalev.com/pay/test");
  check(
    link.url === "https://checkout.thrivin.com/pay/test" && link.reachable === true,
    "checkCheckoutLink returns canonical url and reachable: true",
    link.url
  );
}

// 8. Empty and null inputs stay empty
{
  const empty = await checkCheckoutLink("");
  const nil = await checkCheckoutLink(null);
  check(empty.url === "" && empty.reachable, "empty stays empty");
  check(nil.url === "" && nil.reachable, "null becomes empty");
}

const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) console.log(`${status} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL`);
assert.equal(failed.length, 0, "one or more checks failed");
