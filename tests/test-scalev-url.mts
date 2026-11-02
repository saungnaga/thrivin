/**
 * Unit checks for the Scalev checkout-link domain mapping.
 * Target domain: checkout.thrivin.id (official store custom domain)
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

// 1. Target store custom host is checkout.thrivin.id
{
  check(STORE_CUSTOM_HOST === "checkout.thrivin.id", "target custom host is checkout.thrivin.id", STORE_CUSTOM_HOST);
}

// 2. Swaps Scalev hosted domain digitanest.myscalev.com to checkout.thrivin.id
{
  const hosted = "https://digitanest.myscalev.com/pay/250130ABCD";
  const out = toCheckoutDomain(hosted);
  check(
    out === "https://checkout.thrivin.id/pay/250130ABCD",
    "digitanest.myscalev.com maps to checkout.thrivin.id",
    out
  );
}

// 3. Swaps non-existent checkout.thrivin.com to checkout.thrivin.id
{
  const wrong = "https://checkout.thrivin.com/pay/order_123";
  const out = toCheckoutDomain(wrong);
  check(
    out === "https://checkout.thrivin.id/pay/order_123",
    "checkout.thrivin.com maps to checkout.thrivin.id",
    out
  );
}

// 4. Swaps thrivin.myscalev.com to checkout.thrivin.id
{
  const wrong = "https://thrivin.myscalev.com/pay/order_456";
  const out = toCheckoutDomain(wrong);
  check(
    out === "https://checkout.thrivin.id/pay/order_456",
    "thrivin.myscalev.com maps to checkout.thrivin.id",
    out
  );
}

// 5. Preserves path, query parameters, and slug on checkout.thrivin.id
{
  const direct = "https://checkout.thrivin.id/o/slug_xyz123/success?src=promo&ref=wa";
  const out = toCheckoutDomain(direct);
  check(
    out === "https://checkout.thrivin.id/o/slug_xyz123/success?src=promo&ref=wa",
    "path, query params, and slug preserved",
    out
  );
}

// 6. Already canonical checkout.thrivin.id domain kept verbatim
{
  const canonical = "https://checkout.thrivin.id/pay/250130ABCD";
  const out = toCheckoutDomain(canonical);
  check(out === canonical, "already canonical domain kept verbatim", out);
}

// 7. checkCheckoutLink returns canonical url
{
  const res = await checkCheckoutLink("https://digitanest.myscalev.com/pay/test");
  check(
    res.url === "https://checkout.thrivin.id/pay/test" && res.reachable === true,
    "checkCheckoutLink returns canonical url and reachable: true",
    res.url
  );
}

// 8. Empty input stays empty
{
  check(toCheckoutDomain("") === "", "empty stays empty");
}

// 9. Null input becomes empty
{
  check(toCheckoutDomain(null) === "", "null becomes empty");
}

let failed = 0;
for (const [status, name] of results) {
  if (status === "PASS") {
    console.log(`PASS ${name}`);
  } else {
    console.error(`FAIL ${name}`);
    failed++;
  }
}

console.log(`\n${results.length - failed}/${results.length} PASS, ${failed} FAIL`);
assert.equal(failed, 0, "Some tests failed");
