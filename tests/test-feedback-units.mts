/**
 * Unit + static checks for the kritik/saran feature (A8).
 *
 *   node --experimental-strip-types tests/test-feedback-units.mts
 *
 * Part 1 exercises the pure server-side input boundary (src/lib/feedback.ts).
 * Part 2 reads the shipped source and asserts the properties that cannot be
 * observed from a request: no service key can reach the browser bundle, no raw
 * HTML sink exists, and the thank-you screen never interpolates user text.
 */
import fs from "fs";
import path from "path";
import {
  FEEDBACK_MAX_CHARS,
  FEEDBACK_MIN_CHARS,
  FEEDBACK_REQUEST_TOKEN_PATTERN,
  messageLength,
  sanitizeMessageText,
  validateFeedbackPayload,
} from "../src/lib/feedback.ts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

let pass = 0;
const failures: string[] = [];
function check(ok: boolean, name: string, detail = "") {
  if (ok) {
    pass += 1;
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
  }
}
function eq(actual: unknown, expected: unknown, name: string) {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    name,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

const TOKEN = "0123456789abcdef0123456789abcdef";

// ── Part 1: input boundary ────────────────────────────────────────────────────
console.log("── sanitize ──");
eq(sanitizeMessageText("  halo  "), "halo", "trim outer whitespace");
eq(sanitizeMessageText("a\r\nb\rc"), "a\nb\nc", "CRLF/CR normalised to LF");
eq(sanitizeMessageText("a\u0000b\u0007c"), "abc", "NUL + BEL stripped");
eq(sanitizeMessageText("baris1\nbaris2\ttab"), "baris1\nbaris2\ttab", "LF and TAB kept");
eq(sanitizeMessageText("<script>alert(1)</script>"), "<script>alert(1)</script>", "markup stored as text");
eq(sanitizeMessageText(null), "", "null -> empty string");

console.log("── validate: message bounds ──");
eq(validateFeedbackPayload({ message: "a".repeat(9), request_token: TOKEN }), { ok: false, code: "invalid_message" }, "9 chars rejected");
eq(validateFeedbackPayload({ message: "a".repeat(FEEDBACK_MIN_CHARS), request_token: TOKEN }).ok, true, "10 chars accepted (edge)");
const maxOk = validateFeedbackPayload({ message: "a".repeat(FEEDBACK_MAX_CHARS), request_token: TOKEN });
eq(maxOk.ok, true, `${FEEDBACK_MAX_CHARS} chars accepted (edge)`);
eq(validateFeedbackPayload({ message: "a".repeat(FEEDBACK_MAX_CHARS + 1), request_token: TOKEN }).ok, false, `${FEEDBACK_MAX_CHARS + 1} chars rejected`);
eq(validateFeedbackPayload({ message: "   ", request_token: TOKEN }), { ok: false, code: "invalid_message" }, "whitespace-only rejected after trim");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: TOKEN, extra: "ignored" }).ok, true, "unknown fields ignored");

console.log("── validate: token ──");
eq(validateFeedbackPayload({ message: "ok panjang cukup" }), { ok: false, code: "invalid_token" }, "missing token rejected");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: "short" }), { ok: false, code: "invalid_token" }, "short token rejected");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: "x".repeat(65) }), { ok: false, code: "invalid_token" }, "over-long token rejected");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: "has space here 16" }), { ok: false, code: "invalid_token" }, "token with space rejected");
check(FEEDBACK_REQUEST_TOKEN_PATTERN.test("0123456789abcdef"), "32-hex token matches pattern");

console.log("── validate: optional contact ──");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: TOKEN }).value?.phone, null, "absent contact -> null");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: TOKEN, contact: "" }).value?.phone, null, "empty contact -> null");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: TOKEN, contact: "081234567890" }).value?.phone, "6281234567890", "local 08… normalised to 62…");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: TOKEN, contact: "+62 812-3456-7890" }).value?.phone, "6281234567890", "punctuation/formatted input normalised");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: TOKEN, contact: "halo" }), { ok: false, code: "invalid_phone" }, "garbage contact rejected (not silently dropped)");
eq(validateFeedbackPayload({ message: "ok panjang cukup", request_token: TOKEN, contact: "123" }), { ok: false, code: "invalid_phone" }, "too-short contact rejected");

console.log("── validate: body shape ──");
eq(validateFeedbackPayload(null), { ok: false, code: "invalid_body" }, "null body rejected");
eq(validateFeedbackPayload("message=hi"), { ok: false, code: "invalid_body" }, "string body rejected");
eq(validateFeedbackPayload([]).ok, false, "array body rejected");

console.log("── F-4: characters, not UTF-16 units ──");
eq(messageLength("😀"), 1, "an emoji is ONE character (JS .length says 2)");
eq(messageLength("😀".repeat(10)), 10, "10 emoji are 10 characters");
eq(
  validateFeedbackPayload({ message: "😀".repeat(5), request_token: TOKEN }),
  { ok: false, code: "invalid_message" },
  "5 emoji (JS length 10) rejected as too short, like char_length would"
);
eq(
  validateFeedbackPayload({ message: "😀".repeat(10), request_token: TOKEN }).ok,
  true,
  "10 emoji accepted (the DB CHECK counts 10 characters)"
);
eq(
  validateFeedbackPayload({ message: "a".repeat(FEEDBACK_MAX_CHARS - 1) + "😀", request_token: TOKEN }).ok,
  true,
  `a ${FEEDBACK_MAX_CHARS}-character message ending in an emoji is accepted`
);
eq(
  sanitizeMessageText(`abcdefghij${String.fromCharCode(0xd800)}`),
  "abcdefghij",
  "F-4 class: unpaired high surrogate stripped (not valid UTF-8, would 503 at the DB)"
);
eq(
  sanitizeMessageText(`a${String.fromCharCode(0xdc00)}bcdefghij`),
  "abcdefghij",
  "unpaired low surrogate stripped"
);
eq(sanitizeMessageText("😀"), "😀", "a paired surrogate (real emoji) survives");

console.log("── F-5: duplicate token with different text is a conflict ──");
const emojiStored = validateFeedbackPayload({ message: "😀".repeat(10), request_token: TOKEN });
check(
  emojiStored.ok && emojiStored.value.messageText === "😀".repeat(10),
  "the stored text is the sanitized text (what the duplicate check compares)"
);

// ── Part 2: shipped-source properties ────────────────────────────────────────
console.log("── static: client bundle must not carry the service key ──");
const formSrc = fs.readFileSync(path.join(REPO, "src/app/companion/nina/kritiksaran/FeedbackForm.tsx"), "utf-8");
const pageSrc = fs.readFileSync(path.join(REPO, "src/app/companion/nina/kritiksaran/page.tsx"), "utf-8");
const routeSrc = fs.readFileSync(path.join(REPO, "src/app/api/feedback/route.ts"), "utf-8");
const libSrc = fs.readFileSync(path.join(REPO, "src/lib/feedback.ts"), "utf-8");

for (const [name, src] of [
  ["FeedbackForm.tsx", formSrc],
  ["kritiksaran/page.tsx", pageSrc],
] as Array<[string, string]>) {
  check(!/SERVICE_ROLE|SERVICE_KEY|SUPABASE_SERVICE/.test(src), `${name}: no service-role reference`);
  check(!/from ["']@\/lib\/(feedback|onboarding-store)/.test(src), `${name}: cannot import server store`);
  check(!/NEXT_PUBLIC_SUPABASE/.test(src), `${name}: no client DB config`);
}
check(/^"use client";/.test(formSrc), "FeedbackForm.tsx is the only client component");
check(!/^"use client";/.test(pageSrc), "page.tsx stays a server component (metadata/noindex)");
check(!/^"use client";/.test(routeSrc), "route.ts is server-side");
check(!/"use client"/.test(libSrc), "src/lib/feedback.ts is server-side only");

console.log("── static: XSS-safe rendering + no HTML sink ──");
for (const [name, src] of [
  ["FeedbackForm.tsx", formSrc],
  ["kritiksaran/page.tsx", pageSrc],
] as Array<[string, string]>) {
  check(!/dangerouslySetInnerHTML|\.innerHTML|document\.write/.test(src), `${name}: no raw HTML sink`);
}
// `{message}` must appear at most once — as the textarea's controlled value.
check(
  (formSrc.match(/\{message\}/g) || []).length === 1,
  "submitted message is never rendered as a child node",
  `found ${(formSrc.match(/\{message\}/g) || []).length} occurrences`
);

console.log("── static: accessibility (keyboard + mobile) ──");
check(/htmlFor="message"/.test(formSrc) && /id="message"/.test(formSrc), "textarea has a real <label>");
check(/htmlFor="contact"/.test(formSrc) && /id="contact"/.test(formSrc), "contact input has a real <label>");
check(/aria-describedby="message-help message-count"/.test(formSrc), "textarea described by help + counter");
check(/type="submit"/.test(formSrc), "submit button is type=submit (Enter works)");
check(/role="alert"/.test(formSrc), "errors announced via role=alert");
check(/aria-live="polite"/.test(formSrc), "char counter announced politely");
check(/inputMode="tel"/.test(formSrc) && /autoComplete="tel"/.test(formSrc), "tel input mobile-friendly");
check(/tabIndex=\{-1\}/.test(formSrc), "success heading is programmatically focusable");
check(/focus-visible:ring/.test(formSrc), "visible keyboard focus ring");
check(/maxLength=\{MAX_CHARS\}/.test(formSrc) && /minLength=\{MIN_CHARS\}/.test(formSrc), "client mirrors server bounds");
check(/disabled=\{state === "sending"\}/.test(formSrc), "double-submit blocked while in flight");

console.log("── static: route surface ──");
check(/export async function POST/.test(routeSrc), "route exposes POST");
check(/export function GET/.test(routeSrc) && /status: 405/.test(routeSrc), "GET answers 405 (no list exposure)");
check(!/export (async )?function (PUT|PATCH|DELETE)/.test(routeSrc), "no PUT/PATCH/DELETE handlers");
check(/NextResponse\.json\(\{ ok: true \}, \{ status: 201 \}\)/.test(routeSrc), "success body carries no submitted content");
check(/status: 503/.test(routeSrc), "store failure answers 503, not success");
check(/insertFeedbackOnce/.test(routeSrc), "route writes through the durable helper");
check(/redactError\(err\)/.test(routeSrc), "failures logged through the PII redactor");
check(!/console\.(log|error)\([^)]*phone/.test(routeSrc), "no phone in logs");
check(!/console\.(log|error)\([^)]*requestToken/.test(routeSrc), "no request token in logs");

console.log("── static: W5-RX fixes cannot silently regress ──");
check(/readBoundedBody\(req\)/.test(routeSrc), "F-1: route bounds the body through the helper");
check(!/await req\.text\(\)/.test(routeSrc), "F-1: route never reads the body unbounded");
check(/content-length/i.test(libSrc) && /getReader\(\)/.test(libSrc), "F-1: helper checks the declared length and streams with a ceiling");
check(!/await res\.text\(\)/.test(libSrc), "F-3: upstream PostgREST body never becomes an error string");
check(!/errText/.test(libSrc), "F-3: no captured upstream text to log");
check(/status=\$\{res\.status\}/.test(libSrc), "F-3: failures log status only");
check(!/messageText\.length|body\.message\.length/.test(libSrc), "F-4: no UTF-16 length check left");
check(/\[\.\.\.s\]\.length/.test(libSrc), "F-4: server counts code points");
check(/\[\.\.\.message\]\.length/.test(formSrc), "F-4: the UI counter counts code points too");
check(/result\.textMatches/.test(routeSrc) && /status: 409/.test(routeSrc), "F-5: duplicate token with different text answers 409");
check(/message_text/.test(libSrc) && /textMatches/.test(libSrc), "F-5: the stored text is read back and compared");

console.log("── static: draft SQL shape ──");
const sqlSrc = fs.readFileSync(path.join(REPO, "staging/schema-feedback-kritiksaran.sql"), "utf-8");
check(/CREATE TABLE IF NOT EXISTS feedback/i.test(sqlSrc), "draft creates the feedback table");
check(/UNIQUE INDEX IF NOT EXISTS uq_feedback_tenant_request_token/.test(sqlSrc), "idempotency arbiter index present");
check(/ENABLE ROW LEVEL SECURITY/.test(sqlSrc) && /FORCE ROW LEVEL SECURITY/.test(sqlSrc), "RLS enabled + forced");
check(/REVOKE ALL ON TABLE public\.feedback FROM PUBLIC, anon, authenticated/.test(sqlSrc), "client roles revoked explicitly");
check(/GRANT SELECT, INSERT ON TABLE public\.feedback TO service_role/.test(sqlSrc), "service_role limited to SELECT+INSERT");

// ── report ───────────────────────────────────────────────────────────────────
console.log("");
if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${pass + failures.length} checks:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`PASSED ${pass}/${pass} feedback unit + static checks`);
