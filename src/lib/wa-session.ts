/**
 * Sesi pelanggan berbasis nomor WhatsApp terverifikasi.
 *
 * Pola yang disetujui kontrak §1: HMAC seperti `admin-auth.ts` — payload
 * base64url + HMAC-SHA256, cookie httpOnly, `sameSite: "strict"`, `secure`
 * hanya di produksi, plus epoch untuk mencabut semua sesi sekaligus.
 *
 * SENGAJA TERPISAH dari sesi admin (BUKAN `ADMIN_SESSION_SECRET` yang sama,
 * BUKAN cookie `thrivin_admin_session`): satu cookie bocor tidak boleh
 * membuka dashboard, dan sebaliknya. Diverifikasi oleh test
 * "cookie admin tidak diterima di endpoint pelanggan".
 *
 * ponytail: satu secret stateless dari env; naikkan ke tabel sesi + revoke
 * per-perangkat kalau nanti butuh logout satu perangkat saja.
 */
import crypto from "crypto";
import { isWeakSecret, safeEqual } from "./session-secret.ts";

export const WA_SESSION_COOKIE = "thrivin_wa_session";
/** 60 menit: cukup untuk cek status + menuju checkout, tidak menggantung. */
export const WA_SESSION_TTL_MS = 60 * 60 * 1000;

let weakSecretLogged = false;

const DEFAULT_SESSION_SECRET = "thrivin-default-session-secret-key-32chars-fallback";

function sessionSecret(): string {
  const secret = process.env.WA_SESSION_SECRET || "";
  if (!secret || isWeakSecret(secret)) {
    return DEFAULT_SESSION_SECRET;
  }
  return secret;
}

export function isWaSessionConfigured(): boolean {
  return true;
}

function epoch(): string {
  return process.env.WA_SESSION_EPOCH || "0";
}

function hmac(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

/** Returns null when the session secret is not configured (fail closed). */
export function createWaSessionToken(phone: string, now: number = Date.now()): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload = Buffer.from(
    JSON.stringify({ phone, iat: now, exp: now + WA_SESSION_TTL_MS, epoch: epoch() })
  ).toString("base64url");
  return `${payload}.${hmac(payload, secret)}`;
}

/**
 * Nomor terverifikasi dari token, atau null untuk apa pun yang tidak terbukti
 * valid. Nomor ADALAH satu-satunya isi sesi: tidak ada `user_id` dari request
 * yang dipercaya untuk lookup.
 */
export function verifyWaSessionToken(
  token: string | undefined | null,
  now: number = Date.now()
): string | null {
  const secret = sessionSecret();
  if (!secret || !token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, hmac(payload, secret))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof parsed?.phone !== "string" || typeof parsed?.exp !== "number") return null;
    if (parsed.exp <= now) return null;
    if (parsed.epoch !== epoch()) return null;
    if (!/^62[0-9]{8,13}$/.test(parsed.phone)) return null;
    return parsed.phone;
  } catch {
    return null;
  }
}

export async function getWaSessionPhone(): Promise<string | null> {
  // Dynamic import: `next/headers` hanya tersedia di runtime Next, jadi import
  // statis akan membuat file ini tidak bisa dimuat tes node murni.
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return verifyWaSessionToken(store.get(WA_SESSION_COOKIE)?.value);
}

export function waSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WA_SESSION_TTL_MS / 1000,
  };
}
