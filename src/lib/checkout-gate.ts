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
  | { status: "already_paid"; claimId: string }
  | { status: "in_flight" }
  | { status: "cancel_pending"; claimId: string }
  | { status: "cancel_failed"; claimId: string }
  | { status: "checkout_reconciliation"; claimId: string }
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
    case "already_paid":
      // W4RX4 T2: order di balik kunci ini sudah LUNAS. Tidak ada orderId /
      // paymentUrl yang dikembalikan — link bayar order lunas tidak boleh
      // sampai ke UI (UI langsung redirect ke `paymentUrl`).
      return { status: "already_paid", claimId: String(row.claim_id || "") };
    case "in_flight":
      return { status: "in_flight" };
    case "cancel_pending":
      return { status: "cancel_pending", claimId: String(row.claim_id || "") };
    case "cancel_failed":
      return { status: "cancel_failed", claimId: String(row.claim_id || "") };
    case "checkout_reconciliation":
      // M-2: baris `created` yang order/link-nya tidak lengkap. Jangan karang
      // link; tahan sampai ops menyelesaikan rekonsiliasi.
      return { status: "checkout_reconciliation", claimId: String(row.claim_id || "") };
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
  amount?: number,
  scalevOrderUuid?: string | null
): Promise<void> {
  await callRpc("complete_checkout_claim", {
    p_claim_id: claimId,
    p_order_id: orderId,
    p_payment_url: paymentUrl,
    p_amount: amount ?? null,
    // F-W4-1c: canonical UUID (`orderData.id`) — SATU-SATUNYA nilai yang diterima
    // endpoint cancel. Nomor bisnis (`orderId`) tetap dipakai join webhook.
    p_scalev_order_uuid: scalevOrderUuid ?? null,
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
 * F-W4-1c: kalau order itu sudah `retired` / sedang-gagal dicancel, pembayaran
 * ini TELAT — akses tetap diberikan (dedup `fulfillment_key` yang menentukan),
 * tapi hasilnya ditandai `latePayment` supaya pemanggil bisa mengangkat alert.
 * Best effort: pembayaran yang sudah masuk tidak boleh gagal gara-gara ini.
 */
export async function markCheckoutClaimPaid(
  orderId: string,
  paidAt?: string
): Promise<{ latePayment: boolean; state: string }> {
  try {
    const row = await callRpc("mark_checkout_claim_paid", {
      p_order_id: String(orderId),
      p_paid_at: paidAt || null,
    });
    return { latePayment: row?.late_payment === true, state: String(row?.state || "") };
  } catch (err) {
    console.error("[CheckoutGate] gagal menandai klaim dibayar:", redactError(err));
    return { latePayment: false, state: "" };
  }
}

export interface CancelClaim {
  claimId: string;
  scalevOrderUuid: string | null;
  orderId?: string | null;
  cancelAttempts?: number;
}

/**
 * Klaim attempt cancel (M-3): atomik + lease + `paid_at IS NULL`. `not_claimed`
 * berarti jangan kirim HTTP cancel (sudah dipegang worker lain, sudah dibayar,
 * atau status barisnya berubah).
 */
export async function claimCheckoutCancel(claimId: string): Promise<
  ({ status: "claimed" } & CancelClaim) | { status: "not_claimed" }
> {
  const row = await callRpc("claim_checkout_cancel", { p_claim_id: claimId });
  if (row?.status !== "claimed") return { status: "not_claimed" };
  return {
    status: "claimed",
    claimId: String(row.claim_id),
    scalevOrderUuid: row.scalev_order_uuid ? String(row.scalev_order_uuid) : null,
    orderId: row.order_id ? String(row.order_id) : null,
    cancelAttempts: Number(row.cancel_attempts ?? 0),
  };
}

/** Catat hasil cancel (`retired` | `cancel_pending` | `cancel_failed`). Non-throwing. */
export async function recordCheckoutCancelResult(
  claimId: string,
  result: "retired" | "cancel_pending" | "cancel_failed",
  error?: string
): Promise<{ status: string; state: string }> {
  try {
    const row = await callRpc("record_checkout_cancel_result", {
      p_claim_id: claimId,
      p_result: result,
      p_error: error ? error.slice(0, 200) : null,
    });
    // V-5: `state` yang DIKEMBALIKAN RPC = keadaan sesudah ditulis. Pemanggil
    // menghitung laporan dari sini, bukan dari niatnya sendiri: RPC bisa menjawab
    // `late_payment` (baris dibayar di tengah attempt) dan state-nya tetap
    // `cancel_pending` walau worker mengira "retired".
    return { status: String(row?.status || ""), state: String(row?.state || "") };
  } catch (err) {
    console.error("[CheckoutGate] gagal mencatat hasil cancel:", redactError(err));
    return { status: "error", state: "" };
  }
}

/**
 * V-1: nominasi baris `created` yang lewat TTL menjadi antrean cancel.
 * Step 3b hanya bersifat lazy (jalan kalau pelanggan checkout lagi), jadi order
 * yang ditinggalkan tidak pernah masuk antrean — dipanggil sweep SEBELUM klaim.
 * Nol HTTP Scalev (SQL hanya memindahkan state).
 */
export async function nominateStaleCancels(
  limit = 200
): Promise<{ nominated: number; missingId: number }> {
  const row = await callRpc("nominate_stale_cancels", {
    p_tenant_id: process.env.THRIVIN_TENANT_ID || "thrivin",
    p_limit: limit,
    // p_unpaid_ttl_seconds sengaja TIDAK dikirim: TTL 60 menit punya satu rumah
    // di SQL (DEFAULT), bukan disalin ke TS supaya tidak bisa menyimpang.
  });
  return { nominated: Number(row?.nominated ?? 0), missingId: Number(row?.missing_id ?? 0) };
}

/**
 * Baris yang menunggu cancel untuk satu nomor (atau semua nomor kalau `phone`
 * kosong — dipakai sweep terjadwal). Hanya id + canonical UUID: tidak ada PII.
 *
 * V-3/V-4: filter lease/backoff SENGAJA TIDAK di sini. Satu-satunya gerbang yang
 * mengikat adalah `claim_checkout_cancel` (atomik, satu transaksi): kalau listing
 * ikut menyaring, sapuan bisa melaporkan "tidak ada yang perlu dicancel" padahal
 * barisnya hanya sedang menunggu backoff ⇒ `resolvedAll` bohong dan replacement
 * tercetak di belakang link lama. Baris yang tidak bisa diklaim dilaporkan
 * sebagai `pending` (fail-closed).
 */
export async function listPendingCancels(phone: string): Promise<CancelClaim[]> {
  const { url, key } = rpcEndpoint();
  const tenant = encodeURIComponent(process.env.THRIVIN_TENANT_ID || "thrivin");
  const filter = phone ? `&phone=eq.${encodeURIComponent(phone)}` : "";
  const res = await fetch(
    `${url}/rest/v1/checkout_claims?tenant_id=eq.${tenant}${filter}` +
      `&status=eq.cancel_pending&paid_at=is.null&select=id,scalev_order_uuid&order=created_at.asc&limit=200`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new CheckoutGateError(`[CheckoutGate] baca antrean cancel gagal (${res.status})`);
  }
  const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    claimId: String(row.id),
    scalevOrderUuid: row.scalev_order_uuid ? String(row.scalev_order_uuid) : null,
  }));
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
