/**
 * Single source of truth for phone normalisation (M-5).
 * Three copies of this used to exist, one of which silently substituted a
 * hardcoded number for invalid input — that could merge two people into one
 * account. Here invalid input returns null and the caller rejects it.
 */

const MIN_DIGITS = 10;
const MAX_DIGITS = 15;

/** Returns E.164-ish `62...` digits, or null when the input is not a valid ID mobile number. */
export function normalizePhone(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (!digits.startsWith("62")) digits = "62" + digits;
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return digits;
}

/**
 * Format nomor telepon Indonesia untuk tampilan user dengan awalan '0'.
 * - Jika tanpa 0 (misal '81234567890'), tambahkan 0 -> '081234567890'.
 * - Jika pakai '+62' atau '62' (misal '+6281234567890' / '6281234567890'), ganti dengan 0 -> '081234567890'.
 * - Jika sudah diawali 0 (misal '081234567890'), biarkan tetap diawali 0.
 */
export function formatDisplayPhone(raw: unknown): string {
  if (!raw) return "";
  let digits = String(raw ?? "").trim().replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) {
    digits = "0" + digits.slice(2);
  } else if (!digits.startsWith("0")) {
    digits = "0" + digits;
  }
  return digits;
}
