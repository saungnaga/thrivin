/**
 * Unit checks for greeting wamid correlation (kartu t_22ccd958).
 *
 *   node --experimental-strip-types tests/test-greeting-status-units.mts
 *
 * No network, no DB: `fetch` is a recorder, so the assertions are on the exact
 * request the store would send. The e2e proof (real HTTP + real Postgres) lives
 * in tests/test-postpay-e2e.mts §4d.
 */
import assert from "node:assert/strict";
import { greetingStatusFromReceipt } from "../src/lib/wa-cloud.ts";
import { recordGreetingStatus, recordGreetingDelivery } from "../src/lib/onboarding-store.ts";

interface Call {
  url: string;
  init: RequestInit;
  body: any;
}

const calls: Call[] = [];
/** Rows PostgREST returns for a PATCH ... return=representation. */
let patchRows: any[] = [];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: any, init: any = {}) => {
  calls.push({
    url: String(input),
    init,
    body: init.body ? JSON.parse(String(init.body)) : null,
  });
  return {
    ok: true,
    status: 200,
    json: async () => patchRows,
    text: async () => "",
  } as any;
}) as typeof fetch;

function reset() {
  calls.length = 0;
  patchRows = [];
}

async function run() {
  process.env.SUPABASE_URL = "http://127.0.0.1:59997";
  process.env.SUPABASE_SERVICE_KEY = "test-service-key";

  // ── 1. Meta receipt → stored status ──────────────────────────────────────
  assert.equal(greetingStatusFromReceipt("delivered"), "delivered");
  assert.equal(greetingStatusFromReceipt("read"), "delivered", "read implies delivered");
  assert.equal(greetingStatusFromReceipt("DELIVERED"), "delivered", "case-insensitive");
  assert.equal(
    greetingStatusFromReceipt("failed", [{ code: 131026 }]),
    "failed:131026",
    "Meta error code is kept — 131026 = message undeliverable"
  );
  assert.equal(
    greetingStatusFromReceipt("failed", [{ code: "131047" }]),
    "failed:131047",
    "string codes survive as-is"
  );
  assert.equal(greetingStatusFromReceipt("failed"), "failed", "no code still records the failure");
  assert.equal(greetingStatusFromReceipt("failed", []), "failed");
  assert.equal(
    greetingStatusFromReceipt("sent"),
    null,
    "`sent` is not delivery evidence — it must NOT overwrite the row"
  );
  assert.equal(greetingStatusFromReceipt("deleted"), null);
  assert.equal(greetingStatusFromReceipt(""), null);
  assert.equal(greetingStatusFromReceipt(undefined), null);

  // ── 2. send path stores the wamid as a SECOND best-effort PATCH ──────────
  // Two PATCHes on purpose: deploying before the DDL must still record the
  // status (a single PATCH would 400 on the missing column and lose both).
  reset();
  await recordGreetingStatus("250130UNIT01", "sent", "wamid.UNIT1");
  assert.equal(calls.length, 2, `expected status PATCH + wamid PATCH, got ${calls.length}`);
  assert.equal(calls[0]?.init.method, "PATCH");
  assert.match(calls[0]?.url || "", /onboarding_snapshots\?tenant_id=eq\.thrivin&order_id=eq\.250130UNIT01$/);
  assert.equal(calls[0]?.body?.first_greeting_status, "sent");
  assert.equal(
    "first_greeting_wamid" in (calls[0]?.body || {}),
    false,
    "the status PATCH must not depend on the new column existing"
  );
  assert.equal(calls[1]?.body?.first_greeting_wamid, "wamid.UNIT1");

  reset();
  await recordGreetingStatus("250130UNIT02", "sent_unverified");
  assert.equal(calls.length, 1, "no wamid → no second PATCH");
  assert.equal(calls[0]?.body?.first_greeting_status, "sent_unverified");

  // ── 3. receipt applies to the row matched by wamid ───────────────────────
  reset();
  patchRows = [{ order_id: "250130UNIT01", first_greeting_status: "delivered" }];
  const applied = await recordGreetingDelivery("wamid.UNIT1", "delivered");
  assert.equal(applied, true, "matched row reported as updated");
  assert.equal(calls.length, 1);
  assert.match(
    calls[0]?.url || "",
    /first_greeting_wamid=eq\.wamid\.UNIT1$/,
    "update is scoped by wamid, never by order id"
  );
  assert.equal(calls[0]?.body?.first_greeting_status, "delivered");
  assert.equal(calls[0]?.init.headers && (calls[0].init.headers as any).Prefer, "return=representation");

  // ── 4. out-of-order failure must not erase delivery proof ────────────────
  reset();
  patchRows = [];
  const downgraded = await recordGreetingDelivery("wamid.UNIT1", "failed:131026");
  assert.equal(downgraded, false, "delivered row is not downgraded by a late failure");
  assert.match(
    calls[0]?.url || "",
    /first_greeting_status=neq\.delivered/,
    "downgrade guard is applied in the query, not in app logic"
  );

  // ── 5. NEGATIVE PROOF: no stored wamid → nothing is touched ──────────────
  reset();
  const noWamid = await recordGreetingDelivery("", "delivered");
  assert.equal(noWamid, false, "empty wamid never matches");
  assert.equal(calls.length, 0, "empty wamid must not even hit the DB");

  reset();
  patchRows = [];
  const unknown = await recordGreetingDelivery("wamid.NOT-OURS", "delivered");
  assert.equal(unknown, false, "receipt for a message we never stored updates nothing");
  assert.equal(calls.length, 1, "the lookup happened…");
  assert.equal(patchRows.length, 0, "…and PostgREST matched zero rows");

  console.log("PASS greeting-status units: 24 checks");
}

run().catch((err) => {
  globalThis.fetch = realFetch;
  console.error("FAIL greeting-status units:", err);
  process.exit(1);
});
