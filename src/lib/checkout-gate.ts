/**
 * Gate checkout server-side (A2) — pembungkus RPC PostgREST.
 *
 * Yang dijaga di sini: `create-order` tidak boleh menghubungi Scalev sebelum
 * (a) sesi WA terverifikasi, (b) semua langkah onboarding wajib ada di server,
 * (c) T&C versi yang ditampilkan sudah tersimpan, dan (d) klaim single-flight
 * didapat. Semua kegagalan = fail-closed: tidak ada order, tidak ada sukses palsu.
 *
 * ponytail: satu tabel klaim + unique index parsial; kalau nanti butuh antrean
 * panjang, tambah kolom percobaan/backoff — bukan state machine baru.
 */
import { getSupabaseConfig, redactError } from "./onboarding-store.ts";
import { REQUIRED_STEPS, checkRequiredSteps, mergedProfileFromSteps } from "./onboarding-steps.ts";
import { TERMS_VERSION } from "./consent.ts";

export class CheckoutGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutGateError";
  }
}

function rpcEndpoint(): { url: string; key: string } {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new CheckoutGateError("[CheckoutGate] Supabase tidak dikonfigurasi — gate ditolak (fail closed).");
  }
  return { url, key };
}

async function callRpc(name: string, body: Record<string, unknown>): Promise<any> {
  const { url, key } = rpcEndpoint();
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    throw new CheckoutGateError(`[CheckoutGate] ${name}: upstream tidak bisa dihubungi: ${redactError(err)}`);
  }
  if (!res.ok) {
    const detail = redactError(await res.text().catch(() => ""));
    throw new CheckoutGateError(`[CheckoutGate] ${name}: RPC gagal (${res.status}) ${detail}`);
  }
  return res.json();
}

/** Simpan satu langkah onboarding (server-side). */
export async function saveOnboardingStep(
  phone: string,
  step: number,
  data: Record<string, unknown>
): Promise<{ ok: boolean; status: string }> {
  const row = await callRpc("save_onboarding_step", { p_phone: phone, p_step: step, p_data: data });
  if (row?.status !== "saved") {
    throw new CheckoutGateError(`[CheckoutGate] save_onboarding_step: ${JSON.stringify(row)}`);
  }
  return { ok: true, status: String(row.status) };
}

export interface OnboardingProgress {
  steps: Record<string, Record<string, unknown>>;
  stepReached: number;
  complete: boolean;
  missingSteps: number[];
  invalidSteps: Array<{ step: number; errors: string[] }>;
}

/**
 * Baca progress dari server dan tentukan kelengkapan dari data yang TERSIMPAN.
 * Tidak ada bagian dari jawaban ini yang berasal dari klien.
 */
export async function getOnboardingProgress(phone: string): Promise<OnboardingProgress> {
  const { url, key } = rpcEndpoint();
  const res = await fetch(
    `${url}/rest/v1/onboarding_progress?tenant_id=eq.${encodeURIComponent(
      process.env.THRIVIN_TENANT_ID || "thrivin"
    )}&phone=eq.${encodeURIComponent(phone)}&select=steps,step_reached&limit=1`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new CheckoutGateError(`[CheckoutGate] baca progress gagal (${res.status})`);
  }
  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  const steps = (row?.steps || {}) as Record<string, Record<string, unknown>>;
  const completeness = checkRequiredSteps(steps);
  return {
    steps,
    stepReached: Number(row?.step_reached || 1),
    complete: completeness.complete,
    missingSteps: completeness.missingSteps,
    invalidSteps: completeness.invalidSteps,
  };
}

export type ClaimOutcome =
  | { status: "granted"; claimId: string }
  | { status: "already_created"; claimId: string; orderId: string; paymentUrl: string }
  | { status: "reuse_unpaid"; claimId: string; orderId: string; paymentUrl: string }
  | { status: "unpaid_conflict"; activePlanKey: string }
  | { status: "in_flight" }
  | { status: "incomplete_onboarding"; missingSteps: number[] }
  | { status: "consent_required" }
  | { status: "key_conflict" }
  | { status: "error"; detail: string };

/**
 * Klaim checkout (atomik di DB): langkah wajib + T&C + single-flight per
 * idempotency key. Replay key yang sama mengembalikan order yang SAMA.
 */
export async function claimCheckoutOrder(input: {
  phone: string;
  planKey: string;
  idempotencyKey: string;
  termsVersion?: string;
}): Promise<ClaimOutcome> {
  const row = await callRpc("claim_checkout_order", {
    p_phone: input.phone,
    p_required_steps: [...REQUIRED_STEPS],
    p_plan_key: input.planKey,
    p_terms_version: input.termsVersion || TERMS_VERSION,
    p_idempotency_key: input.idempotencyKey,
  });

  switch (row?.status) {
    case "granted":
      return { status: "granted", claimId: String(row.claim_id) };
    case "already_created":
      return {
        status: "already_created",
        claimId: String(row.claim_id),
        orderId: String(row.order_id || ""),
        paymentUrl: String(row.payment_url || ""),
      };
    case "reuse_unpaid":
      // F-W4-1(a): nomor ini masih punya order belum dibayar untuk paket yang
      // sama — kunci baru dikembalikan ke order/link itu, bukan order kedua.
      return {
        status: "reuse_unpaid",
        claimId: String(row.claim_id),
        orderId: String(row.order_id || ""),
        paymentUrl: String(row.payment_url || ""),
      };
    case "unpaid_conflict":
      return { status: "unpaid_conflict", activePlanKey: String(row.plan_key || "") };
    case "in_flight":
      return { status: "in_flight" };
    case "incomplete_onboarding":
      return { status: "incomplete_onboarding", missingSteps: (row.missing_steps || []) as number[] };
    case "consent_required":
      return { status: "consent_required" };
    case "key_conflict":
      return { status: "key_conflict" };
    default:
      return { status: "error", detail: JSON.stringify(row) };
  }
}

export async function completeCheckoutClaim(
  claimId: string,
  orderId: string,
  paymentUrl: string,
  amount?: number
): Promise<void> {
  await callRpc("complete_checkout_claim", {
    p_claim_id: claimId,
    p_order_id: orderId,
    p_payment_url: paymentUrl,
    p_amount: amount ?? null,
  });
}

/** Lepas klaim supaya percobaan berikutnya tidak terhalang kursi yang gagal. */
export async function releaseCheckoutClaim(claimId: string): Promise<void> {
  try {
    await callRpc("release_checkout_claim", { p_claim_id: claimId });
  } catch (err) {
    console.error("[CheckoutGate] gagal melepas klaim:", redactError(err));
  }
}

/**
 * F-W4-1: tandai klaim sudah DIBAYAR (dipanggil webhook pembayaran, kunci
 * `order_id`). Setelah ini nomor boleh membeli lagi; tanpa ini, order belum
 * dibayar dipakai ulang / memblokir paket lain.
 * Best effort: pembayaran yang sudah masuk tidak boleh gagal gara-gara ini.
 */
export async function markCheckoutClaimPaid(orderId: string, paidAt?: string): Promise<void> {
  try {
    await callRpc("mark_checkout_claim_paid", {
      p_order_id: String(orderId),
      p_paid_at: paidAt || null,
    });
  } catch (err) {
    console.error("[CheckoutGate] gagal menandai klaim dibayar:", redactError(err));
  }
}

/**
 * Profil hasil langkah 2–8, divalidasi ULANG dengan validator profil checkout.
 * Nomor di langkah 8 harus sama dengan nomor sesi terverifikasi (satu identitas).
 */
export function authoritativeProfile(steps: unknown, sessionPhone: string): {
  ok: boolean;
  errors: string[];
  name: string;
  profile: Record<string, unknown>;
} {
  const merged = mergedProfileFromSteps(steps);
  const errors = [...merged.errors];
  if (merged.phone && merged.phone !== sessionPhone) {
    errors.push("nomor di profil berbeda dengan nomor terverifikasi");
  }
  return {
    ok: errors.length === 0,
    errors,
    name: merged.name || "Kawan Thrivin",
    profile: (merged.profile || {}) as Record<string, unknown>,
  };
}
