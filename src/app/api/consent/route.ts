/**
 * POST /api/consent — simpan persetujuan checkout SEBELUM popup pembayaran (A7).
 *
 * Identitas diambil dari cookie sesi WA terverifikasi — nomor dari body diabaikan,
 * jadi satu sesi tidak bisa menulis consent untuk nomor orang lain.
 * Gagal simpan ⇒ jawaban bukan 200, dan UI tidak boleh lanjut ke pembayaran.
 */
import { NextResponse } from "next/server";
import { getWaSessionPhone } from "@/lib/wa-session";
import { limitRequest } from "@/lib/rate-limit";
import { recordCheckoutConsent } from "@/lib/consent";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Body harus JSON." }, 400);
  }

  const phone = await getWaSessionPhone();
  if (!phone) {
    // Fail closed: tanpa identitas terverifikasi tidak ada consent yang dicatat.
    return json({ ok: false, code: "SESSION_REQUIRED", error: "Sesi tidak valid. Verifikasi nomor WhatsApp dulu." }, 401);
  }

  const limit = limitRequest(req, "checkout-consent", { ipLimit: 30, phoneLimit: 20, phone });
  if (!limit.ok) {
    return json({ ok: false, code: "RATE_LIMITED", error: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, 429);
  }

  const raw = (body ?? {}) as {
    termsAccepted?: unknown;
    reminderOptIn?: unknown;
    idempotencyKey?: unknown;
  };

  if (raw.termsAccepted !== true) {
    return json(
      {
        ok: false,
        code: "CONSENT_REQUIRED",
        error: "Centang persetujuan Syarat & Ketentuan sebelum melanjutkan.",
      },
      400
    );
  }

  const result = await recordCheckoutConsent({
    phone,
    termsAccepted: true,
    reminderOptIn: raw.reminderOptIn === true,
    idempotencyKey: String(raw.idempotencyKey || ""),
  });

  if (!result.ok) {
    return json({ ok: false, code: result.code, error: result.message }, result.code === "CONSENT_STORE_UNAVAILABLE" ? 503 : 400);
  }

  return json({
    ok: true,
    termsVersion: result.termsVersion,
    reminderOptIn: result.reminderOptIn === true,
    duplicate: result.duplicate === true,
  });
}
