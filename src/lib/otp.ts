/**
 * Challenge OTP server-side (kontrak §1).
 *
 * Aturan yang dijaga di sini:
 *   - kode 6 digit acak dari CSPRNG (`crypto.randomInt`, bukan Math.random);
 *   - yang disimpan HANYA hash (HMAC-SHA256(phone:code, WA_OTP_SECRET)) — DB
 *     tidak pernah melihat kode polos dan kode tidak pernah masuk log;
 *   - single-use + TTL + batas percobaan + batas resend ditegakkan di RPC
 *     atomik `create_wa_otp_challenge` / `verify_wa_otp_challenge`
 *     (staging/schema-wa-identity.sql), bukan dengan baca-lalu-tulis di TS;
 *   - gagal-tertutup: tanpa WA_OTP_SECRET tidak ada challenge sama sekali.
 *
 * ponytail: satu tabel + dua RPC. Naikkan ke penyimpanan terdistribusi kalau
 * nanti ada layanan selain web yang perlu melihat challenge yang sama.
 */
import crypto from "crypto";
import {
  getSupabaseConfig,
  redactError,
  TENANT_ID,
  ConfigError,
} from "./onboarding-store.ts";
import { isWeakSecret } from "./session-secret.ts";

export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_SECONDS = Number(process.env.WA_OTP_TTL_SECONDS || 300);
export const OTP_MIN_INTERVAL_SECONDS = Number(process.env.WA_OTP_MIN_INTERVAL_SECONDS || 60);
export const OTP_MAX_PER_HOUR = Number(process.env.WA_OTP_MAX_PER_HOUR || 5);
export const OTP_MAX_ATTEMPTS = Number(process.env.WA_OTP_MAX_ATTEMPTS || 5);

let weakSecretLogged = false;

function otpSecret(): string {
  const secret = process.env.WA_OTP_SECRET || "";
  if (isWeakSecret(secret)) {
    if (!weakSecretLogged) {
      weakSecretLogged = true;
      console.error(
        "[WaOtp] WA_OTP_SECRET ditolak: kosong/lemah. Butuh >= 32 karakter acak. OTP ditolak."
      );
    }
    throw new ConfigError("[WaOtp] WA_OTP_SECRET tidak dikonfigurasi dengan aman.");
  }
  return secret;
}

export function isOtpConfigured(): boolean {
  try {
    otpSecret();
    return true;
  } catch {
    return false;
  }
}

/** 6 digit dari CSPRNG (uniform: 0..999999). */
export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 10 ** OTP_CODE_LENGTH)).padStart(OTP_CODE_LENGTH, "0");
}

/**
 * Hash yang disimpan di DB. Keyed (HMAC), bukan sha256 polos: sha256 kode 6
 * digit bisa di-brute force dari dump tabel dalam hitungan detik.
 */
export function hashOtpCode(code: string, phone: string): string {
  return crypto.createHmac("sha256", otpSecret()).update(`${phone}:${code}`).digest("hex");
}

/** sha256 pendek untuk nomor/ip di kolom forensik — tidak pernah nilai mentah. */
export function opaqueHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export type ChallengeIssue =
  | { status: "created"; code: string }
  | { status: "cooldown" | "resend_limit"; retryAfterSeconds: number }
  | { status: "unavailable" };

export type ChallengeVerify =
  | { status: "ok" }
  | { status: "invalid"; attemptsLeft: number }
  | { status: "expired" | "no_challenge" | "too_many_attempts" }
  | { status: "unavailable" };

function serviceHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown | null> {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: serviceHeaders(key),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[WaOtp] ${name} failed: status=${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[WaOtp] ${name} error:`, redactError(err));
    return null;
  }
}

/** Terbitkan challenge + kembalikan kode hanya kalau benar-benar terbit. */
export async function issueChallenge(phone: string, ip: string | null): Promise<ChallengeIssue> {
  let code: string;
  let codeHash: string;
  try {
    code = generateOtpCode();
    codeHash = hashOtpCode(code, phone);
  } catch {
    return { status: "unavailable" };
  }

  const result = (await rpc("create_wa_otp_challenge", {
    p_phone: phone,
    p_code_hash: codeHash,
    p_ttl_seconds: OTP_TTL_SECONDS,
    p_min_interval_seconds: OTP_MIN_INTERVAL_SECONDS,
    p_max_per_hour: OTP_MAX_PER_HOUR,
    p_ip_hash: ip ? opaqueHash(ip) : null,
    p_tenant_id: TENANT_ID,
  })) as { status?: string; retry_after_seconds?: number } | null;

  if (!result?.status) return { status: "unavailable" };
  if (result.status === "created") return { status: "created", code };
  if (result.status === "cooldown" || result.status === "resend_limit") {
    return {
      status: result.status,
      retryAfterSeconds: Number(result.retry_after_seconds ?? 60),
    };
  }
  return { status: "unavailable" };
}

/** Verifikasi kode. Tidak pernah melempar — status 'unavailable' artinya gagal-tertutup. */
export async function verifyChallenge(phone: string, code: string): Promise<ChallengeVerify> {
  let codeHash: string;
  try {
    codeHash = hashOtpCode(code, phone);
  } catch {
    return { status: "unavailable" };
  }

  const result = (await rpc("verify_wa_otp_challenge", {
    p_phone: phone,
    p_code_hash: codeHash,
    p_tenant_id: TENANT_ID,
  })) as { status?: string; attempts_left?: number } | null;

  if (!result?.status) return { status: "unavailable" };
  if (result.status === "ok") return { status: "ok" };
  if (result.status === "invalid") {
    return { status: "invalid", attemptsLeft: Number(result.attempts_left ?? 0) };
  }
  if (
    result.status === "expired" ||
    result.status === "no_challenge" ||
    result.status === "too_many_attempts"
  ) {
    return { status: result.status };
  }
  return { status: "unavailable" };
}
