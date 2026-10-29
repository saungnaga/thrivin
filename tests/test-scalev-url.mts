/**
 * Unit checks for the Scalev checkout-link domain mapping.
 * Target domain: digitanest.myscalev.com (working, valid SSL host)
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

// 1. Target hosted host is digitanest.myscalev.com
{
  check(SCALEV_HOSTED_HOST === "digitanest.myscalev.com", "target host is digitanest.myscalev.com", SCALEV_HOSTED_HOST);
}

// 2. Swaps legacy checkout.thrivin.id to digitanest.myscalev.com
{
  const legacy = "https://checkout.thrivin.id/pay/250130ABCD";
  const out = toCheckoutDomain(legacy);
  check(
    out === "https://digitanest.myscalev.com/pay/250130ABCD",
    "legacy checkout.thrivin.id maps to digitanest.myscalev.com",
    out
  );
}

// 3. Swaps non-existent checkout.thrivin.com to digitanest.myscalev.com
{
  const wrong = "https://checkout.thrivin.com/pay/order_123";
  const out = toCheckoutDomain(wrong);
  check(
    out === "https://digitanest.myscalev.com/pay/order_123",
    "checkout.thrivin.com maps to digitanest.myscalev.com",
    out
  );
}

// 4. Swaps thrivin.myscalev.com to digitanest.myscalev.com
{
  const wrong = "https://thrivin.myscalev.com/pay/order_456";
  const out = toCheckoutDomain(wrong);
  check(
    out === "https://digitanest.myscalev.com/pay/order_456",
    "thrivin.myscalev.com maps to digitanest.myscalev.com",
    out
  );
}

// 5. Preserves path, query parameters, and slug
{
  const direct = "https://checkout.thrivin.id/o/slug_xyz123/success?src=promo&ref=wa";
  const out = toCheckoutDomain(direct);
  check(
    out === "https://digitanest.myscalev.com/o/slug_xyz123/success?src=promo&ref=wa",
    "path, query params, and slug preserved",
    out
  );
}

// 6. Already canonical domain kept verbatim
{
  const canonical = "https://digitanest.myscalev.com/pay/250130ABCD";
  const out = toCheckoutDomain(canonical);
  check(out === canonical, "already canonical domain kept verbatim", out);
}

// 7. checkCheckoutLink returns canonical url
{
  const res = await checkCheckoutLink("https://checkout.thrivin.id/pay/test");
  check(
    res.url === "https://digitanest.myscalev.com/pay/test" && res.reachable === true,
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
