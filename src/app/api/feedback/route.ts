import { NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { redactError } from "@/lib/onboarding-store";
import {
  readBoundedBody,
  validateFeedbackPayload,
  insertFeedbackOnce,
  type FeedbackReject,
} from "@/lib/feedback";

/**
 * POST /api/feedback — kritik & saran (A8), kontrak §6.
 *
 * Deliberately POST-only: there is no read path, no list endpoint, and no way to
 * enumerate what other people wrote. The table is service-role only (RLS deny).
 *
 * The thank-you shown by the UI depends on the 201 from here, and this route only
 * answers 201 after `insertFeedbackOnce` has confirmed a committed row.
 */

// Anti-abuse ceiling. `limitRequest` is in-process per instance — honest ceiling,
// see rate-limit.ts. Tune with the funnel, not with the tests.
const IP_LIMIT = 15;
const CONTACT_LIMIT = 4;
const WINDOW_MS = 10 * 60_000;

/** Generic messages only — response bodies never echo submitted content. */
const REJECT_MESSAGE: Record<FeedbackReject, string> = {
  invalid_body: "Format permintaan tidak dikenali.",
  invalid_message: "Tulisan perlu 10–2000 karakter.",
  invalid_token: "Sesi pengiriman tidak valid. Muat ulang halaman ini.",
  invalid_phone: "Nomor WhatsApp tidak valid.",
};

export async function POST(req: Request) {
  try {
    // Browsers cannot send this cross-origin without a preflight, so a plain
    // drive-by <form> post from a third-party page is rejected here.
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { ok: false, error: "Content-Type harus application/json." },
        { status: 415 }
      );
    }

    // Bounded BEFORE the body is touched: a declared oversize is refused without
    // reading a byte, and a chunked body is abandoned at the ceiling (F-1). The
    // reverse proxy must cap this route too — see docs/reverse-proxy-body-limit.md.
    const raw = await readBoundedBody(req);
    if (!raw.ok) {
      return NextResponse.json({ ok: false, error: "Permintaan terlalu besar." }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw.text);
    } catch {
      return NextResponse.json({ ok: false, error: "Body JSON tidak valid." }, { status: 400 });
    }

    const parsed = validateFeedbackPayload(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: REJECT_MESSAGE[parsed.code], code: parsed.code.toUpperCase() },
        { status: 400 }
      );
    }

    const limited = limitRequest(req, "feedback", {
      ipLimit: IP_LIMIT,
      phoneLimit: CONTACT_LIMIT,
      phone: parsed.value.phone,
      windowMs: WINDOW_MS,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { ok: false, error: "Terlalu banyak kiriman. Coba lagi nanti." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
      );
    }

    let result;
    try {
      result = await insertFeedbackOnce(parsed.value);
    } catch (err) {
      // No false thank-you: the UI keeps the draft and shows a retry message.
      console.error("[Feedback] store failed:", redactError(err));
      return NextResponse.json(
        { ok: false, error: "Kritik/saran kamu belum tersimpan. Coba kirim ulang." },
        { status: 503 }
      );
    }

    // Same token, different text: the earlier row stands and this text was NOT
    // stored. Answer 409 so the screen cannot claim a save that did not happen (F-5).
    if (result.duplicate && !result.textMatches) {
      console.warn(`[Feedback] token reused with different text id=${result.id}`);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tulisan ini sudah tersimpan sebelumnya. Muat ulang halaman kalau mau mengirim versi baru.",
          code: "DUPLICATE_TOKEN",
        },
        { status: 409 }
      );
    }

    // Ids only: never the phone number, never the request token.
    console.log(`[Feedback] stored id=${result.id} duplicate=${result.duplicate}`);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[Feedback] unhandled exception:", redactError(error));
    return NextResponse.json({ ok: false, error: "Terjadi kesalahan." }, { status: 500 });
  }
}

/** No list exposure, ever. */
export function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
