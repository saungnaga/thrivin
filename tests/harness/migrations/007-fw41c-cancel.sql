-- ============================================================================
-- Migration: F-W4-1c — cancel order Scalev saat TTL retire (ADITIF)
-- Divisi: Thrivin (Forge) · kartu t_1d1cf77f · review Sentinel t_c0163b18
-- Tanggal: 2026-10-17
-- Sumber kontrak: ~/obsidian/kantor-ai/projects/thrivin/security/F-W4-1c-ops-decision-ttl-scalev.md
--
-- ISI: kolom audit cancel + canonical ID, pelebaran CHECK status (3 → 6 nilai),
-- penjaga per-nomor & index idempotensi yang diperluas. Murni ADITIF: nol DROP
-- data, nol DELETE, nol sentuh tabel lama.
--
-- BODY RPC TIDAK DIDUPLIKASI DI SINI. Satu sumber kebenaran tetap
-- `staging/schema-consent.sql` (satu file memuat tabel + fungsi, jadi tidak ada
-- dua salinan `claim_checkout_order` yang bisa menyimpang). Urutan apply:
--
--   produksi (schema-consent BELUM ada):
--     1) staging/schema-consent.sql   (versi baru — sudah memuat semua di bawah)
--     2) file ini                      (idempoten; delta-nya no-op di sana)
--     3) deploy kode
--   staging/DB yang sudah memuat schema-consent versi LAMA:
--     1) file ini                      (DDL delta: kolom + CHECK + index)
--     2) staging/schema-consent.sql    (idempoten → memasang body RPC baru)
--
-- ⚠️ Re-apply `schema-consent.sql` SESUDAH file ini aman (CREATE TABLE
-- `IF NOT EXISTS` tidak menyentuh tabel yang sudah ada, dan blok index-nya
-- DROP→CREATE satu transaksi). Yang TIDAK boleh: memakai versi LAMA file itu
-- setelah migrasi ini — request berikutnya akan mengembalikan step 3b/6 lama.
--
-- Semua DDL di bawah satu transaksi: kalau CREATE index gagal (mis. DB sudah
-- memuat >=2 baris hidup untuk satu nomor), DROP-nya ikut rollback ⇒ tidak
-- pernah ada keadaan "penjaga hilang" (pelajaran W4RX4 T1 follow-up F-1).
-- Verifikasi: baca pg_constraint + pg_indexes (bukan "apply exit 0") — lihat
-- tests/test-cancel-ttl-sql.mts §1.
-- ============================================================================

DO $$ BEGIN
  IF to_regclass('public.checkout_claims') IS NULL THEN
    RAISE EXCEPTION 'F-W4-1c: apply staging/schema-consent.sql dulu (checkout_claims belum ada)';
  END IF;
END $$;

BEGIN;

-- 1. Dua ID + kolom audit cancel (non-PII).
ALTER TABLE checkout_claims ADD COLUMN IF NOT EXISTS scalev_order_uuid TEXT;
ALTER TABLE checkout_claims ADD COLUMN IF NOT EXISTS cancel_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checkout_claims ADD COLUMN IF NOT EXISTS cancel_last_error TEXT;
ALTER TABLE checkout_claims ADD COLUMN IF NOT EXISTS cancel_next_retry_at TIMESTAMPTZ;
ALTER TABLE checkout_claims ADD COLUMN IF NOT EXISTS cancel_claimed_at TIMESTAMPTZ;
ALTER TABLE checkout_claims ADD COLUMN IF NOT EXISTS cancel_claimed_until TIMESTAMPTZ;
ALTER TABLE checkout_claims ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE checkout_claims ADD COLUMN IF NOT EXISTS late_payment_at TIMESTAMPTZ;

-- 2. Lifecycle: 3 nilai → 6 nilai. Superset ⇒ validasi data lama selalu lolos.
ALTER TABLE checkout_claims DROP CONSTRAINT IF EXISTS checkout_claims_status_check;
ALTER TABLE checkout_claims ADD CONSTRAINT checkout_claims_status_check
  CHECK (status IN ('in_flight', 'created', 'cancel_pending', 'retired', 'cancel_failed', 'failed'));

-- `cancel_last_error` = pesan ter-redact; batas panjang ditegakkan DB juga.
ALTER TABLE checkout_claims DROP CONSTRAINT IF EXISTS checkout_claims_cancel_error_check;
ALTER TABLE checkout_claims ADD CONSTRAINT checkout_claims_cancel_error_check
  CHECK (cancel_last_error IS NULL OR length(cancel_last_error) <= 200);

-- 3. Penjaga per-nomor: baris yang cancel-nya belum terbukti IKUT menahan.
--    `retired` (link mati, replacement sah) & `failed` tanpa order tidak ikut.
DROP INDEX IF EXISTS uq_checkout_claims_live_phone;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_live_phone
  ON checkout_claims (tenant_id, phone)
  WHERE status IN ('in_flight', 'created', 'cancel_pending', 'cancel_failed')
    AND paid_at IS NULL;
DROP INDEX IF EXISTS uq_checkout_claims_inflight_phone;

-- 4. Kunci idempotensi jadi PARTIAL (state aktif saja) supaya kunci milik baris
--    `retired`/`failed` bisa dipakai ulang untuk klaim baru (M-2) tanpa
--    menghapus baris lama yang masih dipakai join webhook order lama.
DROP INDEX IF EXISTS uq_checkout_claims_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_idempotency
  ON checkout_claims (tenant_id, idempotency_key)
  WHERE status IN ('in_flight', 'created', 'cancel_pending', 'cancel_failed');

COMMIT;
