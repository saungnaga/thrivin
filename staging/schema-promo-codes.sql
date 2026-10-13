-- Schema: dashboard-managed promo codes (item 4 — promo benar-benar bisa habis)
-- Divisi: Thrivin (Forge - Fullstack Engineer)
-- Reviewer: Atlas (Tech Lead), Sentinel (Security & Compliance)
-- Tanggal: 2026-10-13
-- Target: Supabase Staging -> Produksi
--
-- DRAFT: belum di-apply ke staging/produksi. Lihat
-- projects/thrivin/features/promo-management-2026-10-13.md untuk cara rollback.
--
-- Kenapa Supabase (bukan Scalev native): owner minta promo bisa dibuat/diatur
-- dari dashboard Thrivin dan kuota harus kelihatan (terpakai/sisa). Scalev
-- `usage_limit` tidak memberi visibilitas itu dan tidak punya single-use
-- per-customer. Detail trade-off di dokumen fitur.
--
-- Idempotent: aman dijalankan ulang.

-- ============================================================================
-- 1. Tabel promo
-- ============================================================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  code VARCHAR(64) NOT NULL,                        -- normalized: UPPER, tanpa spasi
  discount_type VARCHAR(20) NOT NULL,               -- percentage | fixed | flat_price
  amount NUMERIC(12,2) NOT NULL,                    -- pct (0-100) | potongan Rp | harga jadi Rp
  plan_keys TEXT[] NOT NULL DEFAULT '{}'::text[],   -- kosong = berlaku untuk semua paket
  max_redemptions INTEGER,                          -- NULL = tanpa kuota
  expires_at TIMESTAMPTZ,                           -- NULL = tanpa kedaluwarsa
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT promo_codes_type_check CHECK (discount_type IN ('percentage', 'fixed', 'flat_price')),
  CONSTRAINT promo_codes_amount_check CHECK (amount > 0),
  CONSTRAINT promo_codes_percentage_check CHECK (discount_type <> 'percentage' OR amount <= 100),
  CONSTRAINT promo_codes_quota_check CHECK (max_redemptions IS NULL OR max_redemptions >= 0),
  CONSTRAINT promo_codes_code_shape_check CHECK (code = upper(code) AND code !~ '\s')
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_tenant_active ON promo_codes (tenant_id, is_active);

-- ============================================================================
-- 2. Ledger pemakaian (tidak pernah dihapus; refund -> status 'released')
-- ============================================================================
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  promo_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE RESTRICT,
  phone VARCHAR(20) NOT NULL,                       -- normalized 62... (lib/phone.ts)
  order_ref VARCHAR(100),                           -- order id Scalev, diisi setelah order dibuat
  status VARCHAR(20) NOT NULL DEFAULT 'reserved',   -- reserved | consumed | released
  discount_applied NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  CONSTRAINT promo_redemptions_status_check CHECK (status IN ('reserved', 'consumed', 'released'))
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON promo_redemptions (promo_id, status);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_phone ON promo_redemptions (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_order ON promo_redemptions (order_ref);

-- 1x per nomor: satu baris aktif (reserved/consumed) per (promo, nomor).
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_redemption_phone
  ON promo_redemptions (promo_id, phone) WHERE status <> 'released';

-- Satu order hanya boleh memakai satu kode yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_redemption_order
  ON promo_redemptions (promo_id, order_ref) WHERE order_ref IS NOT NULL AND status <> 'released';

-- ============================================================================
-- 3. View untuk dashboard: terpakai + sisa dihitung, bukan kolom denormal
--    (tidak ada drift antara counter dan ledger).
-- ============================================================================
CREATE OR REPLACE VIEW v_promo_codes AS
  SELECT
    p.id, p.tenant_id, p.code, p.discount_type, p.amount, p.plan_keys,
    p.max_redemptions, p.expires_at, p.is_active, p.created_by,
    p.created_at, p.updated_at,
    COALESCE(r.used_count, 0) AS used_count,
    CASE
      WHEN p.max_redemptions IS NULL THEN NULL
      ELSE GREATEST(p.max_redemptions - COALESCE(r.used_count, 0), 0)
    END AS remaining
  FROM promo_codes p
  LEFT JOIN (
    SELECT promo_id, count(*)::int AS used_count
    FROM promo_redemptions
    WHERE status <> 'released'
    GROUP BY promo_id
  ) r ON r.promo_id = p.id;

-- ============================================================================
-- 4. Klaim kuota atomik
--
-- Bukan read-then-write: baris promo dikunci `FOR UPDATE` lebih dulu, jadi
-- setiap pemakaian untuk kode yang sama diserialisasi. Hitung pemakaian (dan
-- cek 1x-per-nomor) terjadi DI DALAM lock itu — tidak ada celah antara baca dan
-- tulis. Dua checkout paralel di kuota sisa 1 -> tepat satu dapat 'ok'.
-- Bukti: tests/test-promo-e2e.mts (race) + tests/test-promo-sql.mts.
-- ============================================================================
DROP FUNCTION IF EXISTS redeem_promo(VARCHAR, TEXT, VARCHAR, TEXT, NUMERIC, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION redeem_promo(
  p_code TEXT,
  p_phone VARCHAR,
  p_plan_key TEXT,
  p_revenue NUMERIC,
  p_dry_run BOOLEAN DEFAULT false,
  p_actor TEXT DEFAULT NULL,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS TABLE (
  status TEXT, promo_code TEXT, discount NUMERIC, final_price NUMERIC,
  redemption_id UUID, message TEXT
) AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
  v_used INTEGER;
  v_plan_keys TEXT[];
  v_discount NUMERIC := 0;
  v_final NUMERIC := p_revenue;
BEGIN
  SELECT * INTO v_promo FROM promo_codes
   WHERE tenant_id = p_tenant_id AND code = p_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_code'::text, p_code, 0::numeric, p_revenue,
      NULL::uuid, 'Kode promo tidak ditemukan.'::text;
    RETURN;
  END IF;

  IF NOT v_promo.is_active THEN
    RETURN QUERY SELECT 'inactive'::text, v_promo.code::text, 0::numeric, p_revenue,
      NULL::uuid, 'Kode promo sedang tidak aktif.'::text;
    RETURN;
  END IF;

  IF v_promo.expires_at IS NOT NULL AND now() >= v_promo.expires_at THEN
    RETURN QUERY SELECT 'expired'::text, v_promo.code::text, 0::numeric, p_revenue,
      NULL::uuid, 'Kode promo sudah kedaluwarsa.'::text;
    RETURN;
  END IF;

  v_plan_keys := COALESCE(v_promo.plan_keys, '{}'::text[]);
  IF COALESCE(array_length(v_plan_keys, 1), 0) > 0 AND NOT (p_plan_key = ANY (v_plan_keys)) THEN
    RETURN QUERY SELECT 'plan_not_eligible'::text, v_promo.code::text, 0::numeric, p_revenue,
      NULL::uuid, 'Kode promo tidak berlaku untuk paket ini.'::text;
    RETURN;
  END IF;

  -- Sudah dibayar/dipakai oleh nomor ini -> habis untuk nomor tsb.
  IF EXISTS (
    SELECT 1 FROM promo_redemptions r
     WHERE r.promo_id = v_promo.id AND r.phone = p_phone AND r.status = 'consumed'
  ) THEN
    RETURN QUERY SELECT 'already_used'::text, v_promo.code::text, 0::numeric, p_revenue,
      NULL::uuid, 'Kode promo ini sudah pernah dipakai oleh nomor WhatsApp ini.'::text;
    RETURN;
  END IF;

  -- Kuota (dihitung di dalam lock; 'released' tidak dihitung).
  SELECT count(*) INTO v_used FROM promo_redemptions r
   WHERE r.promo_id = v_promo.id AND r.status <> 'released';

  IF v_promo.max_redemptions IS NOT NULL AND v_used >= v_promo.max_redemptions THEN
    RETURN QUERY SELECT 'exhausted'::text, v_promo.code::text, 0::numeric, p_revenue,
      NULL::uuid, 'Kuota kode promo sudah habis.'::text;
    RETURN;
  END IF;

  -- Harga: persentase | potongan tetap | harga jadi.
  IF v_promo.discount_type = 'percentage' THEN
    v_discount := round(p_revenue * v_promo.amount / 100);
  ELSIF v_promo.discount_type = 'fixed' THEN
    v_discount := LEAST(v_promo.amount, p_revenue);
  ELSE
    v_discount := GREATEST(p_revenue - LEAST(v_promo.amount, p_revenue), 0);
  END IF;
  v_discount := LEAST(v_discount, p_revenue);
  v_final := p_revenue - v_discount;

  IF p_dry_run THEN
    RETURN QUERY SELECT 'ok'::text, v_promo.code::text, v_discount, v_final, NULL::uuid,
      'Kode promo valid.'::text;
    RETURN;
  END IF;

  -- Retry dari nomor yang sama sebelum bayar: reservasi lama dilepas supaya
  -- tidak mengunci pelanggan yang sekadar membuka ulang halaman checkout.
  -- (Alias `r` dipakai supaya `status` tidak ambigu dengan OUT parameter.)
  UPDATE promo_redemptions r
     SET status = 'released', released_at = now()
   WHERE r.promo_id = v_promo.id AND r.phone = p_phone AND r.status = 'reserved';

  RETURN QUERY
  INSERT INTO promo_redemptions
    (tenant_id, promo_id, phone, status, discount_applied, final_price)
  VALUES
    (p_tenant_id, v_promo.id, p_phone, 'reserved', v_discount, v_final)
  RETURNING 'ok'::text, v_promo.code::text, promo_redemptions.discount_applied,
            promo_redemptions.final_price, promo_redemptions.id,
            'Kode promo terpasang.'::text;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;

-- Pembayaran diterima -> reservasi jadi 'consumed' (1x per nomor terkunci).
CREATE OR REPLACE FUNCTION consume_promo_for_order(
  p_order_ref TEXT,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS INTEGER AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_order_ref IS NULL OR p_order_ref = '' THEN RETURN 0; END IF;
  UPDATE promo_redemptions
     SET status = 'consumed', consumed_at = now()
   WHERE tenant_id = p_tenant_id AND order_ref = p_order_ref AND status = 'reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;

-- Checkout gagal -> kuota dikembalikan.
CREATE OR REPLACE FUNCTION release_promo(
  p_redemption_id UUID,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS BOOLEAN AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE promo_redemptions
     SET status = 'released', released_at = now()
   WHERE id = p_redemption_id AND tenant_id = p_tenant_id AND status = 'reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;

-- Checkout yang ditinggalkan pemiliknya tidak boleh memakan kuota selamanya.
CREATE OR REPLACE FUNCTION release_stale_promo_reservations(
  p_ttl_hours INTEGER DEFAULT 24,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS INTEGER AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE promo_redemptions
     SET status = 'released', released_at = now()
   WHERE tenant_id = p_tenant_id
     AND status = 'reserved'
     AND created_at < now() - make_interval(hours => p_ttl_hours);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;

-- Schedule via pg_cron when the extension exists (sama seperti purge webhook).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-stale-promo-reservations') THEN
      PERFORM cron.schedule(
        'release-stale-promo-reservations',
        '15 * * * *',
        'SELECT release_stale_promo_reservations(24);'
      );
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 5. Seed: kode yang sebelumnya hardcoded di src/lib/plans.ts
--    (TEMANBARU 20% off paket >1 bulan; TEMANBAIKHATI harga jadi Rp 10.000 di
--    paket 3 bulan). Tanpa seed ini, promo lama berhenti jalan setelah deploy.
--    Kuota TEMANBAIKHATI = 100 (angka default, perlu konfirmasi owner).
-- ============================================================================
INSERT INTO promo_codes (tenant_id, code, discount_type, amount, plan_keys, max_redemptions, created_by)
VALUES
  ('thrivin', 'TEMANBARU', 'percentage', 20, ARRAY['quarter', 'half', 'year'], NULL, 'migration-2026-10-13'),
  ('thrivin', 'TEMANBAIKHATI', 'flat_price', 10000, ARRAY['quarter'], 100, 'migration-2026-10-13')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ============================================================================
-- 6. Grants + RLS
-- Supabase memberi service_role akses otomatis; baris eksplisit di bawah ini
-- membuat harness PostgREST lokal (dan DB self-hosted) berperilaku sama.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON promo_codes, promo_redemptions TO service_role;
GRANT EXECUTE ON FUNCTION redeem_promo(TEXT, VARCHAR, TEXT, NUMERIC, BOOLEAN, TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION consume_promo_for_order(TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION release_promo(UUID, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION release_stale_promo_reservations(INTEGER, VARCHAR) TO service_role;

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['promo_codes', 'promo_redemptions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'deny_client_access_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        'deny_client_access_' || t, t
      );
    END IF;
  END LOOP;
END $$;