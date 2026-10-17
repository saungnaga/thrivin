/**
 * Lookup langganan server-side (kontrak §4) — least fields, gagal-tertutup.
 *
 * Dipanggil HANYA setelah sesi terverifikasi. Jalurnya:
 *   route -> PostgREST (service_role) -> RPC `subscription_status_for_owner`
 * yang mengembalikan {state, expires_at, last_plan_key} dan TIDAK menulis.
 *
 * `check_subscription()` sengaja tidak dipakai: ia (a) tidak mengembalikan
 * `expires_at` sehingga "sisa masa aktif" tidak bisa ditampilkan, (b) menulis
 * `UPDATE subscriptions SET status='expired'` di jalur BACA, dan (c) mengembalikan
 * token_used/token_limit/plan_name yang bukan kebutuhan UI pelanggan.
 *
 * Fail closed: error upstream → lempar. Pemanggil TIDAK boleh mengubahnya jadi
 * "nomor baru" atau menampilkan status kosong.
 */
import { getSupabaseConfig, redactError } from "./onboarding-store.ts";

export type SubscriptionState = "none" | "active" | "expired";

export interface SubscriptionStatus {
  state: SubscriptionState;
  /** ISO-8601, `expires_at` TERBARU untuk nomor ini. */
  expiresAt: string | null;
  lastPlanKey: string | null;
}

export class SubscriptionLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionLookupError";
  }
}

export async function lookupSubscriptionStatus(phone: string): Promise<SubscriptionStatus> {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new SubscriptionLookupError(
      "[SubscriptionLookup] SUPABASE_URL / service-role key tidak dikonfigurasi — lookup ditolak."
    );
  }

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/subscription_status_for_owner`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_phone: phone }),
      cache: "no-store",
    });
  } catch (err) {
    throw new SubscriptionLookupError(
      `[SubscriptionLookup] Upstream tidak bisa dihubungi: ${redactError(err)}`
    );
  }

  if (!res.ok) {
    const detail = redactError(await res.text().catch(() => ""));
    throw new SubscriptionLookupError(
      `[SubscriptionLookup] RPC gagal: status=${res.status} ${detail}`
    );
  }

  const row = (await res.json().catch(() => null)) as {
    state?: string;
    expires_at?: string | null;
    last_plan_key?: string | null;
  } | null;

  const state = row?.state;
  if (state !== "none" && state !== "active" && state !== "expired") {
    // Bentuk jawaban tak dikenal = tidak bisa dipercaya → jangan tampilkan status.
    throw new SubscriptionLookupError(
      `[SubscriptionLookup] Bentuk jawaban tidak dikenal: ${JSON.stringify(row)}`
    );
  }

  return {
    state,
    expiresAt: row?.expires_at ?? null,
    lastPlanKey: row?.last_plan_key ?? null,
  };
}
