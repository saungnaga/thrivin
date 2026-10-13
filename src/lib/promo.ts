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
  | "exhausted";

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

/** Tautkan reservasi ke order Scalev supaya pembayaran bisa meng-consume-nya. */
export async function attachPromoOrder(redemptionId: string, orderRef: string): Promise<void> {
  if (!redemptionId || !orderRef) return;
  try {
    const { url, key } = getSupabaseConfig();
    if (!url || !key) return;
    await fetch(
      `${url}/rest/v1/promo_redemptions?id=eq.${encodeURIComponent(
        redemptionId
      )}&tenant_id=eq.${encodeURIComponent(TENANT_ID)}`,
      {
        method: "PATCH",
        headers: { ...serviceHeaders(key), Prefer: "return=minimal" },
        body: JSON.stringify({ order_ref: orderRef }),
      }
    );
  } catch (err) {
    console.warn("[PromoStore] attachPromoOrder failed:", redactError(err));
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

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push("Nilai diskon harus angka lebih besar dari 0.");
  } else if (discountType === "percentage" && amount > 100) {
    errors.push("Diskon persentase maksimal 100.");
  } else if ((discountType === "fixed" || discountType === "flat_price") && amount > 100_000_000) {
    errors.push("Nilai diskon rupiah terlalu besar.");
  }

  let planKeys: string[] = [];
  if (body.plan_keys !== undefined && body.plan_keys !== null && body.plan_keys !== "") {
    if (!Array.isArray(body.plan_keys)) {
      errors.push("plan_keys harus array.");
    } else {
      planKeys = body.plan_keys.map((p) => String(p));
      const unknown = planKeys.filter((p) => !PROMO_PLANS.includes(p as never));
      if (unknown.length > 0) errors.push(`Paket tidak dikenal: ${unknown.join(", ")}.`);
    }
  }

  let maxRedemptions: number | null = null;
  if (
    body.max_redemptions !== undefined &&
    body.max_redemptions !== null &&
    body.max_redemptions !== ""
  ) {
    const quota = Number(body.max_redemptions);
    if (!Number.isInteger(quota) || quota < 0) {
      errors.push("Kuota harus bilangan bulat >= 0 (kosongkan untuk tanpa kuota).");
    } else {
      maxRedemptions = quota;
    }
  }

  let expiresAt: string | null = null;
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== "") {
    const parsed = Date.parse(String(body.expires_at));
    if (!Number.isFinite(parsed)) {
      errors.push("Tanggal kedaluwarsa tidak valid.");
    } else {
      expiresAt = new Date(parsed).toISOString();
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      code: code as string,
      discount_type: discountType as DiscountType,
      amount,
      plan_keys: planKeys,
      max_redemptions: maxRedemptions,
      expires_at: expiresAt,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    },
  };
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