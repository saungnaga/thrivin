/**
 * Helper bersama untuk uji gate checkout (kartu W4 t_f5ec336c).
 *
 * Yang "mempersenjatai" checkout = tiga hal di server: cookie sesi WA
 * terverifikasi, baris `onboarding_progress` untuk langkah 2–8, dan event
 * consent T&C. Helper ini melakukannya lewat HTTP seperti browser (bukan
 * menulis DB langsung) supaya uji mengikuti jalur yang benar-benar dipakai.
 *
 * Semua nomor di sini dummy. Tidak ada Scalev nyata, tidak ada staging.
 */
import crypto from "crypto";

export const DEFAULT_WA_SESSION_SECRET = "w4-consent-gate-session-secret-0123456789-abc";

export const TERMS_VERSION = "terms-2026-10-15-v1";
export const REMINDER_VERSION = "reminder-optin-2026-10-15-v1";

export interface StepPayloads {
  [step: number]: Record<string, unknown>;
}

/** Cookie sesi HMAC — bentuk yang sama dengan `src/lib/wa-session.ts`. */
export function craftWaSessionToken(
  phone: string,
  {
    secret = DEFAULT_WA_SESSION_SECRET,
    ttlMs = 60 * 60 * 1000,
    epoch = "0",
  }: { secret?: string; ttlMs?: number; epoch?: string } = {}
): string {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ phone, iat: now, exp: now + ttlMs, epoch })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Cookie `thrivin_wa_session=<token>` siap dipakai di header. */
export function waSessionCookie(phone: string, opts: Parameters<typeof craftWaSessionToken>[1] = {}) {
  return `thrivin_wa_session=${craftWaSessionToken(phone, opts)}`;
}

/** Isi lengkap langkah 2–8 (semua wajib ada kalau mau lolos gate). */
export function fullStepPayloads(phone: string): StepPayloads {
  const local = `0${phone.slice(2)}`;
  return {
    2: { name: "Kawan Uji" },
    3: { gender: "Laki-laki", age: 25 },
    4: { height: 170, weight: 65 },
    5: { activityLevel: "Moderat", workoutLocation: "Di Rumah" },
    6: { programFocus: ["Workout & Strength"] },
    7: { biggestChallenge: "Gampang Mager & Hilang Niat" },
    8: { communicationStyle: "Santai & Akrab", whatsappNumber: local },
  };
}

export interface ArmOptions {
  base: string;
  phone: string;
  cookie: string;
  steps?: StepPayloads;
  optIn?: boolean;
  idempotencyKey?: string;
  /** Kalau true, T&C TIDAK dicatat (uji jalur "consent belum ada"). */
  skipConsent?: boolean;
}

export function newIdempotencyKey(seed: string): string {
  return `co-${seed}-${crypto.randomUUID()}`;
}

async function post(base: string, path: string, cookie: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
      "X-Forwarded-For": `10.66.${(Date.now() % 200) + 1}.${(Date.now() % 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  return { status: res.status, body: parsed };
}

/** Simpan langkah 2–8 (default semua) lewat HTTP. */
export async function saveProgress(
  opts: ArmOptions
): Promise<{ status: number; body: any; perStep: Array<{ step: number; status: number }> }> {
  const steps = opts.steps || fullStepPayloads(opts.phone);
  const perStep: Array<{ step: number; status: number }> = [];
  let last: { status: number; body: any } = { status: 0, body: null };
  for (const key of Object.keys(steps)) {
    const step = Number(key);
    last = await post(opts.base, "/api/onboarding/progress", opts.cookie, { step, data: steps[step] });
    perStep.push({ step, status: last.status });
  }
  return { ...last, perStep };
}

/** Catat T&C (+ opsional pengingat) lewat HTTP — jalur UI yang sebenarnya. */
export async function recordConsent(
  opts: ArmOptions
): Promise<{ status: number; body: any }> {
  return post(opts.base, "/api/consent", opts.cookie, {
    termsAccepted: true,
    reminderOptIn: opts.optIn === true,
    idempotencyKey: opts.idempotencyKey || newIdempotencyKey("consent"),
  });
}

/**
 * Persiapkan checkout lengkap: progress + consent. Dipakai suite lama
 * (webhook/promo e2e) yang dulu memanggil `create-order` tanpa gate.
 */
export async function armCheckout(opts: ArmOptions): Promise<{
  progress: { status: number; perStep: Array<{ step: number; status: number }> };
  consent: { status: number; body: any };
  idempotencyKey: string;
}> {
  const progress = await saveProgress(opts);
  const idempotencyKey = opts.idempotencyKey || newIdempotencyKey("order");
  const consent = opts.skipConsent
    ? { status: 0, body: null }
    : await recordConsent({ ...opts, idempotencyKey });
  return { progress, consent, idempotencyKey };
}
