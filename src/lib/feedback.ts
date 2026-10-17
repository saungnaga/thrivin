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
import { TENANT_ID, ConfigError, getSupabaseConfig } from "./onboarding-store.ts";

export const FEEDBACK_MIN_CHARS = 10;
export const FEEDBACK_MAX_CHARS = 2000;
/** Raw body ceiling. Enforced on the declared length first, then on the stream. */
export const FEEDBACK_MAX_BODY_BYTES = 8 * 1024;
export const FEEDBACK_REQUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Character count the way Postgres `char_length` counts it (code points), NOT the
 * way JS `String.length` counts it (UTF-16 units). `"😀"` is 1 here and 2 there, so
 * measuring with `.length` let a 5-emoji message pass the route bound and then blow
 * up on the DB CHECK — a 503 for a payload that could never be stored (F-4).
 */
export function messageLength(s: string): number {
  return [...s].length;
}

/**
 * Read the request body without ever buffering more than `maxBytes` (F-1).
 *
 * A declared `Content-Length` over the ceiling is refused before the body is
 * touched at all — the caller can answer 413 while the client is still sending. A
 * body without a usable length (chunked) is streamed and abandoned the moment it
 * crosses the ceiling, so an anonymous POST cannot make the process allocate an
 * unbounded buffer. Next 15 route handlers have no body limit of their own.
 */
export async function readBoundedBody(
  req: Request,
  maxBytes: number = FEEDBACK_MAX_BODY_BYTES
): Promise<{ ok: true; text: string } | { ok: false }> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return { ok: false };
  }

  const stream = req.body;
  if (!stream) return { ok: true, text: "" };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { ok: true, text: Buffer.concat(chunks, size).toString("utf-8") };
}

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
 * normalise CRLF, strip unpaired surrogates, trim. Nothing here interprets markup —
 * rendering escapes.
 *
 * Unpaired surrogates are removed because they are not valid UTF-8: they travel as
 * `\udXXX` in JSON and Postgres refuses the row, which surfaced as a 503 for a text
 * the user could never fix (same class as F-4).
 */
export function sanitizeMessageText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .trim();
}

export function validateFeedbackPayload(
  body: unknown
): { ok: true; value: FeedbackInput } | { ok: false; code: FeedbackReject } {
  if (typeof body !== "object" || body === null) return { ok: false, code: "invalid_body" };
  const raw = body as Record<string, unknown>;

  const messageText = sanitizeMessageText(raw.message);
  const chars = messageLength(messageText);
  if (chars < FEEDBACK_MIN_CHARS || chars > FEEDBACK_MAX_CHARS) {
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
  /**
   * Only meaningful when `duplicate`: does the stored row hold the SAME text?
   * `false` means the caller reused a request token for a different message — the
   * new text was NOT stored and must not be answered with a thank-you (F-5).
   */
  textMatches?: boolean;
  id?: string;
}

/**
 * Build the only loggable form of an upstream failure.
 *
 * PostgREST puts the offending row in `details` on a constraint violation, i.e. the
 * user's text and the request token land in whatever string we keep (F-3). Keep the
 * transport status and the machine code — nothing else — and never read the body
 * into a string again. (`message` is not kept either: Postgres quotes the bad value
 * in some of them.)
 */
async function upstreamError(res: Response, what: string): Promise<Error> {
  let suffix = "";
  const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
  if (body && typeof body.code === "string" && /^[A-Za-z0-9_]{1,16}$/.test(body.code)) {
    suffix = ` code=${body.code}`;
  }
  return new Error(`[Feedback] ${what} failed: status=${res.status}${suffix}`);
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
    throw await upstreamError(res, "insert");
  }

  if (res.status !== 409) {
    const rows = await res.json().catch(() => null);
    if (Array.isArray(rows) && rows.length > 0) {
      return { persisted: true, duplicate: false, id: rows[0]?.id };
    }
  }

  // Lost the race (or an outright conflict): the row must already exist. Confirm it,
  // and compare the stored text: a token that comes back with a DIFFERENT message
  // means the user edited their draft after a lost response. Answering 201 there
  // would throw the edit away behind a thank-you (F-5).
  const readback = await fetch(
    `${url}/rest/v1/feedback?tenant_id=eq.${encodeURIComponent(TENANT_ID)}` +
      `&request_token=eq.${encodeURIComponent(input.requestToken)}&select=id,message_text&limit=1`,
    { headers: { ...serviceHeaders(key), Accept: "application/json" } }
  );
  if (!readback.ok) {
    throw await upstreamError(readback, "read-back");
  }
  const existing = (await readback.json().catch(() => null)) as
    | Array<{ id?: string; message_text?: string }>
    | null;
  if (Array.isArray(existing) && existing.length > 0) {
    return {
      persisted: true,
      duplicate: true,
      id: existing[0]?.id,
      textMatches: existing[0]?.message_text === input.messageText,
    };
  }
  throw new Error("[Feedback] insert left no committed row — refusing to report success");
}
