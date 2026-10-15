/**
 * Guard secret bersama untuk SEMUA sesi (admin dashboard + pelanggan WA-first).
 *
 * Dipisah dari `admin-auth.ts` karena file itu mengimpor `next/headers` —
 * sehingga tes node murni (unit maupun harness) tidak bisa memuatnya. Di sini
 * hanya `crypto`, jadi bisa dipakai ulang tanpa menyeret runtime Next.
 *
 * Ini bukan "logika keamanan kedua": `admin-auth.ts` mengimpor dari file yang
 * SAMA, jadi aturan lemah/kuatnya cuma ada satu.
 */
import crypto from "crypto";

export const MIN_SECRET_LENGTH = 32;
/** Nilai utuh yang jelas lemah (bukan substring: frasa panjang tetap boleh). */
const WEAK_SECRETS = new Set([
  "changeme",
  "change-me",
  "secret",
  "password",
  "admin",
  "thrivin",
  "thrivin-secret",
  "test",
  "example",
  "supersecret",
]);
const MIN_DISTINCT_CHARS = 10;

/**
 * C-2: panjang saja bukan ukuran. `'a'.repeat(32)` panjangnya 32 tapi bisa
 * ditebak, dan karena cookie-nya HMAC dari secret itu, secret lemah = cookie
 * bisa dipalsukan TANPA tahu password (direproduksi Sentinel: GET 200).
 */
export function isWeakSecret(secret: string): boolean {
  if (secret.length < MIN_SECRET_LENGTH) return true;
  if (WEAK_SECRETS.has(secret.toLowerCase())) return true;
  if (new Set(secret).size < MIN_DISTINCT_CHARS) return true; // 'a'x32, 'ab'x16
  if (/^\d+$/.test(secret)) return true; // tanggal/nomor urut
  if (/(.)\1{7,}/.test(secret)) return true; // 8+ karakter sama beruntun
  return false;
}

/** Perbandingan waktu-tetap supaya panjang/prefix tidak bocor lewat timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
