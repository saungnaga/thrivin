/**
 * Fakta & versi dokumen legal (A6/A7) — SATU tempat, tanpa impor Node.
 *
 * Nilai di sini = keputusan owner 16/10 (ringkas 19 keputusan, kartu W2
 * t_e8d57ab3). Sengaja terpisah dari `consent.ts` supaya komponen klien
 * (halaman checkout) bisa membaca versi yang ditampilkan tanpa ikut menyeret
 * modul server (fs).
 *
 * Jangan menambah klaim kepatuhan hukum / angka retensi / nama pihak ketiga
 * lain di sini tanpa keputusan owner baru — yang belum diputuskan tidak ditulis.
 */

/** Versi dokumen `/terms` yang ditampilkan & dicatat (keputusan no. 14). */
export const TERMS_VERSION = "terms-2026-10-15-v1";
/** Versi teks opt-in pengingat (CONSENT-2). */
export const REMINDER_OPTIN_VERSION = "reminder-optin-2026-10-15-v1";
export const LEGAL_LAST_UPDATED = "16 Oktober 2026";

/**
 * Entitas penyedia layanan: cukup nama bisnis. Nama orang & alamat sengaja
 * TIDAK ditampilkan di dokumen publik (keputusan pemilik 20/10/2026).
 * ponytail: begitu bentuk badan hukum resmi (PT/CV) + alamat usaha keluar,
 * tambahkan di sini — jangan mengarang.
 */
export const LEGAL_ENTITY = "Thrivin";
/** Versi dokumen /privacy — TERPISAH dari versi /terms (dua dokumen, dua riwayat). */
export const PRIVACY_VERSION = "privacy-2026-10-20-v1";
export const PRIVACY_LAST_UPDATED = "20 Oktober 2026";
/** Keputusan no. 18. */
export const CS_WHATSAPP = "6287788141388";
export const CS_HOURS = "09.00–21.00 WIB";
export const CS_WA_LINK =
  "https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20butuh%20bantuan";
/** Keputusan no. 19. */
export const JURISDICTION = "Indonesia";
/** Keputusan no. 16: kwitansi berhenti pengingat lewat kata kunci. */
export const STOP_KEYWORDS = "BERHENTI";

/** Link dokumen yang dipakai footer + checkout + halaman legal. */
export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";
