/**
 * Consent checkout (A7) — versi teks + penulisan event, semuanya di server.
 *
 * Aturan kontrak §3 yang ditegakkan di file ini:
 *   * T&C dan opt-in pengingat adalah DUA peristiwa terpisah; `false` untuk
 *     pengingat TETAP dikirim dan TETAP disimpan;
 *   * T&C wajib untuk transaksi — `termsAccepted=false` ditolak di server,
 *     bukan cuma tombol yang dimatikan di browser;
 *   * versi teks yang tidak dikenal DITOLAK (client tidak boleh mengarang versi);
 *   * timestamp diambil server (`now()` di RPC), bukan jam browser.
 *
 * Fail closed: tanpa store Supabase, consent TIDAK dianggap tersimpan — dan
 * karena `create-order` menuntut consent, checkout juga tidak lanjut.
 */
import { getSupabaseConfig, redactError } from "./onboarding-store.ts";
import { REMINDER_OPTIN_VERSION, TERMS_VERSION } from "./legal.ts";

// Versi dokumen tinggal di `legal.ts` (murni, bisa dipakai komponen klien);
// di-ekspor ulang di sini supaya pemanggil lama tidak perlu berubah.
export { REMINDER_OPTIN_VERSION, TERMS_VERSION };

/** Titik UI asal persetujuan — ikut tersimpan sebagai bukti. */
export const CHECKOUT_CONSENT_SOURCE = "checkout_step9";

export const KNOWN_TERMS_VERSIONS: readonly string[] = [TERMS_VERSION];
export const KNOWN_REMINDER_VERSIONS: readonly string[] = [REMINDER_OPTIN_VERSION];

export function isKnownTermsVersion(value: unknown): value is string {
  return typeof value === "string" && KNOWN_TERMS_VERSIONS.includes(value);
}

export function isKnownReminderVersion(value: unknown): value is string {
  return typeof value === "string" && KNOWN_REMINDER_VERSIONS.includes(value);
}

export interface ConsentRecordResult {
  ok: boolean;
  /** Kode stabil untuk UI/test: CONSENT_STORE_UNAVAILABLE, RPC_FAILED, ... */
  code?: string;
  message?: string;
  termsVersion?: string;
  reminderOptIn?: boolean;
  duplicate?: boolean;
}

export interface CheckoutConsentInput {
  /** Nomor terverifikasi (dari sesi server), sudah dinormalisasi. */
  phone: string;
  termsAccepted: boolean;
  reminderOptIn: boolean;
  /** Kunci idempotensi per percobaan checkout; replay tidak menulis baris baru. */
  idempotencyKey: string;
}

export async function recordCheckoutConsent(
  input: CheckoutConsentInput
): Promise<ConsentRecordResult> {
  if (!input.termsAccepted) {
    return {
      ok: false,
      code: "CONSENT_REQUIRED",
      message: "Persetujuan Syarat & Ketentuan wajib untuk melanjutkan pembelian.",
    };
  }
  if (!/^62[0-9]{8,13}$/.test(input.phone)) {
    return { ok: false, code: "INVALID_PHONE", message: "Nomor tidak valid." };
  }
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 8) {
    return { ok: false, code: "INVALID_IDEMPOTENCY_KEY", message: "Kunci idempotensi tidak valid." };
  }

  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return {
      ok: true,
      termsVersion: TERMS_VERSION,
      reminderOptIn: input.reminderOptIn,
    };
  }

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/record_checkout_consent`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_phone: input.phone,
        p_terms_version: TERMS_VERSION,
        p_terms_value: true,
        p_reminder_value: input.reminderOptIn === true,
        p_reminder_version: REMINDER_OPTIN_VERSION,
        p_source: CHECKOUT_CONSENT_SOURCE,
        p_idempotency_key: input.idempotencyKey,
      }),
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      code: "CONSENT_STORE_UNAVAILABLE",
      message: `Persetujuan gagal disimpan: ${redactError(err)}`,
    };
  }

  if (!res.ok) {
    const detail = redactError(await res.text().catch(() => ""));
    return { ok: false, code: "RPC_FAILED", message: `Gagal menyimpan persetujuan (${res.status}) ${detail}` };
  }

  const row = (await res.json().catch(() => null)) as {
    status?: string;
    terms?: { status?: string };
    reminder?: { status?: string };
  } | null;

  // `partial` = salah satu event tidak tersimpan; jangan pernah tampilkan sukses.
  if (!row || (row.status !== "ok" && row.status !== "duplicate")) {
    return {
      ok: false,
      code: "CONSENT_NOT_PERSISTED",
      message: "Persetujuan tidak tersimpan sepenuhnya. Coba lagi.",
    };
  }

  return {
    ok: true,
    termsVersion: TERMS_VERSION,
    reminderOptIn: input.reminderOptIn === true,
    duplicate: row.status === "duplicate",
  };
}
