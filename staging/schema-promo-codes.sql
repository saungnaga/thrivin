-- Schema: dashboard-managed promo codes (item 4 — promo benar-benar bisa habis)
-- Divisi: Thrivin (Forge - Fullstack Engineer)
-- Reviewer: Atlas (Tech Lead), Sentinel (Security & Compliance)
-- Tanggal: 2026-10-13 (remediasi VETO 2026-10-14)
-- Target: Supabase Staging -> Produksi
--
-- DRAFT: belum di-apply ke staging/produksi. Lihat
-- projects/thrivin/features/promo-management-2026-10-13.md untuk cara rollback.
--
-- Changes vs v1 (see projects/thrivin/security/review-promo-2026-10-14.md):
--   V-1  redeem_promo tidak lagi MELEPAS reservasi nomor yang sama. Reservasi
--        yang sudah punya order_ref (order Scalev sudah tercetak) menahan
--        checkout berikutnya (`pending_order`), dan reservasi yang belum punya
--        order_ref dipakai ULANG di baris yang sama. Kuota dihitung dari
--        pemakaian yang sudah tercetak (consumed + reserved aktif).
--   V-2  v_promo_codes: security_invoker=on + REVOKE dari anon/authenticated.
--   C-4  penjadwalan sweep gagal TERANG-TERANGAN kalau pg_cron tidak ada.
--   C-5  REVOKE EXECUTE RPC promo dari PUBLIC/anon/authenticated.
--
-- Changes vs v2 (see projects/thrivin/security/review-promo-r2-2026-10-14.md,
-- VETO ronde 2):
--   V-1b reservasi aktif milik satu nomor adalah KLAIM, bukan "baris yang boleh
--        dipakai ulang". Jalur v_reuse (ronde 1) mengembalikan 'ok' TANPA
--        menambah pemakaian, jadi N checkout PARALEL dari satu nomor sama-sama
--        lolos gerbang kuota dan masing-masing mencetak order di Scalev —
--        window antara redeem_promo (baris 'reserved' tanpa order_ref) dan
--        attachPromoOrder (PATCH order_ref). Terukur Sentinel ronde 2: kuota 2
--        -> 2/2/4/5 order berbayar, ledger tetap 1 baris.
--        Sekarang: baris 'reserved' apa pun (dengan maupun tanpa order_ref)
--        MENOLAK checkout berikutnya dengan 'pending_order'. Jalur UPDATE
--        (reuse) dihapus total, dan INSERT dilindungi ON CONFLICT DO NOTHING
--        terhadap uq_promo_redemption_phone.
--   C-4  sweep TTL tidak lagi melepas reservasi yang sudah punya order_ref:
--        order yang sudah tercetak menahan kursinya sampai dibayar (consume)
--        atau dibatalkan eksplisit (cancel_promo_redemption).
--   C-6  attachPromoOrder gagal = reservasi TETAP dipegang (bukan dilepas) —
--        lihat komentar di route create-order; tidak ada order kedua yang bisa
--        dicetak selama klaim masih hidup.
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
  -- C-6: order sudah DICETAK di Scalev tapi order_ref gagal ditulis (attach
  -- gagal). Kursinya tetap dipegang (tidak ada order kedua yang bisa dicetak),
  -- dan baris ini DIKECUALIKAN dari sweep TTL — kalau tidak, order yang masih
  -- bisa dibayar akan kehilangan kursinya 24 jam kemudian. Ops menyelesaikannya
  -- lewat cancel_promo_redemption() setelah order dibatalkan manual.
  needs_reconcile BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT promo_redemptions_status_check CHECK (status IN ('reserved', 'consumed', 'released'))
);

-- Idempotent untuk DB yang sudah punya tabelnya.
ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS needs_reconcile BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON promo_redemptions (promo_id, status);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_phone ON promo_redemptions (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_order ON promo_redemptions (order_ref);

-- 1x per nomor: satu baris aktif (reserved/consumed) per (promo, nomor).
-- Ini guard terkuat yang kita punya dan SATU-SATUNYA yang dibutuhkan: index ini
-- melarang lebih dari satu baris non-'released' untuk (promo_id, phone)
-- berapa pun statusnya. Unique index parsial tambahan
-- (promo_id, phone) WHERE status='reserved' AND order_ref IS NULL — usulan
-- Sentinel ronde 2 — adalah SUBSET dari ini (lebih lemah), jadi tidak dipasang:
-- menambah biaya tulis tanpa menutup satu pun jalur. Yang benar-benar membocorkan
-- kuota di ronde 2 bukan INSERT yang lolos (INSERT kedua memang sudah ditolak
-- index ini), melainkan jalur UPDATE 'pakai ulang baris' di redeem_promo —
-- dan unique index mana pun tidak bisa menghentikan UPDATE. Jalur itu dihapus.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_redemption_phone
  ON promo_redemptions (promo_id, phone) WHERE status <> 'released';

-- Satu order hanya boleh memakai satu kode yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_redemption_order
  ON promo_redemptions (promo_id, order_ref) WHERE order_ref IS NOT NULL AND status <> 'released';

-- ============================================================================
-- 3. View untuk dashboard: terpakai + sisa dihitung, bukan kolom denormal
--    (tidak ada drift antara counter dan ledger).
--    "Terpakai" = pemakaian yang sudah TERCETAK: consumed + reservasi aktif.
--    Bukan "baris yang kebetulan tidak released saat dibaca".
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
    WHERE status IN ('reserved', 'consumed')
    GROUP BY promo_id
  ) r ON r.promo_id = p.id;

-- V-2: view Postgres default berjalan dengan hak PEMILIK (role migrasi,
-- BYPASSRLS) sehingga policy RLS di tabel tidak berlaku — dan policy-nya memang
-- cuma dipasang di tabel. Tanpa dua perintah di bawah, klien ANON (kunci
-- publishable yang selalu ada di bundle browser) bisa membaca seluruh kode
-- promo rahasia + diskon + kuota + pemakaian lewat PostgREST.
-- (security_invoker butuh PostgreSQL 15+; Supabase 15/16. Terbukti di
-- review-promo-2026-10-14: tanpa fix anon=8 baris, dengan fix anon=0/401.)
ALTER VIEW v_promo_codes SET (security_invoker = on);
REVOKE ALL ON v_promo_codes FROM anon, authenticated;
GRANT SELECT ON v_promo_codes TO service_role;      -- I-1: eksplisit, bukan andalan default

-- ============================================================================
-- 4. Klaim kuota atomik
--
-- Bukan read-then-write: baris promo dikunci `FOR UPDATE` lebih dulu, jadi
-- setiap pemakaian untuk kode yang sama diserialisasi. Hitung pemakaian (dan
-- cek 1x-per-nomor) terjadi DI DALAM lock itu — tidak ada celah antara baca dan
-- tulis. Dua checkout paralel di kuota sisa 1 -> tepat satu dapat 'ok'.
--
-- V-1 ronde 1 (remediasi): retry dari nomor yang sama TIDAK lagi melepas
-- reservasi lama lalu INSERT baris baru. Kalau reservasi lama sudah punya
-- `order_ref` (order Scalev sudah tercetak), checkout kedua DITOLAK
-- (`pending_order`).
--
-- V-1 ronde 2 (remediasi): jalur "pakai ulang baris" itu sendiri masih bocor.
-- `v_reuse` mengembalikan 'ok' TANPA lewat gerbang kuota, jadi N checkout
-- PARALEL dari satu nomor (semuanya tiba sebelum attachPromoOrder sempat
-- menulis order_ref) sama-sama dapat 'ok' dan sama-sama mencetak order Scalev.
-- Sekarang reservasi aktif = KLAIM: begitu ada baris 'reserved' untuk
-- (promo, nomor), checkout berikutnya ditolak sampai baris itu dibayar
-- (consume_promo_for_order), dibatalkan eksplisit (cancel_promo_redemption),
-- atau gagal sebelum order tercetak (release_promo).
-- Bukti: tests/test-promo-sql.mts, tests/test-promo-parallel-race.mts,
-- tests/test-promo-e2e.mts.
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
  v_open promo_redemptions%ROWTYPE;
  v_used INTEGER;
  v_plan_keys TEXT[];
  v_discount NUMERIC := 0;
  v_final NUMERIC := p_revenue;
  v_new_id UUID;
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

  -- Reservasi aktif milik nomor ini (dibaca di dalam lock promo -> tidak ada
  -- race antar-checkout untuk kode yang sama). Reservasi aktif = klaim yang
  -- masih hidup; sementara klaim ini ada, TIDAK BOLEH ada order kedua.
  SELECT * INTO v_open FROM promo_redemptions r
   WHERE r.promo_id = v_promo.id AND r.phone = p_phone AND r.status = 'reserved'
   ORDER BY r.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    -- order_ref terisi = order sudah tercetak di Scalev, menunggu pembayaran.
    -- order_ref kosong = checkout lain sedang berjalan (atau attach-nya gagal).
    -- Dua-duanya ditolak: melepas / memakai ulang baris di sini persis yang
    -- membuat N checkout paralel mencetak N order.
    RETURN QUERY SELECT 'pending_order'::text, v_promo.code::text,
      v_open.discount_applied, v_open.final_price, v_open.id,
      CASE WHEN v_open.order_ref IS NOT NULL
        THEN 'Masih ada order promo yang menunggu pembayaran untuk nomor ini. Selesaikan pembayarannya dulu.'
        ELSE 'Checkout promo untuk nomor ini sedang diproses. Tunggu sebentar, lalu cek status pesanan.'
      END::text;
    RETURN;
  END IF;

  -- Kuota = pemakaian yang sudah tercetak (consumed + reservasi aktif), bukan
  -- "baris yang kebetulan tidak released saat ini".
  SELECT count(*) INTO v_used FROM promo_redemptions r
   WHERE r.promo_id = v_promo.id AND r.status IN ('reserved', 'consumed');

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
    RETURN QUERY SELECT 'ok'::text, v_promo.code::text, v_discount::numeric(12,2),
      v_final::numeric(12,2), NULL::uuid, 'Kode promo valid.'::text;
    RETURN;
  END IF;

  -- Satu klaim per (promo, nomor): selalu baris BARU, tidak pernah UPDATE baris
  -- lama. ON CONFLICT DO NOTHING adalah jaring pengaman terakhir kalau ada jalur
  -- kode lain (atau versi lama fungsi ini) mencoba menyisipkan klaim kedua —
  -- konflik -> nol baris ter-INSERT -> dijawab 'pending_order', bukan 'ok'.
  INSERT INTO promo_redemptions
    (tenant_id, promo_id, phone, status, discount_applied, final_price)
  VALUES
    (p_tenant_id, v_promo.id, p_phone, 'reserved', v_discount, v_final)
  ON CONFLICT DO NOTHING
  RETURNING promo_redemptions.id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RETURN QUERY SELECT 'pending_order'::text, v_promo.code::text, 0::numeric, p_revenue,
      NULL::uuid,
      'Checkout promo untuk nomor ini sedang diproses. Tunggu sebentar, lalu cek status pesanan.'::text;
    RETURN;
  END IF;

  -- Cast ke numeric(12,2) supaya bentuk angka yang dikembalikan sama dengan
  -- bentuk kolomnya (klien membaca "46200.00", bukan "46200").
  RETURN QUERY SELECT 'ok'::text, v_promo.code::text, v_discount::numeric(12,2),
    v_final::numeric(12,2), v_new_id, 'Kode promo terpasang.'::text;
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

-- Checkout gagal SEBELUM order tertagih -> kuota dikembalikan.
-- V-1: reservasi yang SUDAH punya order_ref tidak boleh dilepas di sini — itu
-- membuka kembali kursi yang ordernya masih bisa dibayar. Reservasi seperti itu
-- hanya dilepas oleh sweep TTL (24 jam), bukan oleh jalur cepat ini.
CREATE OR REPLACE FUNCTION release_promo(
  p_redemption_id UUID,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS BOOLEAN AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE promo_redemptions
     SET status = 'released', released_at = now()
   WHERE id = p_redemption_id AND tenant_id = p_tenant_id
     AND status = 'reserved' AND order_ref IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;

-- Checkout yang ditinggalkan pemiliknya tidak boleh memakan kuota selamanya.
--
-- C-4: HANYA reservasi yang BELUM terikat order (order_ref IS NULL) yang boleh
-- dilepas. Reservasi yang sudah punya order_ref berarti order-nya sudah tercetak
-- di Scalev dan masih bisa dibayar; melepasnya mengembalikan kursi ke katalog
-- sementara order lama tetap hidup -> satu nomor bisa membayar DUA order promo.
-- Reservasi terikat hanya dilepas oleh:
--   * consume_promo_for_order()  -> dibayar (status 'consumed')
--   * cancel_promo_redemption()  -> order dibatalkan eksplisit oleh ops
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
     AND order_ref IS NULL
     AND needs_reconcile = false
     AND created_at < now() - make_interval(hours => p_ttl_hours);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;

-- C-6: order sudah tercetak di Scalev tapi reservasinya tidak bisa diikat
-- (attachPromoOrder gagal). Baris tetap 'reserved' (kursi ditahan, tidak ada
-- order kedua) dan ditandai supaya sweep TTL tidak melepas kursi yang ordernya
-- masih bisa dibayar.
CREATE OR REPLACE FUNCTION flag_promo_reconcile(
  p_redemption_id UUID,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS BOOLEAN AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE promo_redemptions
     SET needs_reconcile = true
   WHERE id = p_redemption_id AND tenant_id = p_tenant_id AND status = 'reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;

-- Pembatalan eksplisit (ops/CS): order promo yang sudah tercetak di Scalev
-- dibatalkan manual, jadi kursinya harus kembali ke kuota. Satu-satunya jalur
-- yang boleh melepas reservasi terikat — harus dipanggil dengan id baris yang
-- benar (bukti bahwa order-nya memang sudah dibatalkan di sisi Scalev).
CREATE OR REPLACE FUNCTION cancel_promo_redemption(
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

-- Schedule via pg_cron when the extension exists (sama seperti purge webhook).
-- C-4: kalau penjadwalan tidak tersedia, JANGAN diam. Reservasi yang nyangkut
-- membuat promo tampak "habis" padahal tidak ada yang membeli.
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
  ELSE
    RAISE WARNING 'pg_cron tidak tersedia: sweep reservasi promo basi TIDAK terjadwal. Jalankan staging/release-stale-promo-cron.sh dari cron ops (atau panggil SELECT release_stale_promo_reservations(24); manual).';
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

-- C-5: fungsi baru dapat EXECUTE default untuk PUBLIC di Postgres, dan Supabase
-- menambah grant default untuk anon/authenticated. Semua RPC promo hanya
-- dipanggil dari server (service_role) — cabut yang lain.
REVOKE ALL ON FUNCTION redeem_promo(TEXT, VARCHAR, TEXT, NUMERIC, BOOLEAN, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION consume_promo_for_order(TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_promo(UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_stale_promo_reservations(INTEGER, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cancel_promo_redemption(UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION flag_promo_reconcile(UUID, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON promo_codes, promo_redemptions TO service_role;
GRANT EXECUTE ON FUNCTION redeem_promo(TEXT, VARCHAR, TEXT, NUMERIC, BOOLEAN, TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION consume_promo_for_order(TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION release_promo(UUID, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION release_stale_promo_reservations(INTEGER, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_promo_redemption(UUID, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION flag_promo_reconcile(UUID, VARCHAR) TO service_role;

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
