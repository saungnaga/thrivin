/**
 * Unit checks for pure helpers: replay/timestamp guard + error redaction.
 * Run: node --experimental-strip-types tests/test-webhook-guards.mts
 */
import assert from "node:assert/strict";
import {
  isTimestampWithinReplayWindow,
  redactError,
} from "../src/lib/onboarding-store.ts";

const now = Date.parse("2026-10-12T20:00:00.000Z");

// 1. Replay guard: fresh ISO timestamp passes.
assert.equal(isTimestampWithinReplayWindow("2026-10-12T20:00:30.000Z", now).ok, true);

// 2. Replay guard: stale ISO timestamp (10 min old) rejected.
assert.equal(isTimestampWithinReplayWindow("2026-10-12T19:50:00.000Z", now).ok, false);

// 3. Replay guard: missing timestamp rejected.
assert.equal(isTimestampWithinReplayWindow(undefined, now).ok, false);
assert.equal(isTimestampWithinReplayWindow("", now).ok, false);

// 4. Replay guard: unix seconds accepted within window.
assert.equal(isTimestampWithinReplayWindow(Math.floor(now / 1000), now).ok, true);

// 5. Replay guard: unix millis accepted within window.
assert.equal(isTimestampWithinReplayWindow(now - 1000, now).ok, true);

// 6. Redaction: phone, email, secret, jwt stripped.
const raw =
  "failed for 6281299988877 / a@b.com with sk_live_ABC123XYZ and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIx.abcde";
const red = redactError(raw);
assert.ok(!red.includes("6281299988877"), "phone leaked: " + red);
assert.ok(!red.includes("a@b.com"), "email leaked: " + red);
assert.ok(!red.includes("ABC123XYZ"), "secret leaked: " + red);
assert.ok(!red.includes("eyJhbGciOiJIUzI1NiJ9"), "jwt leaked: " + red);
assert.ok(red.includes("[phone]") && red.includes("[email]"), "markers missing: " + red);

// 7. Redaction: long errors truncated.
assert.ok(redactError("x".repeat(900)).length <= 501);

console.log("ALL GUARD UNIT CHECKS PASSED");