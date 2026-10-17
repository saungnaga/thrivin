-- Schema: WA-first identity (OTP challenge) + narrow subscription-status RPC
-- Divisi: Thrivin (Forge - Fullstack Engineer) — kartu W3 t_86bf9739
-- Reviewer: Sentinel (Security & Compliance) — draft WAJIB delta-review sebelum apply
-- Tanggal: 2026-10-15
-- Target: Supabase Staging -> Produksi (BELUM di-apply di mana pun)
--
-- DRAFT + BLOCKED-LIVE. Sumber kontrak: batch-2026-10-15/s0-security/integration-contract.md
--   §1  identitas sesi + OTP: tabel challenge BARU; provider OTP tidak diotorisasi →
--       transport = mock (lihat src/lib/otp-provider.ts). Tidak ada outbound WhatsApp nyata.
--   §4  lookup langganan: RPC SEMPIT `subscription_status_for_owner` (state/expires_at/
--       last_plan_key SAJA), SECURITY INVOKER, REVOKE PUBLIC/anon/authenticated.
--       `check_subscription()` TIDAK dipakai: ia menulis di jalur baca dan mengembalikan
--       token_used/token_limit/plan_name yang tidak dibutuhkan UI pelanggan.
--   §5  promo: TIDAK ada ledger/endpoint kedua. TEMENANLAGI = satu baris `promo_codes`
--       (dibuat lewat mekanisme existing, aktivasi ditahan t_7bcb4487) — SQL ini TIDAK
--       menyeed TEMENANLAGI dan tidak mengubah kuota/TTL promo.
--
-- Idempotent: aman dijalankan ulang.

-- ============================================================================
-- 1. Tabel challenge OTP
-- ============================================================================
-- Kode OTP TIDAK pernah disimpan mentah: `code_hash` = HMAC-SHA256(phone:code,
-- WA_OTP_SECRET) yang dihitung di server (node), bukan di DB. DB hanya menyimpan
-- hash + penghitung, jadi dump tabel tidak menghasilkan kode yang bisa dipakai.
CREATE TABLE IF NOT EXISTS wa_otp_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  phone VARCHAR(20) NOT NULL,                 -- sudah dinormalisasi server: 62xxxxxxxxxx
  code_hash TEXT NOT NULL,                    -- hex HMAC-SHA256, bukan kode polos
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,            -- TTL pendek (default 5 menit)
  consumed_at TIMESTAMPTZ,                    -- diisi saat dipakai/dibatalkan = single-use
  request_ip_hash TEXT,                       -- sha256(ip) trunc — forensik abuse tanpa simpan IP
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wa_otp_challenges_attempts_check CHECK (attempts >= 0),
  CONSTRAINT wa_otp_challenges_phone_check CHECK (phone ~ '^62[0-9]{8,13}$')
);

CREATE INDEX IF NOT EXISTS idx_wa_otp_challenges_phone
  ON wa_otp_challenges (tenant_id, phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_otp_challenges_expiry
  ON wa_otp_challenges (expires_at);

-- Satu challenge HIDUP per nomor per tenant. Permintaan baru MENUTUP yang lama
-- (consumed_at) lalu mencatat baris BARU — bukan menumpuk, dan bukan pula
-- memakai ulang baris lama: hitungan kuota per jam harus melihat setiap
-- penerbitan (lihat F-1: UPSERT membuat baris hidup selalu berjumlah 1 sehingga
-- batas per jam tidak pernah tercapai).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_otp_live_challenge
  ON wa_otp_challenges (tenant_id, phone)
  WHERE consumed_at IS NULL;

-- ============================================================================
-- 2. RPC: terbitkan challenge (atomik) — batas resend server-side
-- ============================================================================
-- ponytail: fungsi, bukan "baca lalu tulis" dari TS — tanpa ini dua permintaan
-- paralel bisa sama-sama lolos batas. Tambah kolom channel kalau nanti ada >1 transport.
-- ponytail: baris challenge lama tidak dibersihkan dari sini; tambah purge
-- terjadwal (created_at < now() - 30 days) saat apply ke staging/produksi.
CREATE OR REPLACE FUNCTION create_wa_otp_challenge(
  p_phone TEXT,
  p_code_hash TEXT,
  p_ttl_seconds INTEGER DEFAULT 300,
  p_min_interval_seconds INTEGER DEFAULT 60,
  p_max_per_hour INTEGER DEFAULT 5,
  p_ip_hash TEXT DEFAULT NULL,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_live RECORD;
  v_recent INTEGER;
BEGIN
  IF p_phone !~ '^62[0-9]{8,13}$' THEN
    RETURN json_build_object('status', 'invalid_phone');
  END IF;

  -- Serialisasi per nomor (kunci dilepas otomatis di akhir transaksi) supaya dua
  -- permintaan paralel tidak sama-sama lolos batas kuota per jam.
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id || ':' || p_phone));

  SELECT * INTO v_live
  FROM wa_otp_challenges
  WHERE tenant_id = p_tenant_id AND phone = p_phone AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND v_live.created_at > now() - make_interval(secs => p_min_interval_seconds) THEN
    RETURN json_build_object(
      'status', 'cooldown',
      'retry_after_seconds',
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_live.created_at + make_interval(secs => p_min_interval_seconds) - now()))))
    );
  END IF;

  -- Batas per jam dihitung dari SETIAP baris yang tercatat dalam satu jam
  -- terakhir (status apa pun), bukan dari "baris hidup": jalur tulis di bawah
  -- menutup baris lama, jadi hitungan baris hidup selalu 1 → kuota maksimum
  -- yang bisa ditegakkan cuma 1/jam (F-1 audit W3).
  SELECT count(*) INTO v_recent
  FROM wa_otp_challenges
  WHERE tenant_id = p_tenant_id AND phone = p_phone
    AND created_at > now() - interval '1 hour';

  IF v_recent >= p_max_per_hour THEN
    RETURN json_build_object('status', 'resend_limit', 'retry_after_seconds', 3600);
  END IF;

  -- Satu challenge hidup per nomor: yang lama ditutup, yang baru dicatat sebagai
  -- baris tersendiri supaya tiap penerbitan ikut terhitung di kuota per jam.
  UPDATE wa_otp_challenges SET consumed_at = now()
  WHERE tenant_id = p_tenant_id AND phone = p_phone AND consumed_at IS NULL;

  INSERT INTO wa_otp_challenges (
    tenant_id, phone, code_hash, expires_at, request_ip_hash
  ) VALUES (
    p_tenant_id, p_phone, p_code_hash, now() + make_interval(secs => p_ttl_seconds), p_ip_hash
  );

  RETURN json_build_object('status', 'created');
END;
$function$;

-- ============================================================================
-- 3. RPC: verifikasi challenge — single-use, hitung percobaan, tanpa oracle
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_wa_otp_challenge(
  p_phone TEXT,
  p_code_hash TEXT,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v RECORD;
BEGIN
  SELECT * INTO v
  FROM wa_otp_challenges
  WHERE tenant_id = p_tenant_id AND phone = p_phone AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'no_challenge');
  END IF;

  IF v.expires_at <= now() THEN
    UPDATE wa_otp_challenges SET consumed_at = now() WHERE id = v.id;
    RETURN json_build_object('status', 'expired');
  END IF;

  IF v.attempts >= v.max_attempts THEN
    UPDATE wa_otp_challenges SET consumed_at = now() WHERE id = v.id;
    RETURN json_build_object('status', 'too_many_attempts');
  END IF;

  IF v.code_hash IS DISTINCT FROM p_code_hash THEN
    UPDATE wa_otp_challenges SET attempts = attempts + 1 WHERE id = v.id;
    RETURN json_build_object(
      'status', 'invalid',
      'attempts_left', GREATEST(0, v.max_attempts - v.attempts - 1)
    );
  END IF;

  -- Pemenang tunggal: baris ditandai terpakai di transaksi yang sama.
  UPDATE wa_otp_challenges SET consumed_at = now() WHERE id = v.id;
  RETURN json_build_object('status', 'ok');
END;
$function$;

-- ============================================================================
-- 4. RPC sempit: status langganan untuk pemilik nomor (least fields, read-only)
-- ============================================================================
-- Mengembalikan HANYA {state, expires_at, last_plan_key}:
--   state      : 'none' | 'active' | 'expired'
--   expires_at : expires_at TERBARU (basis eligibility reaktivasi di server/TS)
--   last_plan_key: diturunkan dari durasi langganan (30/90/180/365 hari); NULL kalau
--                  durasinya tidak cocok katalog. Sengaja dari durasi, bukan plan_id —
--                  plan_id 3 dipakai bersama oleh `half` dan `year` (PLAN_CATALOG).
-- STABLE: tidak menulis apa pun. TIDAK ada UPDATE status di jalur baca.
CREATE OR REPLACE FUNCTION subscription_status_for_owner(p_phone TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH u AS (
    SELECT id FROM users
    WHERE p_phone ~ '^62[0-9]{8,13}$'
      -- `users.phone` is not guaranteed to be stored as `62…`: a read-only query
      -- against staging (2026-10-15, F-4 audit W3) returned 5/5 rows stored as
      -- `+62…`. Compare digits only, so `+62…`, `62…`, `0812…` and separators
      -- (` `, `-`) all resolve to the same owner.
      -- ponytail: this is a seq scan (regexp_replace cannot use users_phone_key);
      -- switch to an expression index or normalise the data once `users` grows.
      AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
          IN (p_phone, '0' || substring(p_phone from 3))
    LIMIT 1
  ), latest AS (
    SELECT s.status, s.expires_at, s.started_at, s.plan_id
    FROM subscriptions s
    JOIN u ON s.user_id = u.id
    ORDER BY s.expires_at DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM latest) = 0
      THEN json_build_object('state', 'none', 'expires_at', NULL, 'last_plan_key', NULL)
    ELSE json_build_object(
      'state', CASE
        WHEN (SELECT status FROM latest) = 'active'
         AND (SELECT expires_at FROM latest) > now()
        THEN 'active'
        ELSE 'expired'
      END,
      'expires_at', (SELECT to_json(expires_at) FROM latest),
      'last_plan_key', (
        SELECT CASE round(EXTRACT(EPOCH FROM (expires_at - started_at)) / 86400)
          WHEN 30 THEN 'month'
          WHEN 90 THEN 'quarter'
          WHEN 180 THEN 'half'
          WHEN 365 THEN 'year'
          ELSE NULL
        END FROM latest
      )
    )
  END
$function$;

-- ============================================================================
-- 5. Grants + RLS
-- Supabase: service_role otomatis; baris eksplisit di bawah membuat harness lokal
-- dan DB self-hosted berperilaku sama.
-- ============================================================================

-- Fungsi baru dapat EXECUTE default untuk PUBLIC; Supabase menambah grant default
-- untuk anon/authenticated. Semua RPC di file ini HANYA dipanggil dari server
-- (service_role, lewat PostgREST) — cabut sisanya.
REVOKE ALL ON FUNCTION create_wa_otp_challenge(TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION verify_wa_otp_challenge(TEXT, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION subscription_status_for_owner(TEXT) FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON wa_otp_challenges TO service_role;
GRANT EXECUTE ON FUNCTION create_wa_otp_challenge(TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION verify_wa_otp_challenge(TEXT, TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION subscription_status_for_owner(TEXT) TO service_role;

ALTER TABLE wa_otp_challenges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wa_otp_challenges'
      AND policyname = 'deny_client_access_wa_otp_challenges'
  ) THEN
    CREATE POLICY deny_client_access_wa_otp_challenges ON wa_otp_challenges
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
