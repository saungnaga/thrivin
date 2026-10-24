/**
 * Unit checks for the first-touch welcome message builder + JID helper.
 * Run: node --experimental-strip-types tests/test-welcome-message.mts
 */
import assert from "node:assert/strict";
import {
  buildWelcomeMessage,
  splitBubbles,
  focusLabel,
  maskedPhone,
} from "../src/lib/welcome-message.ts";

const SEP = "\n---\n";

// 1. Full onboarding data: name called out, goal mentioned, bubbles split.
const full = buildWelcomeMessage("Budi", {
  programFocus: ["Workout & Strength", "Fat Loss"],
  age: 26,
});
assert.ok(full.includes("Halo Budi!"), "name missing: " + full);
assert.ok(full.includes("Workout & Strength"), "goal missing: " + full);
assert.ok(!full.includes("Ceritain dong"), "should not ask for goal when present");
const bubbles = splitBubbles(full);
assert.equal(bubbles.length, 5, `expected 5 bubbles, got ${bubbles.length}`);
assert.ok(bubbles.length <= 5, "SOUL.md allows max 5 bubbles");
assert.ok(full.includes(SEP), "bridge separator missing");

assert.ok(full.includes("foto makanan"), "food photo capability missing");
assert.ok(full.includes("kalori dan protein"), "nutrition estimate missing");
assert.ok(full.includes("screenshot aktivitas"), "activity screenshot capability missing");
assert.ok(full.includes("pengingat"), "reminder capability missing");

// 2. Partial data (no goal): explains capabilities without interrogating.
const partial = buildWelcomeMessage("Sari", { age: 30 });
assert.ok(partial.includes("Halo Sari!"), "name missing: " + partial);
assert.ok(!partial.includes("Ceritain dong"), "should not repeat onboarding: " + partial);
assert.equal(splitBubbles(partial).length, 5);

// 3. Missing name: greeting still reads naturally, no "undefined"/"null".
for (const empty of [undefined, null, "", "   "]) {
  const msg = buildWelcomeMessage(empty as string, null);
  assert.ok(msg.startsWith("Halo! 👋"), "bad greeting: " + msg);
  assert.ok(!/undefined|null/i.test(msg), "placeholder leaked: " + msg);
  assert.equal(splitBubbles(msg).length, 5);
}

// 4. programFocus accepts string or array; empty values are dropped.
assert.equal(focusLabel({ programFocus: "Kardio" }), "Kardio");
assert.equal(focusLabel({ programFocus: ["Kardio", "  ", "Mobility"] }), "Kardio, Mobility");
assert.equal(focusLabel({ programFocus: [] }), "");
assert.equal(focusLabel(null), "");
assert.ok(!buildWelcomeMessage("Budi", { programFocus: [" ", ""] }).includes("fokus kamu"));

// 5. Bubble count never exceeds the cap even with many focus items.
const wide = buildWelcomeMessage("Budi", {
  programFocus: ["A", "B", "C", "D", "E", "F"],
});
assert.ok(splitBubbles(wide).length <= 5, "bubble cap exceeded");

// 6. JID helper is gone: purchase/postpaid delivery is Cloud API only, so the
//    greeting must not build Baileys chat ids any more (kartu t_ef348cbc).
assert.equal(
  (await import("../src/lib/welcome-message.ts")).toWhatsAppChatId,
  undefined,
  "toWhatsAppChatId must not exist on the purchase path"
);

// 7. W-6: maskedPhone verification
assert.equal(maskedPhone("6281383341841"), "***1841");
assert.equal(maskedPhone("628138334184100"), "***4100");
assert.equal(maskedPhone("08123456789"), "***6789");
assert.equal(maskedPhone("123"), "***");
assert.equal(maskedPhone(""), "***");

console.log("ALL WELCOME MESSAGE UNIT CHECKS PASSED");
