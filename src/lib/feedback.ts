/**
 * Feedback (kritik & saran) — server-side input boundary + durable, idempotent write.
 *
 * Contract: batch-2026-10-15/s0-security/integration-contract.md §6.
 * Storage:  staging/schema-feedback-kritiksaran.sql (DRAFT, belum di-apply).
 *
 * Rules enforced here (not in the UI):
 *   - bounded text, control characters stripped, stored as TEXT (never HTML);
 *   - contact is OPTIONAL and explicitly NOT verified (no session module in this base);
 *   - insert is idempotent on (tenant_id, request_token) and READ BACK, so a success
 *     answer can never be returned without a committed row;
 *   - no logger ever sees the phone number or the request token.
 *
 * ponytail: no disk fallback — a fake local "success" would be a false thank-you.
 */
import { normalizePhone } from "./phone.ts";
import { TENANT_ID, ConfigError, getSupabaseConfig, redactError } from "./onboarding-store.ts";

export const FEEDBACK_MIN_CHARS = 10;
export const FEEDBACK_MAX_CHARS = 2000;
/** Raw body ceiling, checked before JSON.parse. */
export const FEEDBACK_MAX_BODY_BYTES = 8 * 1024;
export const FEEDBACK_REQUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export type FeedbackReject =
  | "invalid_body"
  | "invalid_message"
  | "invalid_token"
  | "invalid_phone";

export interface FeedbackInput {
  messageText: string;
  phone: string | null;
  requestToken: string;
}

/**
 * Store as plain text: drop C0/C1 control characters (newline and tab kept),
 * normalise CRLF, trim. Nothing here interprets markup — rendering escapes.
 */
export function sanitizeMessageText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .trim();
}

export function validateFeedbackPayload(
  body: unknown
): { ok: true; value: FeedbackInput } | { ok: false; code: FeedbackReject } {
  if (typeof body !== "object" || body === null) return { ok: false, code: "invalid_body" };
  const raw = body as Record<string, unknown>;

  const messageText = sanitizeMessageText(raw.message);
  if (messageText.length < FEEDBACK_MIN_CHARS || messageText.length > FEEDBACK_MAX_CHARS) {
    return { ok: false, code: "invalid_message" };
  }

  const requestToken = String(raw.request_token ?? "");
  if (!FEEDBACK_REQUEST_TOKEN_PATTERN.test(requestToken)) {
    return { ok: false, code: "invalid_token" };
  }

  // Optional contact. Empty = absent; anything typed must be a valid ID mobile —
  // a typo is rejected, never silently dropped or substituted.
  let phone: string | null = null;
  const rawPhone = String(raw.contact ?? "").trim();
  if (rawPhone) {
    phone = normalizePhone(rawPhone);
    if (!phone) return { ok: false, code: "invalid_phone" };
  }

  return { ok: true, value: { messageText, phone, requestToken } };
}

export interface FeedbackWriteResult {
  persisted: boolean;
  /** True when this call lost the idempotency race — the earlier row is the stored one. */
  duplicate: boolean;
  id?: string;
}

function serviceHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Idempotency is claimed by the INSERT itself against
 * `uq_feedback_tenant_request_token`, exactly like the webhook inbox.
 *
 * `resolution=ignore-duplicates` returns the row only to the insert that won, so a
 * retry (double tap, network timeout, proxy resend) must be CONFIRMED with a read
 * before we report success. An empty answer that cannot be confirmed throws — the
 * route turns that into a generic error, never into a thank-you.
 */
export async function insertFeedbackOnce(input: FeedbackInput): Promise<FeedbackWriteResult> {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new ConfigError(
      "[Feedback] Supabase is not configured; refusing to accept feedback that cannot be stored."
    );
  }

  const res = await fetch(`${url}/rest/v1/feedback?on_conflict=tenant_id,request_token`, {
    method: "POST",
    headers: {
      ...serviceHeaders(key),
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify({
      tenant_id: TENANT_ID,
      phone: input.phone,
      message_text: input.messageText,
      request_token: input.requestToken,
    }),
  });

  if (!res.ok && res.status !== 409) {
    const errText = await res.text();
    throw new Error(`[Feedback] insert failed: ${res.status} ${redactError(errText)}`);
  }

  if (res.status !== 409) {
    const rows = await res.json().catch(() => null);
    if (Array.isArray(rows) && rows.length > 0) {
      return { persisted: true, duplicate: false, id: rows[0]?.id };
    }
  }

  // Lost the race (or an outright conflict): the row must already exist. Confirm it.
  const readback = await fetch(
    `${url}/rest/v1/feedback?tenant_id=eq.${encodeURIComponent(TENANT_ID)}` +
      `&request_token=eq.${encodeURIComponent(input.requestToken)}&select=id&limit=1`,
    { headers: { ...serviceHeaders(key), Accept: "application/json" } }
  );
  if (!readback.ok) {
    throw new Error(`[Feedback] read-back failed: ${readback.status}`);
  }
  const existing = await readback.json().catch(() => null);
  if (Array.isArray(existing) && existing.length > 0) {
    return { persisted: true, duplicate: true, id: existing[0]?.id };
  }
  throw new Error("[Feedback] insert left no committed row — refusing to report success");
}
