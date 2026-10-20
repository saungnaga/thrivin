/**
 * Pemetaan hasil RPC `subscription_status_for_owner` -> jawaban publik
 * `/api/wa/session/request` (WA-first TANPA OTP, keputusan owner 20/10).
 *
 * Bentuk jawaban SENGAJA minimal: tanpa OTP siapa pun bisa mengetik nomor orang
 * lain, jadi nama, profil, riwayat, `subscription_id`, `token_limit`, dan nomor
 * terformat TIDAK boleh ikut. Yang keluar hanya status + angka masa aktif.
 *
 * `planName` selalu null: RPC hanya mengembalikan `last_plan_key`
 * (month/quarter/half/year), bukan nama tampilan — memetakannya di sini berarti
 * mengarang label produk. Isi kalau katalog sudah punya nama resmi.
 */
import type { SubscriptionStatus } from "./subscription-lookup.ts";

const DAY_MS = 86_400_000;
/** "lebih dari 7 hari" = 7×24 jam, batas inklusif ke sisi belum lewat. */
export const RENEWAL_PROMO_AFTER_MS = 7 * DAY_MS;

export type WaLookupPayload =
  | { ok: true; status: "new" }
  | { ok: true; status: "active"; planName: string | null; daysLeft: number | null }
  | {
      ok: true;
      status: "inactive";
      daysSinceExpiry: number | null;
      renewalPromo: boolean;
    };

export function buildWaLookupPayload(
  subscription: SubscriptionStatus,
  now: number = Date.now()
): WaLookupPayload {
  const expiresAt = subscription.expiresAt ? Date.parse(subscription.expiresAt) : NaN;

  if (subscription.state === "active") {
    return {
      ok: true,
      status: "active",
      planName: null,
      daysLeft: Number.isFinite(expiresAt)
        ? Math.max(0, Math.ceil((expiresAt - now) / DAY_MS))
        : null,
    };
  }

  if (subscription.state === "expired") {
    const elapsed = Number.isFinite(expiresAt) ? now - expiresAt : NaN;
    return {
      ok: true,
      status: "inactive",
      daysSinceExpiry: Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / DAY_MS)) : null,
      // Tanpa expires_at yang bisa dibaca: JANGAN tawarkan promo (gagal-tertutup).
      renewalPromo: Number.isFinite(elapsed) && elapsed > RENEWAL_PROMO_AFTER_MS,
    };
  }

  return { ok: true, status: "new" };
}
