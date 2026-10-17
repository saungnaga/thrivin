/**
 * GET /api/wa/subscription — status langganan untuk sesi terverifikasi.
 *
 * Nomor diambil HANYA dari cookie sesi (HMAC, terikat nomor terverifikasi).
 * Query/body/header tidak pernah dipakai untuk memilih nomor: itu yang bikin
 * "renew tidak boleh percaya user_id/amount dari client" bisa ditegakkan.
 *
 * Field yang keluar dibatasi untuk kebutuhan layar ini: state, expires_at,
 * sisa masa aktif, plan key terakhir, nomor ter-mask, dan info perpanjangan
 * (katalog harga server + kandidat promo). Tidak ada nama, token_used,
 * token_limit, plan_name, atau id internal.
 *
 * Gagal-tertutup: error upstream → 503 TANPA field `state` sama sekali, supaya
 * outage tidak pernah terbaca sebagai "nomor baru".
 */
import { NextResponse } from "next/server";
import { getWaSessionPhone } from "@/lib/wa-session";
import { lookupSubscriptionStatus } from "@/lib/subscription-lookup";
import { buildRenewalInfo } from "@/lib/renewal";
import { maskedPhone } from "@/lib/welcome-message";

export async function GET() {
  const phone = await getWaSessionPhone();
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Sesi tidak valid. Verifikasi nomor WhatsApp dulu." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const status = await lookupSubscriptionStatus(phone);
    const renewal = await buildRenewalInfo(status.state, status.expiresAt);
    const expiresMs = status.expiresAt ? Date.parse(status.expiresAt) : NaN;

    return NextResponse.json(
      {
        ok: true,
        state: status.state,
        expiresAt: status.expiresAt,
        /** Sisa masa aktif dalam ms; null kalau tidak sedang aktif. */
        remainingMs:
          status.state === "active" && Number.isFinite(expiresMs)
            ? Math.max(0, expiresMs - Date.now())
            : null,
        lastPlanKey: status.lastPlanKey,
        maskedPhone: maskedPhone(phone),
        renewal,
        /** Klaim aktivasi promo ditahan keputusan owner (t_7bcb4487). */
        renewalActivationEnabled: false,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Tidak ada detail internal (dan tidak ada angka DB) yang keluar ke browser.
    return NextResponse.json(
      {
        ok: false,
        error: "Layanan langganan sedang tidak bisa diakses. Coba lagi sebentar lagi.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
