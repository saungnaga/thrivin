/**
 * Kandidat perpanjangan/reaktivasi (kontrak §5).
 *
 * Aturan yang mengikat:
 *   - eligibility dihitung SERVER-side dari `expires_at`, bukan dari label UI;
 *   - non-aktif > 7×24 jam = kandidat; **tepat 7 hari = TIDAK eligible**
 *     (perbandingan strictly greater, bukan >=);
 *   - promo existing saja: kandidat dibaca dari tabel `promo_codes` (satu-satunya
 *     sumber kebenaran). TIDAK ada ledger/endpoint kedua dan TIDAK ada seed
 *     TEMENANLAGI di sini — baris promo-nya menunggu keputusan owner
 *     (`t_7bcb4487`). Kalau barisnya belum ada, kandidat = null: kami tidak
 *     menjanjikan angka yang tidak ada di sumber kebenaran;
 *   - harga yang ditampilkan = katalog server (`PLAN_CATALOG`), tidak pernah
 *     angka dari client, dan aktivasi/klaim TIDAK terjadi di sini.
 */
import { PLAN_CATALOG, type PlanKey } from "./plans.ts";
import { getSupabaseConfig, redactError, TENANT_ID } from "./onboarding-store.ts";
import type { SubscriptionState } from "./subscription-lookup.ts";

/** 7×24 jam, dalam milidetik. */
export const REACTIVATION_GAP_MS = 7 * 24 * 60 * 60 * 1000;

/** Kode kandidat; baris `promo_codes`-nya ditahan keputusan owner. */
export const REACTIVATION_CANDIDATE_CODE = "TEMENANLAGI";

export interface RenewalCandidate {
  code: string;
  discountType: "percentage" | "fixed" | "flat_price";
  amount: number;
  planKeys: string[];
}

export interface RenewalPlan {
  key: PlanKey;
  name: string;
  price: number;
  durationDays: number;
}

export interface RenewalInfo {
  /** true hanya kalau lunas-nya lebih tua dari 7×24 jam. */
  eligible: boolean;
  /** Non-aktif sama sekali (belum pernah berlangganan) tidak dapat kandidat. */
  candidate: RenewalCandidate | null;
  /** Katalog server — sumber satu-satunya untuk harga (client `amount` diabaikan). */
  plans: RenewalPlan[];
}

/**
 * Selisih > 7×24 jam. `expiresAt` persis 7 hari lalu → 168 jam → bukan > 168 jam
 * → TIDAK eligible (boundary yang diminta spec).
 */
export function isReactivationEligible(expiresAt: string | null, now: number = Date.now()): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return false;
  return now - parsed > REACTIVATION_GAP_MS;
}

export function catalogPlans(): RenewalPlan[] {
  return (Object.keys(PLAN_CATALOG) as PlanKey[]).map((key) => ({
    key,
    name: PLAN_CATALOG[key].name,
    price: PLAN_CATALOG[key].basePrice,
    durationDays: PLAN_CATALOG[key].durationDays,
  }));
}

/**
 * Baca baris promo kandidat dari sumber kebenaran. Mengembalikan null kalau
 * barisnya tidak ada / non-aktif / kedaluwarsa / tidak bisa dibaca (fail closed:
 * kandidat tidak ditawarkan kalau tidak terbukti ada).
 */
export async function loadRenewalCandidate(
  code: string = REACTIVATION_CANDIDATE_CODE,
  now: number = Date.now()
): Promise<RenewalCandidate | null> {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/promo_codes?tenant_id=eq.${encodeURIComponent(
        TENANT_ID
      )}&code=eq.${encodeURIComponent(code)}&is_active=is.true&select=code,discount_type,amount,plan_keys,expires_at&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    if (!res.ok) {
      console.error(`[Renewal] promo lookup failed: status=${res.status}`);
      return null;
    }
    const rows = (await res.json()) as Array<{
      code?: string;
      discount_type?: string;
      amount?: number | string;
      plan_keys?: string[];
      expires_at?: string | null;
    }>;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.code) return null;
    if (row.expires_at && Date.parse(row.expires_at) <= now) return null;
    const discountType = String(row.discount_type ?? "");
    if (!["percentage", "fixed", "flat_price"].includes(discountType)) return null;
    return {
      code: String(row.code),
      discountType: discountType as RenewalCandidate["discountType"],
      amount: Number(row.amount ?? 0),
      planKeys: Array.isArray(row.plan_keys) ? row.plan_keys : [],
    };
  } catch (err) {
    console.error("[Renewal] promo lookup error:", redactError(err));
    return null;
  }
}

/**
 * Info perpanjangan untuk sesi terverifikasi.
 *
 * `state` hanya dipakai untuk memutuskan apakah kandidat reaktivasi boleh
 * ditawarkan (`expired` saja). Nomor yang belum pernah berlangganan (`none`)
 * tidak menerima tawaran reaktivasi — sesuai "new vs active vs expired".
 */
export async function buildRenewalInfo(
  state: SubscriptionState,
  expiresAt: string | null,
  now: number = Date.now()
): Promise<RenewalInfo> {
  const eligible = state === "expired" && isReactivationEligible(expiresAt, now);
  return {
    eligible,
    candidate: eligible ? await loadRenewalCandidate(REACTIVATION_CANDIDATE_CODE, now) : null,
    plans: catalogPlans(),
  };
}
