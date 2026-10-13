/**
 * Server-side promo code store.
 *
 * Promo dipindah dari konstanta di `lib/plans.ts` ke tabel Supabase supaya bisa
 * dibuat / diubah / dimatikan dari dashboard tanpa deploy, dan supaya kuota
 * benar-benar bisa habis (global, kedaluwarsa, non-aktif, 1x per nomor).
 *
 * Klaim kuota TIDAK dilakukan di sini: satu-satunya jalur klaim adalah RPC
 * `redeem_promo()` di `staging/schema-promo-codes.sql` yang mengunci baris promo
 * (`FOR UPDATE`) sebelum menghitung pemakaian. Membaca tabel lalu menulis dari TS
 * akan membuka celah race, jadi jangan.
 */
import { getSupabaseConfig, TENANT_ID, ConfigError, redactError } from "./onboarding-store";

export type DiscountType = "percentage" | "fixed" | "flat_price";

export interface PromoCode {
  id: string;
  code: string;
  discount_type: DiscountType;
  amount: number;
  plan_keys: string[];
  max_redemptions: number | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  used_count: number;
  remaining: number | null;
}

export type RedeemStatus =
  | "ok"
  | "invalid_code"
  | "unknown_code"
  | "inactive"
  | "expired"
  | "plan_not_eligible"
  | "already_used"
  | "exhausted"
  /** Order Scalev sudah tercetak untuk nomor ini tapi belum dibayar (V-1). */
  | "pending_order";

export interface RedeemResult {
  status: RedeemStatus;
  code: string;
  discount: number;
  finalPrice: number;
  redemptionId: string | null;
  message: string;
}

export const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;
export const PROMO_CODE_MAX_LENGTH = 64;
export const PROMO_PLANS = ["month", "quarter", "half", "year"] as const;

/**
 * Satu normaliser untuk semua jalur masuk (checkout, dashboard, seed). Input
 * yang tidak berbentuk kode promo ditolak (null), tidak "dibersihkan" diam-diam
 * jadi kode lain.
 */
export function normalizePromoCode(raw: unknown): string | null {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!code) return null;
  if (!PROMO_CODE_PATTERN.test(code)) return null;
  return code;
}

function serviceHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Fail closed: tanpa Supabase tidak ada sumber kebenaran promo, jadi promo
 * ditolak — bukan "diam-diam harga penuh".
 */
function requirePromoStore(): { url: string; key: string } {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new ConfigError(
      "[PromoStore] Kode promo butuh Supabase (promo_codes). SUPABASE_URL + " +
        "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi."
    );
  }
  return { url, key };
}

export function isPromoStoreConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

interface RedeemOptions {
  code: unknown;
  phone: string;
  planKey: string;
  /** Harga katalog server (bukan angka dari browser). */
  revenue: number;
  /** true = hanya cek, tidak memakai kuota (untuk tombol "Terapkan"). */
  dryRun?: boolean;
  actor?: string | null;
}

export async function redeemPromo(opts: RedeemOptions): Promise<RedeemResult> {
  const code = normalizePromoCode(opts.code);
  if (!code) {
    return {
      status: "invalid_code",
      code: String(opts.code ?? ""),
      discount: 0,
      finalPrice: opts.revenue,
      redemptionId: null,
      message: "Format kode promo tidak valid.",
    };
  }

  const { url, key } = requirePromoStore();
  const res = await fetch(`${url}/rest/v1/rpc/redeem_promo`, {
    method: "POST",
    headers: serviceHeaders(key),
    body: JSON.stringify({
      p_code: code,
      p_phone: opts.phone,
      p_plan_key: opts.planKey,
      p_revenue: opts.revenue,
      p_dry_run: Boolean(opts.dryRun),
      p_actor: opts.actor ?? null,
      p_tenant_id: TENANT_ID,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[PromoStore] redeem_promo failed: ${res.status} ${redactError(errText)}`);
  }

  const rows = (await res.json()) as Array<Record<string, unknown>>;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    throw new Error("[PromoStore] redeem_promo returned no row");
  }

  return {
    status: (row.status as RedeemStatus) ?? "unknown_code",
    code: String(row.promo_code ?? code),
    discount: Number(row.discount ?? 0),
    finalPrice: Number(row.final_price ?? opts.revenue),
    redemptionId: (row.redemption_id as string) ?? null,
    message: String(row.message ?? ""),
  };
}

/** Checkout gagal setelah kuota diklaim -> kuota dikembalikan. Best effort. */
export async function releasePromo(redemptionId: string): Promise<void> {
  if (!redemptionId) return;
  try {
    const { url, key } = getSupabaseConfig();
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/rpc/release_promo`, {
      method: "POST",
      headers: serviceHeaders(key),
      body: JSON.stringify({ p_redemption_id: redemptionId, p_tenant_id: TENANT_ID }),
      cache: "no-store",
    });
  } catch (err) {
    console.warn("[PromoStore] release_promo failed:", redactError(err));
  }
}

/**
 * Pembayaran diterima -> reservasi jadi 'consumed' (kunci 1x per nomor).
 * Tidak pernah melempar ke jalur webhook.
 */
export async function consumePromoForOrder(orderRef: string): Promise<void> {
  if (!orderRef) return;
  try {
    const { url, key } = getSupabaseConfig();
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/rpc/consume_promo_for_order`, {
      method: "POST",
      headers: serviceHeaders(key),
      body: JSON.stringify({ p_order_ref: orderRef, p_tenant_id: TENANT_ID }),
      cache: "no-store",
    });
  } catch (err) {
    console.warn("[PromoStore] consume_promo_for_order failed:", redactError(err));
  }
}

/**
 * Tautkan reservasi ke order Scalev supaya pembayaran bisa meng-consume-nya.
 *
 * C-6: dulu kegagalan di-swallow dan `return=minimal` membuat "0 baris
 * ter-update" tidak terlihat sama sekali — webhook lalu tidak bisa consume
 * (audit trail bolong) dan slot nyangkut sampai sweep. Sekarang hasilnya
 * dilaporkan: true HANYA kalau benar-benar ada baris yang ter-update.
 * Tidak melempar — pemanggil yang memutuskan apa artinya kegagalan itu.
 */
export async function attachPromoOrder(redemptionId: string, orderRef: string): Promise<boolean> {
  if (!redemptionId || !orderRef) return false;
  let url: string;
  let key: string;
  try {
    ({ url, key } = getSupabaseConfig());
  } catch (err) {
    console.warn("[PromoStore] attachPromoOrder: promo store unavailable:", redactError(err));
    return false;
  }
  if (!url || !key) return false;

  const target = `${url}/rest/v1/promo_redemptions?id=eq.${encodeURIComponent(
    redemptionId
  )}&tenant_id=eq.${encodeURIComponent(TENANT_ID)}`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(target, {
        method: "PATCH",
        headers: { ...serviceHeaders(key), Prefer: "return=representation" },
        body: JSON.stringify({ order_ref: orderRef }),
      });
      if (res.ok) {
        const rows = (await res.json().catch(() => [])) as unknown[];
        if (Array.isArray(rows) && rows.length > 0) return true;
        // 2xx tapi nol baris = reservasi tidak ada / sudah released. Retry tidak
        // akan mengubahnya, jadi jangan buang waktu.
        console.warn(
          `[PromoStore] attachPromoOrder matched 0 rows (order=${orderRef}) — redemption tidak terikat`
        );
        return false;
      }
      console.warn(
        `[PromoStore] attachPromoOrder failed: status=${res.status} order=${orderRef} attempt=${attempt}`
      );
    } catch (err) {
      console.warn(
        `[PromoStore] attachPromoOrder error: ${redactError(err)} order=${orderRef} attempt=${attempt}`
      );
    }
  }
  return false;
}

/**
 * C-6: order sudah tercetak di Scalev tapi attach gagal. Tandai baris supaya
 * sweep TTL tidak melepas kursi yang ordernya masih bisa dibayar. Best effort —
 * kursinya sudah ditahan oleh status 'reserved' apa pun hasil pemanggilan ini;
 * yang hilang kalau ini gagal hanyalah pengecualian dari sweep (dicatat di log).
 */
export async function flagPromoReconcile(redemptionId: string): Promise<boolean> {
  if (!redemptionId) return false;
  try {
    const { url, key } = getSupabaseConfig();
    if (!url || !key) return false;
    const res = await fetch(`${url}/rest/v1/rpc/flag_promo_reconcile`, {
      method: "POST",
      headers: serviceHeaders(key),
      body: JSON.stringify({ p_redemption_id: redemptionId, p_tenant_id: TENANT_ID }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[PromoStore] flag_promo_reconcile failed: ${res.status} redemption=${redemptionId}`
      );
      return false;
    }
    const flagged = Boolean(await res.json().catch(() => false));
    if (!flagged) {
      console.error(
        `[PromoStore] flag_promo_reconcile matched 0 rows — redemption ${redemptionId} masih bisa ke-sweep`
      );
    }
    return flagged;
  } catch (err) {
    console.error("[PromoStore] flag_promo_reconcile error:", redactError(err));
    return false;
  }
}

/** Daftar promo untuk dashboard (terpakai + sisa dihitung view, bukan counter). */
export async function listPromos(): Promise<PromoCode[]> {
  const { url, key } = requirePromoStore();
  const res = await fetch(
    `${url}/rest/v1/v_promo_codes?tenant_id=eq.${encodeURIComponent(
      TENANT_ID
    )}&order=created_at.desc`,
    { headers: { ...serviceHeaders(key), Accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[PromoStore] list failed: ${res.status} ${redactError(errText)}`);
  }
  const rows = (await res.json()) as PromoCode[];
  return Array.isArray(rows) ? rows : [];
}

export interface PromoWriteInput {
  code: string;
  discount_type: DiscountType;
  amount: number;
  plan_keys: string[];
  max_redemptions: number | null;
  expires_at: string | null;
  is_active: boolean;
}

export type ValidationResult =
  | { ok: true; value: PromoWriteInput }
  | { ok: false; errors: string[] };

/**
 * Validasi server-side (B-2 spirit: form browser bukan kontrol). Dipakai oleh
 * API dashboard, bukan hanya oleh UI.
 */
export function validatePromoInput(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["Body harus berupa objek JSON."] };
  }
  const body = raw as Record<string, unknown>;

  const code = normalizePromoCode(body.code);
  if (!code) {
    errors.push("Kode promo harus 3-64 karakter: huruf/angka/underscore/strip.");
  }

  const discountType = String(body.discount_type ?? "");
  if (!["percentage", "fixed", "flat_price"].includes(discountType)) {
    errors.push("Tipe diskon harus percentage, fixed, atau flat_price.");
  }

  const amount = checkAmount(discountType, body.amount, errors);

  const planKeys = checkPlanKeys(body.plan_keys, errors);
  const maxRedemptions = checkQuota(body.max_redemptions, errors);
  const expiresAt = checkExpiry(body.expires_at, errors);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      code: code as string,
      discount_type: discountType as DiscountType,
      amount: amount as number,
      plan_keys: planKeys,
      max_redemptions: maxRedemptions,
      expires_at: expiresAt,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    },
  };
}

/**
 * PATCH: hanya field yang dikirim yang divalidasi. `code` tidak boleh diubah
 * (audit riwayat lebih ribet daripada manfaatnya) — ditolak, bukan diabaikan.
 */
export function validatePromoPatch(
  raw: unknown
): { ok: true; value: Omit<PromoWriteInput, "code"> } | { ok: false; errors: string[] } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["Body harus berupa objek JSON."] };
  }
  const body = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (body.code !== undefined) {
    errors.push("Kode promo tidak bisa diubah. Buat kode baru kalau perlu.");
  }

  const value: Partial<Omit<PromoWriteInput, "code">> = {};
  if (body.discount_type !== undefined) {
    const type = String(body.discount_type);
    if (!["percentage", "fixed", "flat_price"].includes(type)) {
      errors.push("Tipe diskon harus percentage, fixed, atau flat_price.");
    } else {
      value.discount_type = type as DiscountType;
    }
  }
  if (body.amount !== undefined) {
    const type = String(body.discount_type ?? "percentage");
    const amount = checkAmount(type, body.amount, errors);
    if (amount !== null) value.amount = amount;
  }
  if (body.plan_keys !== undefined) value.plan_keys = checkPlanKeys(body.plan_keys, errors);
  if (body.max_redemptions !== undefined) {
    value.max_redemptions = checkQuota(body.max_redemptions, errors);
  }
  if (body.expires_at !== undefined) value.expires_at = checkExpiry(body.expires_at, errors);
  if (body.is_active !== undefined) value.is_active = Boolean(body.is_active);

  if (errors.length > 0) return { ok: false, errors };
  if (Object.keys(value).length === 0) {
    return { ok: false, errors: ["Tidak ada field yang bisa diubah."] };
  }
  return { ok: true, value: value as Omit<PromoWriteInput, "code"> };
}

function checkAmount(type: string, raw: unknown, errors: string[]): number | null {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push("Nilai diskon harus angka lebih besar dari 0.");
    return null;
  }
  if (type === "percentage" && amount > 100) {
    errors.push("Diskon persentase maksimal 100.");
    return null;
  }
  if ((type === "fixed" || type === "flat_price") && amount > 100_000_000) {
    errors.push("Nilai diskon rupiah terlalu besar.");
    return null;
  }
  return amount;
}

function checkPlanKeys(raw: unknown, errors: string[]): string[] {
  if (raw === undefined || raw === null || raw === "") return [];
  if (!Array.isArray(raw)) {
    errors.push("plan_keys harus array.");
    return [];
  }
  const planKeys = raw.map((p) => String(p));
  const unknown = planKeys.filter((p) => !PROMO_PLANS.includes(p as never));
  if (unknown.length > 0) errors.push(`Paket tidak dikenal: ${unknown.join(", ")}.`);
  return planKeys;
}

function checkQuota(raw: unknown, errors: string[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const quota = Number(raw);
  if (!Number.isInteger(quota) || quota < 0) {
    errors.push("Kuota harus bilangan bulat >= 0 (kosongkan untuk tanpa kuota).");
    return null;
  }
  return quota;
}

function checkExpiry(raw: unknown, errors: string[]): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Date.parse(String(raw));
  if (!Number.isFinite(parsed)) {
    errors.push("Tanggal kedaluwarsa tidak valid.");
    return null;
  }
  return new Date(parsed).toISOString();
}

export async function createPromo(
  input: PromoWriteInput,
  actor: string | null
): Promise<PromoCode[]> {
  const { url, key } = requirePromoStore();
  const res = await fetch(
    `${url}/rest/v1/promo_codes?on_conflict=tenant_id,code&select=id,code`,
    {
      method: "POST",
      headers: {
        ...serviceHeaders(key),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        code: input.code,
        discount_type: input.discount_type,
        amount: input.amount,
        plan_keys: input.plan_keys,
        max_redemptions: input.max_redemptions,
        expires_at: input.expires_at,
        is_active: input.is_active,
        created_by: actor,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[PromoStore] create failed: ${res.status} ${redactError(errText)}`);
  }
  return (await res.json()) as PromoCode[];
}

/**
 * Update terbatas: kode, tipe, dan nilai langsung tidak diubah lewat dashboard
 * (audit lebih ribet daripada benefitnya). Ubah kuota/kedaluwarsa/aktif/harga
 * diperbolehkan — `amount` ikut supaya promo bisa dikoreksi tanpa drop tabel.
 */
export async function updatePromo(
  id: string,
  patch: Partial<PromoWriteInput>,
  actor: string | null
): Promise<boolean> {
  const { url, key } = requirePromoStore();
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of [
    "discount_type",
    "amount",
    "plan_keys",
    "max_redemptions",
    "expires_at",
    "is_active",
  ] as const) {
    if (field in patch) body[field] = patch[field];
  }
  if (actor) body.created_by = actor;

  const res = await fetch(
    `${url}/rest/v1/promo_codes?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(
      TENANT_ID
    )}`,
    {
      method: "PATCH",
      headers: { ...serviceHeaders(key), Prefer: "return=representation" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[PromoStore] update failed: ${res.status} ${redactError(errText)}`);
  }
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}