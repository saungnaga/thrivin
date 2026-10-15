/**
 * POST /api/wa/session/request — langkah pertama alur WA-first.
 *
 * Nomor dinormalisasi SERVER-side (E.164-ish `62…`); input tak valid → 400,
 * tidak pernah disubstitusi nomor default. Jawaban sesudah itu SELALU sama:
 * tidak membedakan nomor baru / aktif / nonaktif, tidak menyebut nama, histori,
 * tanggal, atau sisa masa aktif. Challenge diterbitkan untuk nomor apa pun
 * (juga yang tidak ada di `users`) — kalau tidak, selisih jawaban jadi alat
 * enumerasi nomor.
 *
 * Gagal-tertutup: tanpa transport OTP yang diotorisasi pengiriman DITOLAK dengan
 * pesan generik, bukan 200 yang menjanjikan kode.
 */
import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { clientIp, limitRequest } from "@/lib/rate-limit";
import { issueChallenge, isOtpConfigured, OTP_TTL_SECONDS } from "@/lib/otp";
import { getOtpProvider } from "@/lib/otp-provider";

/** Satu-satunya bentuk jawaban untuk jalur yang tidak gagal-tertutup. */
const GENERIC_OK = {
  ok: true,
  message: "Kalau nomor itu terdaftar, kode verifikasi sudah dikirim ke WhatsApp-nya.",
};

/** Pesan gagal pun tidak boleh memberi tahu apakah nomornya ada. */
const GENERIC_UNAVAILABLE = {
  ok: false,
  error: "Layanan verifikasi sedang tidak bisa diakses. Coba lagi sebentar lagi.",
};

function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...(headers || {}) },
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Body harus JSON." }, 400);
  }

  const phone = normalizePhone((body as { phone?: unknown } | null)?.phone);

  const limit = limitRequest(req, "wa-otp-request", {
    ipLimit: 10,
    phoneLimit: 3,
    phone,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return json({ ok: false, error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  if (!phone) return json({ ok: false, error: "Nomor WhatsApp tidak valid." }, 400);

  const provider = getOtpProvider();
  if (!provider || !isOtpConfigured()) return json(GENERIC_UNAVAILABLE, 503);

  const issue = await issueChallenge(phone, clientIp(req));

  if (issue.status === "created") {
    try {
      await provider.send(phone, issue.code, OTP_TTL_SECONDS);
    } catch {
      // Kode tidak pernah sampai ke pemilik nomor -> jangan bilang "terkirim".
      return json(GENERIC_UNAVAILABLE, 503);
    }
  } else if (issue.status === "unavailable") {
    return json(GENERIC_UNAVAILABLE, 503);
  }
  // cooldown / resend_limit: diam-diam tidak mengirim ulang, jawaban tetap identik.

  return json(GENERIC_OK);
}
