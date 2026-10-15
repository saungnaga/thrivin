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
import { isWeakSecret, safeEqual, MIN_SECRET_LENGTH } from "./session-secret.ts";

// Guard secret dipakai bersama sesi pelanggan (WA-first) — lihat
// `session-secret.ts`. Re-export supaya pemanggil lama tidak berubah.
export { isWeakSecret, safeEqual };

export const ADMIN_COOKIE = "thrivin_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 jam

export interface AdminConfig {
  username: string;
  password: string;
  secret: string;
}


let weakSecretLogged = false;

/** null = belum/tidak dikonfigurasi => semua endpoint harus menolak. */
export function getAdminConfig(): AdminConfig | null {
  const username = process.env.ADMIN_USERNAME || "";
  const password = process.env.ADMIN_PASSWORD || "";
  const secret = process.env.ADMIN_SESSION_SECRET || "";
  if (!username || !password) return null;
  if (isWeakSecret(secret)) {
    // Sekali per proses: ini kesalahan konfigurasi, bukan kesalahan per request.
    if (!weakSecretLogged) {
      weakSecretLogged = true;
      console.error(
        "[AdminAuth] ADMIN_SESSION_SECRET ditolak: lemah. Butuh >= 32 karakter acak " +
          "(mis. `openssl rand -base64 32`). Dashboard ditolak sampai diperbaiki."
      );
    }
    return null;
  }
  return { username, password, secret };
}

export function isAdminConfigured(): boolean {
  return getAdminConfig() !== null;
}

function hmac(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(username: string, now: number = Date.now()): string | null {
  const config = getAdminConfig();
  if (!config) return null;
  const payload = Buffer.from(
    JSON.stringify({
      username,
      iat: now,
      exp: now + SESSION_TTL_MS,
      epoch: sessionEpoch(),
    })
  ).toString("base64url");
  return `${payload}.${hmac(payload, config.secret)}`;
}

/**
 * C-3: token-nya stateless, jadi logout TIDAK bisa mencabut satu token tanpa
 * state. Yang tersedia murah: naikkan ADMIN_SESSION_EPOCH (mis. ke timestamp)
 * => semua sesi lama gagal verifikasi karena epoch di dalam payload tidak lagi
 * cocok. Keputusan & trade-off tertulis di laporan VETO remediation.
 */
function sessionEpoch(): string {
  return process.env.ADMIN_SESSION_EPOCH || "0";
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
    if (parsed.epoch !== sessionEpoch()) return null;
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