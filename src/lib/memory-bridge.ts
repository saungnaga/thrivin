/**
 * Bridge: salurkan data onboarding pelanggan ke tabel memori Nina.
 *
 * Rantai yang rusak: web menulis `users.onboarding_data`, Nina membaca tabel
 * `memories` (plugins/nina-memory/store.py) — tidak ada yang menyambung, jadi
 * Nina tetap menanyakan umur/BB/TB yang sudah diisi pelanggan di web.
 *
 * Tulisnya lewat RPC SECURITY DEFINER, bukan REST langsung ke `memories`,
 * karena `service_role` (kunci yang dipegang server web) memang TIDAK punya
 * grant di tabel itu — keputusan keamanan Atlas (migration-002).
 *
 * Kontrak: best-effort. Saat fungsi ini jalan, langganan pelanggan sudah sah
 * dan aktif — jadi kegagalan memori TIDAK BOLEH menggagalkan aktivasi. Semua
 * error ditelan jadi `{ ok: false }` + satu warn. Nomor penuh dan isi memori
 * tidak pernah dicatat.
 */
import { normalizePhone } from "./phone.ts";
import { getSupabaseConfig, redactError } from "./onboarding-store.ts";

export interface MemorySeedResult {
  ok: boolean;
  /** Jumlah fakta yang ditulis (upsert) oleh RPC; undefined kalau panggilan gagal. */
  seeded?: number;
}

export async function seedNinaMemory(phone: string): Promise<MemorySeedResult> {
  try {
    const cleanPhone = normalizePhone(phone);
    const { url, key } = getSupabaseConfig();
    if (!cleanPhone || !url || !key) return { ok: false };

    const res = await fetch(`${url}/rest/v1/rpc/seed_nina_memory_from_onboarding`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_phone: cleanPhone }),
    });

    if (!res.ok) {
      console.warn(`[MemoryBridge] RPC seed ditolak: status=${res.status}`);
      return { ok: false };
    }

    const seeded = await res.json();
    return { ok: true, seeded: typeof seeded === "number" ? seeded : undefined };
  } catch (err) {
    // Termasuk ConfigError dari getSupabaseConfig: konfigurasi rusak bukan
    // alasan membatalkan langganan yang sudah dibayar.
    console.warn(
      "[MemoryBridge] Gagal menyalurkan memori (aktivasi tidak terpengaruh):",
      redactError(err)
    );
    return { ok: false };
  }
}
