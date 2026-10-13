/**
 * Admin session for the promo dashboard.
 *
 * Pembayaran/order tidak boleh berhenti karena dashboard, dan dashboard tidak
 * boleh terbuka karena kebetulan. Karena itu:
 *   - kredensial + secret session HANYA dari environment (tidak ada default);
 *   - tidak ada Supabase/auth library baru — cookie ber-HMAC sudah cukup untuk
 *     satu halaman internal, tanpa nambah dependency;
 *   - semua pengecekan gagal-tertutup: konfigurasi kurang => DITOLAK, bukan
 *     "buka akses".
 *
 * ponytail: satu akun admin dari env. Naikkan ke tabel admin_users + Supabase
 * Auth kalau nanti butuh lebih dari satu orang atau audit per-akun.
 */
import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "thrivin_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 jam
const MIN_SECRET_LENGTH = 32;

export interface AdminConfig {
  username: string;
  password: string;
  secret: string;
}

/** null = belum dikonfigurasi => semua endpoint harus menolak. */
export function getAdminConfig(): AdminConfig | null {
  const username = process.env.ADMIN_USERNAME || "";
  const password = process.env.ADMIN_PASSWORD || "";
  const secret = process.env.ADMIN_SESSION_SECRET || "";
  if (!username || !password) return null;
  if (secret.length < MIN_SECRET_LENGTH) return null;
  return { username, password, secret };
}

export function isAdminConfigured(): boolean {
  return getAdminConfig() !== null;
}

function hmac(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

/** Perbandingan waktu-tetap supaya panjang/prefix tidak bocor lewat timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createSessionToken(username: string, now: number = Date.now()): string | null {
  const config = getAdminConfig();
  if (!config) return null;
  const payload = Buffer.from(
    JSON.stringify({ username, exp: now + SESSION_TTL_MS })
  ).toString("base64url");
  return `${payload}.${hmac(payload, config.secret)}`;
}

/** Returns the session username, or null for anything not provably valid. */
export function verifySessionToken(
  token: string | undefined | null,
  now: number = Date.now()
): string | null {
  const config = getAdminConfig();
  if (!config || !token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, hmac(payload, config.secret))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof parsed?.username !== "string" || typeof parsed?.exp !== "number") return null;
    if (parsed.exp <= now) return null;
    return parsed.username;
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}