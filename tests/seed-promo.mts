/**
 * Seed helper for the promo end-to-end tests: inserts a promo straight into the
 * HTTP-facing PostgREST stand-in (service_role key), so the test exercises the
 * same path the dashboard route uses.
 *
 *   node --experimental-strip-types tests/seed-promo.mts \
 *     --code XXXX --type percentage --amount 20 [--quota 5] [--plans quarter]
 *     [--expires <iso>] [--inactive] [--print-active-expiry]
 */
import { SERVICE_KEY, POSTGREST_URL } from "./harness/stack.mts";

function arg(name: string, fallback = ""): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? fallback : process.argv[idx + 1] ?? "";
}

const code = arg("code").toUpperCase();
if (!code) throw new Error("--code is required");

const payload: Record<string, unknown> = {
  code,
  discount_type: arg("type", "percentage"),
  amount: Number(arg("amount", "20")),
  plan_keys: arg("plans") ? arg("plans").split(",") : [],
  max_redemptions: arg("quota") === "" ? null : Number(arg("quota")),
  expires_at: arg("expires") || null,
  is_active: process.argv.includes("--inactive") ? false : true,
  created_by: "e2e-seed",
};

const res = await fetch(
  `${POSTGREST_URL}/rest/v1/promo_codes?on_conflict=tenant_id,code`,
  {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  }
);
if (!res.ok) {
  console.error("seed failed", res.status, await res.text());
  process.exit(1);
}
console.log(JSON.stringify(await res.json()));