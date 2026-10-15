/**
 * Transport pengiriman OTP — SATU pintu, mock-only untuk sekarang.
 *
 * Kenapa cuma mock: kontrak §10 menetapkan semua kirim WhatsApp lewat
 * `sendWhatsApp()` di worktree `channel-sender-ws` (belum ada di RC), dan
 * provider/allowlist OTP masih keputusan owner (`open_decisions`). Jadi di
 * sini TIDAK ada panggilan Graph/Cloud/Baileys sama sekali — kalau
 * `WA_OTP_PROVIDER` tidak di-set (atau di-set ke nilai yang tidak dikenal),
 * pengiriman DITOLAK dan endpoint menjawab generik tanpa memberi tahu apa pun.
 *
 * BLOCKED-LIVE: menyambungkan provider nyata = keputusan owner + review
 * Sentinel; implementasinya cukup `sendWhatsApp(phone, text)` di provider baru.
 */
import { maskedPhone } from "./welcome-message.ts";

export interface OtpProvider {
  readonly name: string;
  /** Kirim kode ke nomor (sudah dinormalisasi 62…). Melempar kalau gagal. */
  send(phone: string, code: string, ttlSeconds: number): Promise<void>;
}

/**
 * Mock provider: tidak ada outbound apa pun. Kalau `WA_OTP_MOCK_SINK` di-set,
 * kode ditulis ke file itu supaya harness bisa menyelesaikan alur verifikasi
 * end-to-end. Hanya aktif kalau provider-nya memang 'mock'.
 */
function mockProvider(sink: string | undefined): OtpProvider {
  return {
    name: "mock",
    async send(phone, code, ttlSeconds) {
      console.info(
        `[wa-otp:mock] kode untuk ${maskedPhone(phone)} berlaku ${ttlSeconds}s (tidak dikirim)`
      );
      if (!sink) return;
      const fs = await import("fs");
      fs.appendFileSync(
        sink,
        JSON.stringify({ phone, code, at: new Date().toISOString() }) + "\n"
      );
    },
  };
}

/** null = tidak ada transport yang diotorisasi → pemanggil harus gagal-tertutup. */
export function getOtpProvider(): OtpProvider | null {
  const kind = String(process.env.WA_OTP_PROVIDER || "").toLowerCase();
  if (kind === "mock") return mockProvider(process.env.WA_OTP_MOCK_SINK);
  return null;
}
