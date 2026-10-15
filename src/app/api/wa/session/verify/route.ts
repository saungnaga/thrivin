/**
 * POST /api/wa/session/verify — bukti kepemilikan nomor (langkah kedua).
 *
 * Verifikasi dilakukan di server (RPC atomik di
 * `staging/schema-wa-identity.sql`): hash-at-rest, single-use, TTL, batas
 * percobaan. Route ini hanya:
 *   - membatasi laju per IP dan per nomor,
 *   - menukar hasil verifikasi jadi cookie sesi httpOnly milik pelanggan
 *     (secret + nama cookie TERPISAH dari sesi admin).
 *
 * Semua kegagalan memakai pesan yang sama supaya tidak jadi oracle (tidak
 * membocorkan apakah challenge-nya ada, kedaluwarsa, atau kodenya salah).
 */
import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { limitRequest } from "@/lib/rate-limit";
import { verifyChallenge } from "@/lib/otp";
import {
  createWaSessionToken,
  isWaSessionConfigured,
  WA_SESSION_COOKIE,
  waSessionCookieOptions,
} from "@/lib/wa-session";

const GENERIC_FAIL = {
  ok: false,
  error: "Kode verifikasi tidak valid atau sudah kedaluwarsa.",
};
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

  const raw = (body ?? {}) as { phone?: unknown; code?: unknown };
  const phone = normalizePhone(raw.phone);

  const limit = limitRequest(req, "wa-otp-verify", {
    ipLimit: 20,
    phoneLimit: 10,
    phone,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return json({ ok: false, error: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  if (!phone) return json({ ok: false, error: "Nomor WhatsApp tidak valid." }, 400);
  if (!isWaSessionConfigured()) return json(GENERIC_UNAVAILABLE, 503);

  // Bentuk kode yang jelas salah diperlakukan sama dengan kode salah.
  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  if (!/^[0-9]{6}$/.test(code)) return json(GENERIC_FAIL, 401);

  const result = await verifyChallenge(phone, code);

  if (result.status === "ok") {
    const token = createWaSessionToken(phone);
    if (!token) return json(GENERIC_UNAVAILABLE, 503);
    const res = json({ ok: true, verified: true });
    res.cookies.set(WA_SESSION_COOKIE, token, waSessionCookieOptions());
    return res;
  }
  if (result.status === "unavailable") return json(GENERIC_UNAVAILABLE, 503);
  if (result.status === "too_many_attempts") {
    return json({ ok: false, error: "Terlalu banyak percobaan. Minta kode baru." }, 429);
  }
  return json(GENERIC_FAIL, 401);
}
