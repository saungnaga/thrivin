-- Schema DRAFT: feedback / kritik & saran (A8 — halaman /companion/nina/kritiksaran)
-- Divisi: Thrivin (Forge - Fullstack Engineer)
-- Reviewer: Atlas (Tech Lead), Sentinel (Security & Compliance)  -> DELTA-REVIEW WAJIB
-- Tanggal: 2026-10-15
-- Target: Supabase Staging -> Produksi
--
-- STATUS: DRAFT. BELUM di-apply ke staging maupun produksi.
--   S0 (t_788d7064) daftar "draft SQL wajib delta-review" butir 4 = "Tabel feedback
--   kritiksaran + retensi + grant". File ini adalah butir itu.
--
-- Kontrak: batch-2026-10-15/s0-security/integration-contract.md §6 (Feedback A8 / kritiksaran).
--
-- Catatan desain yang HARUS dibaca reviewer:
--   * `phone` = kontak OPSIONAL dan **belum terverifikasi**. Basis kerja saat ini (9392cdd)
--     tidak punya modul sesi terverifikasi; W3 (`feat/wa-first-2026-10-15`) memilikinya tapi
--     belum ada di RC. Kalau sesi itu masuk RC, route mengisi `phone` dari sesi (server-side)
--     dan field dari klien diabaikan — kolomnya tidak perlu berubah.
--   * `request_token` = kunci idempotensi dari klien (32 hex). Unique (tenant_id, request_token)
--     adalah arbiter retry: INSERT kedua dengan token sama TIDAK menambah baris.
--   * Retensi (`expires_at` 365 hari) = **PLACEHOLDER, BUKAN janji**. Angka final butuh
--     approval legal/owner bersama W2 (draft T&C/privacy). Jangan publikasikan angka ini.
--   * Akses operator (dashboard baca feedback) BELUM dibangun dan bukan bagian kartu W5.
--
-- Idempotent: aman dijalankan berulang.

-- ============================================================================
-- 1. Tabel feedback
-- ============================================================================
CREATE TABLE IF NOT EXISTS feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  phone VARCHAR(20),                                  -- opsional, BELUM terverifikasi
  message_text TEXT NOT NULL,                         -- disimpan apa adanya sebagai TEKS
  request_token VARCHAR(64) NOT NULL,                 -- kunci idempotensi (dari klien)
  review_state VARCHAR(20) NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '365 days'),
  CONSTRAINT feedback_message_len CHECK (char_length(message_text) BETWEEN 10 AND 2000),
  CONSTRAINT feedback_review_state_check CHECK (
    review_state = ANY (ARRAY['new'::text, 'triaged'::text, 'resolved'::text, 'archived'::text])
  ),
  CONSTRAINT feedback_request_token_shape CHECK (request_token ~ '^[A-Za-z0-9_-]{16,64}$'),
  CONSTRAINT feedback_phone_shape CHECK (phone IS NULL OR phone ~ '^62[0-9]{8,14}$')
);

-- Arbiter idempotensi: INSERT kedua dengan token yang sama kalah di sini.
CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_tenant_request_token
  ON feedback (tenant_id, request_token);

-- Retensi: sweep memakai kolom ini, bukan created_at.
CREATE INDEX IF NOT EXISTS idx_feedback_retention ON feedback (expires_at);
CREATE INDEX IF NOT EXISTS idx_feedback_review_state ON feedback (review_state, created_at);

-- ============================================================================
-- 2. Akses (least privilege)
-- Supabase memberi `anon`/`authenticated` grant pada objek BARU di schema public
-- secara default — jangan mengandalkan default. Cabut eksplisit.
-- ============================================================================
REVOKE ALL ON TABLE public.feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.feedback TO service_role;

-- Kunci tidak ada di klien, tapi policy ini bikin kunci yang salah GAGAL KERAS
-- (nol baris) alih-alih diam-diam berhasil.
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feedback' AND policyname = 'deny_client_access_feedback'
  ) THEN
    CREATE POLICY deny_client_access_feedback ON feedback
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- ============================================================================
-- 3. Retensi (sweep) — PLACEHOLDER interval, lihat catatan desain di atas
-- ============================================================================
DROP FUNCTION IF EXISTS purge_expired_feedback();
CREATE OR REPLACE FUNCTION purge_expired_feedback()
RETURNS TABLE (deleted_feedback INTEGER) AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM feedback WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.purge_expired_feedback() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_feedback() TO service_role;
