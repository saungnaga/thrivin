/**
 * Unit checks for the Cloud-only outbound path (kartu t_ef348cbc).
 *
 *   node --experimental-strip-types tests/test-wa-cloud-units.mts
 *
 * No network, no DB: `fetch` is replaced by a recorder, so "did it call Cloud
 * (and nothing else)?" is asserted on the exact URL/body the module produced.
 */
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  readCloudConfig,
  readWelcomeTemplate,
  sendCloudTemplate,
  sendCloudText,
  NINA_WA_LINK,
  OFFICIAL_WA_NUMBER,
  POST_PAYMENT_PATH,
} from "../src/lib/wa-cloud.ts";
import { buildWelcomeMessage, sendWelcomeMessage } from "../src/lib/welcome-message.ts";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

interface Call {
  url: string;
  init: RequestInit;
  body: any;
}

const calls: Call[] = [];
let mode: "ok" | "500" | "131047" = "ok";
/** With mode=131047: does the template retry succeed after the text is rejected? */
let templateAccepts = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = String(input);
  const body = init.body ? JSON.parse(String(init.body)) : null;
  calls.push({ url, init, body });
  if (mode === "500") {
    return { ok: false, status: 500, json: async () => ({ error: { code: 1, message: "boom" } }) } as any;
  }
  if (mode === "131047") {
    if (body?.type === "template" && templateAccepts) {
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.TPL" }] }) } as any;
    }
    return {
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 131047, message: "Re-engagement message" } }),
    } as any;
  }
  return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.TEST" }] }) } as any;
}) as typeof fetch;

function resetCalls() {
  calls.length = 0;
}

function setCloudEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_CLOUD_ACCESS_TOKEN: "test-token",
    WHATSAPP_CLOUD_API_VERSION: "v21.0",
    WHATSAPP_CLOUD_GRAPH_URL: "http://127.0.0.1:59998",
    WHATSAPP_CLOUD_WELCOME_TEMPLATE: undefined,
    WHATSAPP_CLOUD_WELCOME_TEMPLATE_LANG: undefined,
    WHATSAPP_CLOUD_WELCOME_TEMPLATE_PARAMS: undefined,
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function run() {
  // ── 1. binding guards ─────────────────────────────────────────────────────
  setCloudEnv({ WHATSAPP_CLOUD_ACCESS_TOKEN: undefined });
  assert.equal(readCloudConfig(), null, "missing token must not read as configured");
  setCloudEnv({ WHATSAPP_CLOUD_PHONE_NUMBER_ID: undefined });
  assert.equal(readCloudConfig(), null, "missing phone-number-id must not read as configured");
  setCloudEnv({ WHATSAPP_CLOUD_PHONE_NUMBER_ID: "  ", WHATSAPP_CLOUD_ACCESS_TOKEN: "x" });
  assert.equal(readCloudConfig(), null, "whitespace-only phone-number-id rejected");

  // ── 2. official number + link come from one place ─────────────────────────
  assert.match(OFFICIAL_WA_NUMBER, /^62\d+$/, "official number must be an MSISDN, not a JID");
  assert.equal(NINA_WA_LINK, `https://wa.me/${OFFICIAL_WA_NUMBER}`);
  assert.equal(NINA_WA_LINK, "https://wa.me/6285165581209");
  assert.equal(POST_PAYMENT_PATH, "/pembayaran/sukses");

  // ── 3. no binding ⇒ fail closed, zero calls, no fallback channel ──────────
  setCloudEnv({ WHATSAPP_CLOUD_ACCESS_TOKEN: undefined });
  process.env.WHATSAPP_BRIDGE_URL = "http://127.0.0.1:59997";
  resetCalls();
  const unconfigured = await sendWelcomeMessage("6281299900001", buildWelcomeMessage("Budi", null));
  assert.equal(unconfigured.sent, false);
  assert.equal(unconfigured.reason, "cloud_not_configured");
  assert.equal(calls.length, 0, `no channel may be called while Cloud is unconfigured (got ${calls.length})`);

  // ── 4. happy path: exactly one Graph call, to the official phone-number-id ─
  setCloudEnv();
  resetCalls();
  mode = "ok";
  const sent = await sendWelcomeMessage(
    "081299900002",
    buildWelcomeMessage("Budi", { programFocus: ["Workout & Strength"] }),
    "Budi"
  );
  assert.equal(sent.sent, true);
  assert.equal(sent.messageId, "wamid.TEST");
  assert.equal(calls.length, 1, `expected exactly 1 outbound call, got ${calls.length}`);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:59998/v21.0/1234567890/messages",
    `Graph URL must carry the configured phone-number-id (got ${calls[0].url})`
  );
  assert.equal(calls[0].body.messaging_product, "whatsapp");
  assert.equal(calls[0].body.type, "text");
  assert.equal(calls[0].body.to, "6281299900002", "recipient normalised to MSISDN, not a JID");
  assert.ok(!/@s\.whatsapp\.net/.test(JSON.stringify(calls[0])));
  assert.ok(
    calls[0].body.text.body.includes("Halo Budi!"),
    "greeting copy still delivered"
  );
  assert.ok(
    !calls.every((c) => c.url.includes("127.0.0.1:59997")),
    "the legacy bridge must never be called"
  );
  assert.equal(
    calls.filter((c) => c.url.includes("127.0.0.1:59997")).length,
    0,
    "zero Baileys/bridge calls even with WHATSAPP_BRIDGE_URL still set"
  );

  // ── 5. no template ⇒ text attempt; a sync 131047 is recorded as a failure ──
  setCloudEnv();
  resetCalls();
  mode = "131047";
  const noTemplate = await sendWelcomeMessage("6281299900003", buildWelcomeMessage("Sari", null), "Sari");
  assert.equal(noTemplate.sent, false);
  assert.equal(noTemplate.reason, "template_not_configured");
  assert.equal(calls.length, 1, "no retry through any other channel");
  assert.equal(calls[0].body.type, "text");

  // ── 5b. no template, text accepted ⇒ sent but NOT verified ────────────────
  // A brand-new buyer has no 24h window, so Meta accepting a free-form text is
  // not proof of delivery (t_b8e96a91). The caller must see that difference.
  setCloudEnv();
  resetCalls();
  mode = "ok";
  const textOnly = await sendWelcomeMessage("6281299900010", buildWelcomeMessage("Sari", null), "Sari");
  assert.equal(textOnly.sent, true);
  assert.equal(textOnly.via, "text");
  assert.equal(textOnly.verified, false, "free-form text without a template must not count as verified");

  // ── 6. template configured ⇒ TEMPLATE FIRST (first touch = closed window) ──
  setCloudEnv({
    WHATSAPP_CLOUD_WELCOME_TEMPLATE: "welcome_thrivin",
    WHATSAPP_CLOUD_WELCOME_TEMPLATE_LANG: "id",
    WHATSAPP_CLOUD_WELCOME_TEMPLATE_PARAMS: "1",
  });
  resetCalls();
  mode = "ok";
  const templated = await sendWelcomeMessage(
    "6281299900004",
    buildWelcomeMessage("Sari", null),
    "Sari",
    "Selamat datang di Thrivin!"
  );
  assert.equal(calls.length, 1, `expected exactly 1 call, got ${calls.length}`);
  assert.equal(
    calls[0].body.type,
    "template",
    "a first-time recipient can only be reached with an approved template — text must not be tried first"
  );
  assert.equal(calls[0].body.template.name, "welcome_thrivin");
  assert.equal(calls[0].body.template.language.code, "id");
  assert.deepEqual(calls[0].body.template.components[0].parameters, [{ type: "text", text: "Sari" }]);
  assert.equal(templated.sent, true);
  assert.equal(templated.via, "template");
  assert.equal(templated.verified, true, "template acceptance is the only verified first-touch path");

  // ── 6b. template fails ⇒ one text fallback, reported unverified ───────────
  resetCalls();
  mode = "500";
  const tplFails = await sendWelcomeMessage("6281299900011", buildWelcomeMessage("Sari", null), "Sari");
  assert.equal(calls.length, 2, `expected template then text, got ${calls.length}`);
  assert.equal(calls[0].body.type, "template");
  assert.equal(calls[1].body.type, "text");
  assert.equal(tplFails.sent, false);
  assert.equal(tplFails.reason, "graph_http_500");

  // ── 6c. two-parameter template carries name + context ─────────────────────
  setCloudEnv({
    WHATSAPP_CLOUD_WELCOME_TEMPLATE: "nina_p2_checkin",
    WHATSAPP_CLOUD_WELCOME_TEMPLATE_LANG: "id",
    WHATSAPP_CLOUD_WELCOME_TEMPLATE_PARAMS: "2",
  });
  resetCalls();
  mode = "ok";
  await sendWelcomeMessage(
    "6281299900012",
    buildWelcomeMessage("Rani", null),
    "Rani",
    "Selamat datang di Thrivin! Profil kamu udah aku catat ya."
  );
  assert.deepEqual(calls[0].body.template.components[0].parameters, [
    { type: "text", text: "Rani" },
    { type: "text", text: "Selamat datang di Thrivin! Profil kamu udah aku catat ya." },
  ]);
  // no context supplied ⇒ the {{2}} hole is still filled, never empty
  resetCalls();
  await sendWelcomeMessage("6281299900013", buildWelcomeMessage("Rani", null), "Rani");
  assert.equal(String(calls[0].body.template.components[0].parameters[1].text).length > 0, true);

  // ── 7. template accepted ⇒ single call, verified ──────────────────────────
  setCloudEnv({
    WHATSAPP_CLOUD_WELCOME_TEMPLATE: "welcome_thrivin",
    WHATSAPP_CLOUD_WELCOME_TEMPLATE_PARAMS: "1",
  });
  resetCalls();
  templateAccepts = true;
  mode = "ok";
  const viaTemplate = await sendWelcomeMessage(
    "6281299900005",
    buildWelcomeMessage("Rani", null),
    "Rani"
  );
  assert.equal(viaTemplate.sent, true);
  assert.equal(viaTemplate.via, "template");
  assert.equal(viaTemplate.verified, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[1]?.body.type, undefined, "no second call after a successful template");
  templateAccepts = false;

  // ── 8. other Graph errors do not retry elsewhere ──────────────────────────
  setCloudEnv();
  resetCalls();
  mode = "500";
  const failed = await sendWelcomeMessage("6281299900006", buildWelcomeMessage("Tono", null), "Tono");
  assert.equal(failed.sent, false);
  assert.equal(failed.reason, "graph_http_500");
  assert.equal(calls.length, 1, "a 500 must not trigger a second channel");

  // ── 9. invalid phone ⇒ no call at all ─────────────────────────────────────
  resetCalls();
  const badPhone = await sendWelcomeMessage("0812", buildWelcomeMessage("X", null));
  assert.equal(badPhone.sent, false);
  assert.equal(badPhone.reason, "invalid_phone");
  assert.equal(calls.length, 0);

  // ── 10. template config parsing ───────────────────────────────────────────
  setCloudEnv({ WHATSAPP_CLOUD_WELCOME_TEMPLATE: "  ", });
  assert.equal(readWelcomeTemplate(), null, "empty template name = not configured");
  setCloudEnv({ WHATSAPP_CLOUD_WELCOME_TEMPLATE: "tpl", WHATSAPP_CLOUD_WELCOME_TEMPLATE_PARAMS: "x" });
  assert.equal(readWelcomeTemplate()?.params, 0, "junk params count clamps to 0");
  setCloudEnv({ WHATSAPP_CLOUD_WELCOME_TEMPLATE: "tpl", WHATSAPP_CLOUD_WELCOME_TEMPLATE_PARAMS: "1" });
  assert.equal(readWelcomeTemplate()?.lang, "id", "default language is id");

  // ── 11. payload builders: phone-number-id lives in the URL, never the body ─
  setCloudEnv();
  resetCalls();
  await sendCloudText(readCloudConfig()!, "6281299900007", "halo");
  await sendCloudTemplate(
    readCloudConfig()!,
    "6281299900007",
    { name: "tpl", lang: "id", params: 0 },
    "Budi"
  );
  assert.equal(calls.length, 2);
  assert.ok(!("phone_number_id" in calls[0].body), "phone-number-id must not be sent in the body");
  assert.equal(calls[1].body.template.components, undefined, "no body params when template takes none");

  // ── 12. no Baileys leftovers on the purchase/postpaid path ────────────────
  const guarded = [
    "src/lib/welcome-message.ts",
    "src/lib/wa-cloud.ts",
    "src/app/api/scalev/webhook/route.ts",
    "src/app/api/scalev/create-order/route.ts",
    "src/app/pembayaran/sukses/page.tsx",
  ];
  for (const rel of guarded) {
    const source = fs.readFileSync(path.join(REPO, rel), "utf-8");
    assert.ok(!source.includes("WHATSAPP_BRIDGE_URL"), `${rel} must not read the bridge URL`);
    assert.ok(!source.includes("s.whatsapp.net"), `${rel} must not build Baileys JIDs`);
  }
  const libSource = fs.readFileSync(path.join(REPO, "src/lib/welcome-message.ts"), "utf-8");
  assert.ok(!/\/send["'`]/.test(libSource), "welcome-message must not POST to the bridge /send");

  console.log("ALL WA-CLOUD UNIT CHECKS PASSED");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
