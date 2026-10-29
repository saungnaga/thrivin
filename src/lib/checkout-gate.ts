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
import { getSupabaseConfig, isSupabaseConfigured, getOnboardingSnapshot, redactError } from "./onboarding-store.ts";
import {
  REQUIRED_STEPS,
  checkRequiredSteps,
  mergedProfileFromSteps,
  stepPayloadsFromProfile,
} from "./onboarding-steps.ts";
import { TERMS_VERSION } from "./consent.ts";
import { releasePendingPromoRedemptions } from "./promo.ts";
import { normalizePhone } from "./phone.ts";

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
  if (!isSupabaseConfigured()) {
    return { ok: true, status: "saved" };
  }
  const row = await callRpc("save_onboarding_step", { p_phone: phone, p_step: step, p_data: data });
  if (row?.status !== "saved") {
    throw new CheckoutGateError(`[CheckoutGate] save_onboarding_step: ${JSON.stringify(row)}`);
  }
  return { ok: true, status: String(row.status) };
}

/**
 * Pelanggan lama tanpa baris `onboarding_progress`: isi langkah 2–8 dari
 * snapshot order sebelumnya.
 *
 * Nomornya nomor SESI (bukan nomor dari body), isinya snapshot yang tersimpan di
 * server, dan tiap langkah tetap divalidasi validator yang sama. Gate TIDAK
 * dilonggarkan: sesudah ini pemanggil mengulang klaim dan aturan yang sama
 * berlaku. `false` = tidak ada snapshot yang lengkap ⇒ alur isi data.
 */
export async function seedProgressFromSnapshot(phone: string): Promise<boolean> {
  const snapshot = await getOnboardingSnapshot(phone);
  const seeded = stepPayloadsFromProfile(snapshot, phone);
  if (!seeded.ok) return false;
  for (const step of REQUIRED_STEPS) {
    await saveOnboardingStep(phone, step, seeded.payloads[step]);
  }
  return true;
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
  if (!isSupabaseConfigured()) {
    return {
      steps: {},
      stepReached: 9,
      complete: true,
      missingSteps: [],
      invalidSteps: [],
    };
  }
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
  if (!isSupabaseConfigured()) {
    return { status: "granted", claimId: "mock_claim_" + Date.now() };
  }
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
): Promise<{ status: string } | null> {
  if (!isSupabaseConfigured() || claimId.startsWith("mock_claim_")) return null;
  // C-4 (kartu t_bd4781a6): RPC menolak nomor order kosong dengan `invalid_order`
  // (tidak ada yang ditulis) — pemanggil harus tahu, kalau tidak klaimnya tinggal
  // `in_flight` dan nomor ini terkunci sampai TTL.
  return callRpc("complete_checkout_claim", {
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
  if (!isSupabaseConfigured() || claimId.startsWith("mock_claim_")) return;
  try {
    await callRpc("release_checkout_claim", { p_claim_id: claimId });
  } catch (err) {
    console.error("[CheckoutGate] gagal melepas klaim:", redactError(err));
  }
}

/**
 * Retire baris klaim yang belum lunas (created/in_flight/cancel_pending/cancel_failed)
 * untuk nomor tertentu, supaya pelanggan yang menekan tombol back di browser lalu checkout
 * lagi (atau ganti paket) tidak dihentikan oleh sistem.
 */
export async function retireUnpaidClaims(phone: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  try {
    // 1) Lepaskan juga reservasi promo 'reserved' yang belum lunas
    await releasePendingPromoRedemptions(phone);

    const { url, key } = rpcEndpoint();
    const tenant = encodeURIComponent(process.env.THRIVIN_TENANT_ID || 'thrivin');
    const cleanPhone = normalizePhone(phone) || phone;
    const phones = [cleanPhone];
    if (cleanPhone.startsWith('62')) {
      phones.push('0' + cleanPhone.slice(2));
    }

    // 2) RPC call
    try {
      await callRpc('retire_unpaid_claims', {
        p_phone: cleanPhone,
        p_tenant_id: process.env.THRIVIN_TENANT_ID || 'thrivin',
      });
    } catch {
      // Fall through to PostgREST PATCH if RPC is not deployed yet
    }

    // 3) PostgREST PATCH fallback for all phone representations
    for (const ph of phones) {
      try {
        await fetch(
          `${url}/rest/v1/checkout_claims?tenant_id=eq.${tenant}&phone=eq.${encodeURIComponent(
            ph
          )}&status=in.(created,cancel_pending,cancel_failed,in_flight)&paid_at=is.null`,
          {
            method: 'PATCH',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({
              status: 'retired',
              updated_at: new Date().toISOString(),
            }),
            cache: 'no-store',
          }
        );
      } catch {
        // continue
      }
    }
    return true;
  } catch (err) {
    console.error('[CheckoutGate] gagal me-retire klaim belum lunas:', redactError(err));
    return false;
  }
}

/**
 * F-W4-1: tandai klaim sudah DIBAYAR (dipanggil webhook pembayaran, kunci
 * `order_id`) **dan** jadikan fungsi itu gerbang entitlement (T1, t_5783e59e).
 *
 * Kenapa satu panggilan: webhook dulu mengaktifkan langganan lalu baru menilai
 * `mark_checkout_claim_paid` sebagai best-effort — hasil RPC-nya dibuang, jadi
 * order yang tidak pernah tercatat (`not_found`) atau dibayar di bawah harga
 * klaim tetap mengaktifkan paket (fallback `month`). Sekarang status RPC
 * DIPROPAGASIKAN dan pemanggil dilarang mengaktifkan apa pun kecuali `marked`.
 *
 * Sengaja TIDAK menebak: `not_found`/`phone_mismatch`/`amount_mismatch`/
 * `amount_unverifiable`/`invalid_order` semuanya berarti "jangan aktivasi".
 * Kegagalan transport = `error` (juga jangan aktivasi, dan jangan melempar ke
 * jalur webhook). Best effort yang tersisa hanyalah `paid_at` di dalam SQL.
 */
export type CheckoutClaimPayment =
  | {
      status: "marked";
      latePayment: boolean;
      state: string;
      planKey: string;
      amount: number | null;
    }
  | { status: "not_found" | "phone_mismatch" | "amount_mismatch" | "amount_unverifiable" | "invalid_order" }
  | { status: "error"; detail: string };

export async function markCheckoutClaimPaid(
  orderId: string,
  opts: { phone?: string | null; paidAmount?: number | null; paidAt?: string } = {}
): Promise<CheckoutClaimPayment> {
  let row: any;
  try {
    row = await callRpc("mark_checkout_claim_paid", {
      p_order_id: String(orderId),
      p_paid_at: opts.paidAt || null,
      p_phone: opts.phone || null,
      p_paid_amount: opts.paidAmount ?? null,
    });
  } catch (err) {
    console.error("[CheckoutGate] gagal menilai klaim pembayaran:", redactError(err));
    return { status: "error", detail: redactError(err) };
  }
  switch (row?.status) {
    case "marked":
      return {
        status: "marked",
        latePayment: row?.late_payment === true,
        state: String(row?.state || ""),
        planKey: String(row?.plan_key || ""),
        amount: row?.amount === null || row?.amount === undefined ? null : Number(row.amount),
      };
    case "not_found":
    case "phone_mismatch":
    case "amount_mismatch":
    case "amount_unverifiable":
    case "invalid_order":
      return { status: row.status };
    default:
      return { status: "error", detail: JSON.stringify(row) };
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
