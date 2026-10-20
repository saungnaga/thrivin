/**
 * POST /api/wa/session/request — langkah pertama alur WA-first: LOOKUP STATUS.
 *
 * Keputusan owner 20/10: TIDAK ada kode OTP. Nomor WhatsApp diketik, server
 * cek database, lalu menjawab salah satu dari tiga status: `new` / `active` /
 * `inactive`. Bentuk jawaban dijaga minimal (lihat `@/lib/wa-status`) — tanpa
 * nama, profil, riwayat, `subscription_id`, atau nomor terformat.
 *
 * ⚠️ Konsekuensi jujur dari menghapus OTP: cookie sesi yang diterbitkan di sini
 * membuktikan "nomor ini pernah dicari dari browser ini", BUKAN "nomor ini
 * milik pengguna". Gate `cleanPhone === sessionPhone` di create-order tetap
 * berjalan, tapi ia hanya mengikat SATU request ke nomor yang baru diketik —
 * bukan bukti kepemilikan. Risiko enumerasi nomor dicatat di
 * docs/wa-first-tanpa-otp-2026-10-20.md.
 *
 * Nomor dinormalisasi SERVER-side; input tak valid → 400 (tidak pernah
 * disubstitusi nomor default). Rate limit lebih ketat dari jalur OTP lama
 * karena endpoint ini bisa dipakai menebak nomor: 20/IP dan 5/nomor per menit.
 *
 * Gagal-tertutup: lookup error atau sesi tak bisa diterbitkan → 503 generik
 * TANPA field `status`, supaya kegagalan tidak pernah terbaca "nomor baru".
 */
import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { limitRequest } from "@/lib/rate-limit";
import { lookupSubscriptionStatus } from "@/lib/subscription-lookup";
import { buildWaLookupPayload } from "@/lib/wa-status";
import {
  createWaSessionToken,
  WA_SESSION_COOKIE,
  waSessionCookieOptions,
} from "@/lib/wa-session";

const UNAVAILABLE = {
  ok: false,
  error: "Status nomor sedang tidak bisa dicek. Coba lagi sebentar lagi.",
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

  const limit = limitRequest(req, "wa-status-lookup", {
    ipLimit: 20,
    phoneLimit: 5,
    phone,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return json({ ok: false, error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  if (!phone) return json({ ok: false, error: "Nomor WhatsApp tidak valid." }, 400);

  // Sesi hanya untuk nomor yang valid secara FORMAT. Tanpa secret yang layak
  // sesi tidak bisa diterbitkan, jadi langkah checkout berikutnya mustahil —
  // lebih jujur menolak sekarang daripada menjawab status lalu 401 di checkout.
  const token = createWaSessionToken(phone);
  if (!token) return json(UNAVAILABLE, 503);

  let subscription: Awaited<ReturnType<typeof lookupSubscriptionStatus>>;
  try {
    subscription = await lookupSubscriptionStatus(phone);
  } catch {
    // Jangan pernah mengubah kegagalan upstream jadi "nomor baru".
    return json(UNAVAILABLE, 503);
  }

  const res = json(buildWaLookupPayload(subscription));
  res.cookies.set(WA_SESSION_COOKIE, token, waSessionCookieOptions());
  return res;
}
