-- Schema: consent (A7) + authoritative server-side checkout completion gate (A2)
-- Divisi: Thrivin (Forge - Fullstack Engineer) — kartu W4 t_f5ec336c
-- Reviewer: Sentinel (Security & Compliance) — DRAFT WAJIB delta-review SEBELUM apply
-- Tanggal: 2026-10-16
-- Target: Supabase Staging -> Produksi (BELUM di-apply di mana pun)
--
-- Sumber kontrak: batch-2026-10-15/s0-security/integration-contract.md
--   §2  completion onboarding = server-side; `create-order` memvalidasi ULANG sebelum
--       order eksternal dibuat. Tidak ada state client yang dipercaya.
--   §3  consent: `users.opt_in` + `users.opted_out` = status EFEKTIF (satu rumah, dibaca
--       Nina); `consent_events` append-only = BUKTI (versi teks + occurred_at server).
--       Dua checkbox terpisah; T&C wajib, opt-in pengingat opsional; `false` TETAP disimpan.
--       Retry lama tidak boleh menurunkan status; opt-out menang saat seri.
--   §5  promo: file ini TIDAK menyentuh promo sama sekali.
--
-- BARU (belum ada di skema mana pun, S0 B-2): kolom consent, tabel `consent_events`,
-- `onboarding_progress` (state onboarding server-side — sebelumnya cuma localStorage,
-- S0 B-5), dan `checkout_claims` (single-flight per idempotency key: replay tidak boleh
-- mencetak order kedua di Scalev).
--
-- KENAPA onboarding_progress PISAH dari users.onboarding_*: RPC existing
-- (save_onboarding_progress/complete_onboarding) keyed `user_id`, sedangkan di titik
-- checkout user row belum tentu ada; menulis baris `users` di jalur pra-bayar berarti
-- membuat akun untuk checkout yang belum dibayar. Tabel ini ber-TTL dan tidak menyentuh
-- registry user.
--
-- Idempotent: aman dijalankan ulang.

-- ============================================================================
-- 1. Kolom consent efektif di users
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;

-- Invariant: tidak boleh "ikut" dan "berhenti" sekaligus. Nina membaca
-- `opt_in=true AND opted_out=false`, jadi kombinasi mustahil ini tidak boleh ada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_consent_exclusive_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_consent_exclusive_check
      CHECK (NOT (opt_in AND opted_out));
  END IF;
END $$;

-- ============================================================================
-- 2. consent_events — bukti append-only (UPDATE/DELETE ditolak trigger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS consent_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  user_id UUID,                                  -- diisi kalau baris users sudah ada
  phone VARCHAR(20) NOT NULL,                    -- dinormalisasi server: 62xxxxxxxxxx
  consent_type TEXT NOT NULL,
  value BOOLEAN NOT NULL,
  source TEXT NOT NULL,                          -- mis. checkout_step9, whatsapp_optout
  text_version TEXT NOT NULL,                    -- versi teks yang BENAR-BENAR ditampilkan
  occurred_at TIMESTAMPTZ NOT NULL,              -- waktu kejadian (server)
  idempotency_key TEXT NOT NULL,                 -- satu peristiwa logis = satu baris
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consent_events_type_check
    CHECK (consent_type IN ('terms', 'reminder_whatsapp')),
  CONSTRAINT consent_events_phone_check CHECK (phone ~ '^62[0-9]{8,13}$'),
  CONSTRAINT consent_events_version_check CHECK (length(text_version) BETWEEN 1 AND 120),
  CONSTRAINT consent_events_source_check CHECK (length(source) BETWEEN 1 AND 60),
  CONSTRAINT consent_events_idem_check CHECK (length(idempotency_key) BETWEEN 8 AND 200)
);

-- Idempotensi: replay peristiwa yang sama tidak menambah baris kedua.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_events_idempotency
  ON consent_events (tenant_id, idempotency_key);

-- Urutan: status efektif = event terbaru per (nomor, jenis).
CREATE INDEX IF NOT EXISTS idx_consent_events_phone_type_time
  ON consent_events (tenant_id, phone, consent_type, occurred_at DESC);

CREATE OR REPLACE FUNCTION consent_events_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'consent_events is append-only (no UPDATE/DELETE)';
END;
$function$;

DROP TRIGGER IF EXISTS trg_consent_events_append_only ON consent_events;
CREATE TRIGGER trg_consent_events_append_only
  BEFORE UPDATE OR DELETE ON consent_events
  FOR EACH ROW EXECUTE FUNCTION consent_events_block_mutation();

-- ============================================================================
-- 3. onboarding_progress — state onboarding server-side (pengganti localStorage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  phone VARCHAR(20) NOT NULL,
  steps JSONB NOT NULL DEFAULT '{}'::jsonb,      -- {"2": {...}, "8": {...}}
  step_reached INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ,                      -- diisi saat semua langkah wajib ada
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_progress_phone_check CHECK (phone ~ '^62[0-9]{8,13}$'),
  CONSTRAINT onboarding_progress_step_check CHECK (step_reached BETWEEN 1 AND 9)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_progress_phone
  ON onboarding_progress (tenant_id, phone);

-- ============================================================================
-- 4. checkout_claims — single-flight per idempotency key (anti order ganda)
-- ============================================================================
CREATE TABLE IF NOT EXISTS checkout_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  phone VARCHAR(20) NOT NULL,
  idempotency_key TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_flight',
  order_id TEXT,
  payment_url TEXT,
  amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checkout_claims_status_check
    CHECK (status IN ('in_flight', 'created', 'failed')),
  CONSTRAINT checkout_claims_phone_check CHECK (phone ~ '^62[0-9]{8,13}$'),
  CONSTRAINT checkout_claims_idem_check CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT checkout_claims_plan_check CHECK (plan_key IN ('month', 'quarter', 'half', 'year'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_idempotency
  ON checkout_claims (tenant_id, idempotency_key);

-- Satu order dalam penerbangan per nomor: dua tab / dua klik paralel tidak boleh
-- sama-sama mencetak order. Ini yang menutup race "dua request bersamaan".
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_inflight_phone
  ON checkout_claims (tenant_id, phone)
  WHERE status = 'in_flight';

-- ============================================================================
-- 5. RPC primitif: catat SATU event consent (+ aturan urutan)
-- ============================================================================
-- Daftar sumber yang dianggap "BERHENTI eksplisit" (dipakai jalur STOP N2:
-- tombol OPTOUT / kata kunci BERHENTI). Satu tempat supaya `opted_out` tidak
-- pernah diartikan berbeda di dua modul.
CREATE OR REPLACE FUNCTION unsubscribe_sources()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT ARRAY['whatsapp_optout', 'whatsapp_stop', 'user_stop']::TEXT[];
$function$;
REVOKE ALL ON FUNCTION unsubscribe_sources() FROM PUBLIC, anon, authenticated;
-- service_role tetap butuh EXECUTE eksplisit: setelah REVOKE dari PUBLIC, ia
-- TIDAK lagi mewarisi grant default (ini pernah bikin RPC consent 403).
GRANT EXECUTE ON FUNCTION unsubscribe_sources() TO service_role;

-- Dipakai jalur web (checkout) dan nanti jalur outbound (N1/N2: OPTOUT/BERHENTI).
-- Aturan yang ditegakkan di sini, bukan di pemanggil:
--   * satu peristiwa logis = satu baris (unique idempotency_key) — replay tidak
--     mengubah status;
--   * status efektif SELALU diturunkan dari event terbaru; event dengan
--     `occurred_at` lebih tua TIDAK menurunkan status;
--   * saat `occurred_at` seri, nilai `false` (berhenti/menolak) yang menang.
-- `occurred_at` di-clamp ke `now()`: tidak ada timestamp masa depan dari luar.
CREATE OR REPLACE FUNCTION record_consent_event(
  p_phone TEXT,
  p_type TEXT,
  p_value BOOLEAN,
  p_source TEXT,
  p_text_version TEXT,
  p_idempotency_key TEXT,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_occurred TIMESTAMPTZ;
  v_user_id UUID;
  v_event_id UUID;
  v_eff RECORD;
BEGIN
  IF p_phone !~ '^62[0-9]{8,13}$' THEN
    RETURN json_build_object('status', 'invalid_phone');
  END IF;
  IF p_type NOT IN ('terms', 'reminder_whatsapp') THEN
    RETURN json_build_object('status', 'invalid_type');
  END IF;
  IF p_value IS NULL THEN
    RETURN json_build_object('status', 'invalid_value');
  END IF;

  -- Jalur cepat replay: peristiwa yang sama tidak menyentuh apa pun.
  IF EXISTS (
    SELECT 1 FROM consent_events
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN json_build_object('status', 'duplicate', 'applied', false);
  END IF;

  v_occurred := LEAST(COALESCE(p_occurred_at, now()), now());

  -- `users.opt_in/opted_out` = status EFEKTIF yang dibaca Nina, jadi consent harus
  -- punya baris users sebagai rumahnya. Dibuat di sini (bukan sebelumnya) supaya
  -- baris user hanya lahir dari consent yang benar-benar tercatat.
  -- Bandingkan DIGIT saja: `users.phone` di staging tersimpan `+62…`, app memakai `62…`.
  SELECT id INTO v_user_id
  FROM users
  WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
      IN (p_phone, '0' || substring(p_phone from 3))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    INSERT INTO users (phone) VALUES (p_phone)
    ON CONFLICT (phone) DO UPDATE SET updated_at = users.updated_at
    RETURNING id INTO v_user_id;
  END IF;

  INSERT INTO consent_events (
    tenant_id, user_id, phone, consent_type, value, source, text_version,
    occurred_at, idempotency_key
  ) VALUES (
    p_tenant_id, v_user_id, p_phone, p_type, p_value, p_source, p_text_version,
    v_occurred, p_idempotency_key
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    -- Replay peristiwa yang sama: TIDAK menulis ulang status.
    RETURN json_build_object('status', 'duplicate', 'applied', false);
  END IF;

  -- Seri dipecah dengan `false` menang (opt-out lebih kuat), bukan oleh urutan
  -- kedatangan baris.
  SELECT consent_type, value, text_version, occurred_at, created_at INTO v_eff
  FROM consent_events
  WHERE tenant_id = p_tenant_id AND phone = p_phone AND consent_type = p_type
  ORDER BY occurred_at DESC, (value = false) DESC, created_at DESC, id DESC
  LIMIT 1;

  IF v_eff.consent_type = 'reminder_whatsapp' THEN
    -- `opt_in` = nilai event terbaru.
    -- `opted_out` = HANYA true kalau ada peristiwa BERHENTI eksplisit yang
    -- setidaknya sebaru event terbaru. Menolak pengingat saat checkout
    -- (`value=false`, sumber web) berarti "tidak ikut", BUKAN "berhenti":
    -- keduanya sama-sama menghalangi kirim (engine menuntut opt_in=true), tapi
    -- yang kedua adalah status yang dibaca jalur STOP dan tidak boleh dipalsukan.
    UPDATE users
      SET opt_in = v_eff.value,
          opted_out = CASE
            WHEN v_eff.value THEN false
            ELSE EXISTS (
              SELECT 1 FROM consent_events s
              WHERE s.tenant_id = p_tenant_id AND s.phone = p_phone
                AND s.consent_type = 'reminder_whatsapp'
                AND s.value = false
                AND s.source = ANY (unsubscribe_sources())
                AND (s.occurred_at, s.created_at) >= (v_eff.occurred_at, v_eff.created_at)
            )
          END,
          updated_at = now()
      WHERE id = v_user_id;
  END IF;

  RETURN json_build_object(
    'status', 'recorded',
    'applied', (v_eff.occurred_at = v_occurred),
    'text_version', v_eff.text_version,
    'value', v_eff.value
  );
END;
$function$;

-- ============================================================================
-- 6. RPC checkout: tulis KEDUA event consent (T&C + pengingat) satu transaksi
-- ============================================================================
-- `false` untuk pengingat TETAP disimpan (bukan "tidak ada baris").
CREATE OR REPLACE FUNCTION record_checkout_consent(
  p_phone TEXT,
  p_terms_version TEXT,
  p_terms_value BOOLEAN,
  p_reminder_value BOOLEAN,
  p_reminder_version TEXT,
  p_source TEXT,
  p_idempotency_key TEXT,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_terms JSON;
  v_reminder JSON;
BEGIN
  v_terms := record_consent_event(
    p_phone, 'terms', p_terms_value, p_source, p_terms_version,
    p_idempotency_key || ':terms', now(), p_tenant_id
  );
  IF v_terms->>'status' NOT IN ('recorded', 'duplicate') THEN
    RETURN json_build_object('status', v_terms->>'status');
  END IF;

  v_reminder := record_consent_event(
    p_phone, 'reminder_whatsapp', p_reminder_value, p_source, p_reminder_version,
    p_idempotency_key || ':reminder', now(), p_tenant_id
  );
  IF v_reminder->>'status' NOT IN ('recorded', 'duplicate') THEN
    -- Sengaja: tidak ada `false` yang ditelan diam-diam.
    RETURN json_build_object('status', v_reminder->>'status', 'partial', true);
  END IF;

  RETURN json_build_object(
    'status', 'ok',
    'terms', v_terms,
    'reminder', v_reminder
  );
END;
$function$;

-- ============================================================================
-- 7. RPC: simpan satu langkah onboarding (server-side, terikat nomor terverifikasi)
-- ============================================================================
-- `p_data` sudah divalidasi server (TS) sebelum dikirim; RPC menyimpan apa adanya
-- dan menaikkan `step_reached` monotonik.
CREATE OR REPLACE FUNCTION save_onboarding_step(
  p_phone TEXT,
  p_step INTEGER,
  p_data JSONB,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF p_phone !~ '^62[0-9]{8,13}$' THEN
    RETURN json_build_object('status', 'invalid_phone');
  END IF;
  IF p_step IS NULL OR p_step < 1 OR p_step > 9 THEN
    RETURN json_build_object('status', 'invalid_step');
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN json_build_object('status', 'invalid_data');
  END IF;

  INSERT INTO onboarding_progress (tenant_id, phone, steps, step_reached, updated_at)
  VALUES (p_tenant_id, p_phone, jsonb_build_object(p_step::text, p_data), p_step, now())
  ON CONFLICT (tenant_id, phone) DO UPDATE
    SET steps = onboarding_progress.steps || jsonb_build_object(p_step::text, p_data),
        step_reached = GREATEST(onboarding_progress.step_reached, p_step),
        updated_at = now();

  RETURN json_build_object('status', 'saved', 'step', p_step);
END;
$function$;

-- ============================================================================
-- 8. RPC: gate + klaim checkout ATOMIK (satu pintu sebelum order eksternal)
-- ============================================================================
-- Urutan di dalam satu transaksi:
--   1. kunci per nomor (advisory) supaya dua request paralel tidak sama-sama lolos;
--   2. replay: idempotency key yang sudah `created` -> kembalikan order yang SAMA
--      (tidak ada panggilan Scalev kedua);
--   3. klaim in-flight yang basi (worker mati) di-expire;
--   4. langkah wajib: semua harus ADA di `onboarding_progress.steps` (isi datanya
--      divalidasi ulang di TS sebelum order dibuat);
--   5. T&C: harus ada event `terms` dengan value true untuk versi yang diminta;
--   6. baru: klaim `in_flight`.
-- Return: {status, missing_steps, claim_id, order_id, payment_url}
CREATE OR REPLACE FUNCTION claim_checkout_order(
  p_phone TEXT,
  p_required_steps INTEGER[],
  p_plan_key TEXT,
  p_terms_version TEXT,
  p_idempotency_key TEXT,
  p_inflight_ttl_seconds INTEGER DEFAULT 600,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_steps JSONB;
  v_missing INTEGER[];
  v_terms BOOLEAN;
  v_existing RECORD;
  v_claim_id UUID;
BEGIN
  IF p_phone !~ '^62[0-9]{8,13}$' THEN
    RETURN json_build_object('status', 'invalid_phone');
  END IF;
  IF p_plan_key NOT IN ('month', 'quarter', 'half', 'year') THEN
    RETURN json_build_object('status', 'invalid_plan');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id || ':checkout:' || p_phone));

  -- 2. Replay idempotent: order yang sudah tercetak dikembalikan apa adanya.
  SELECT id, status, order_id, payment_url INTO v_existing
  FROM checkout_claims
  WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.status = 'created' THEN
      RETURN json_build_object(
        'status', 'already_created',
        'claim_id', v_existing.id,
        'order_id', v_existing.order_id,
        'payment_url', v_existing.payment_url
      );
    END IF;
    IF v_existing.status = 'in_flight' THEN
      RETURN json_build_object('status', 'in_flight', 'claim_id', v_existing.id);
    END IF;
    -- 'failed': percobaan sebelumnya gagal; barisnya dipakai ulang.
    UPDATE checkout_claims
      SET status = 'in_flight', plan_key = p_plan_key, updated_at = now()
      WHERE id = v_existing.id
      RETURNING id INTO v_claim_id;
    RETURN json_build_object('status', 'granted', 'claim_id', v_claim_id);
  END IF;

  -- 3. Klaim in-flight basi tidak boleh mengunci nomor selamanya.
  UPDATE checkout_claims
    SET status = 'failed', updated_at = now()
    WHERE tenant_id = p_tenant_id AND phone = p_phone AND status = 'in_flight'
      AND created_at < now() - make_interval(secs => p_inflight_ttl_seconds);

  -- 4. Langkah wajib.
  SELECT steps INTO v_steps
  FROM onboarding_progress
  WHERE tenant_id = p_tenant_id AND phone = p_phone;

  SELECT array_agg(s) INTO v_missing
  FROM unnest(p_required_steps) AS s
  WHERE v_steps IS NULL OR NOT (v_steps ? s::text);

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RETURN json_build_object(
      'status', 'incomplete_onboarding',
      'missing_steps', to_json(v_missing)
    );
  END IF;

  -- 5. T&C versi yang diminta harus sudah disetujui (event terbaru untuk versi itu).
  SELECT bool_or(value) INTO v_terms
  FROM consent_events
  WHERE tenant_id = p_tenant_id AND phone = p_phone AND consent_type = 'terms'
    AND text_version = p_terms_version
    AND occurred_at = (
      SELECT max(occurred_at) FROM consent_events
      WHERE tenant_id = p_tenant_id AND phone = p_phone AND consent_type = 'terms'
        AND text_version = p_terms_version
    );

  IF COALESCE(v_terms, false) IS NOT TRUE THEN
    RETURN json_build_object('status', 'consent_required');
  END IF;

  -- 6. Klaim. Kalau nomor ini sudah punya order in-flight (tab lain), unique index
  -- parsial yang menolak — bukan pengecekan "baca dulu" yang bisa balapan.
  BEGIN
    INSERT INTO checkout_claims (tenant_id, phone, idempotency_key, plan_key, status)
    VALUES (p_tenant_id, p_phone, p_idempotency_key, p_plan_key, 'in_flight')
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('status', 'in_flight');
  END;

  RETURN json_build_object('status', 'granted', 'claim_id', v_claim_id);
END;
$function$;

-- ============================================================================
-- 9. RPC: tutup klaim (sukses / gagal)
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_checkout_claim(
  p_claim_id UUID,
  p_order_id TEXT,
  p_payment_url TEXT,
  p_amount INTEGER DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  UPDATE checkout_claims
    SET status = 'created',
        order_id = p_order_id,
        payment_url = p_payment_url,
        amount = p_amount,
        updated_at = now()
    WHERE id = p_claim_id AND status = 'in_flight';

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;
  RETURN json_build_object('status', 'completed');
END;
$function$;

CREATE OR REPLACE FUNCTION release_checkout_claim(
  p_claim_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  UPDATE checkout_claims
    SET status = 'failed', updated_at = now()
    WHERE id = p_claim_id AND status = 'in_flight';

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;
  RETURN json_build_object('status', 'released');
END;
$function$;

-- ============================================================================
-- 10. RPC baca: status consent efektif (dipakai gate/jalur baca Nina)
-- ============================================================================
CREATE OR REPLACE FUNCTION consent_state_for_phone(
  p_phone TEXT,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT json_build_object(
    'phone', p_phone,
    'opt_in', COALESCE((
      SELECT u.opt_in FROM users u
      WHERE regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')
            IN (p_phone, '0' || substring(p_phone from 3))
      LIMIT 1
    ), false),
    'opted_out', COALESCE((
      SELECT u.opted_out FROM users u
      WHERE regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')
            IN (p_phone, '0' || substring(p_phone from 3))
      LIMIT 1
    ), false),
    'terms_accepted', COALESCE((
      SELECT e.value FROM consent_events e
      WHERE e.tenant_id = p_tenant_id AND e.phone = p_phone AND e.consent_type = 'terms'
      ORDER BY e.occurred_at DESC, (e.value = false) DESC, e.created_at DESC, e.id DESC
      LIMIT 1
    ), false),
    'terms_version', (
      SELECT e.text_version FROM consent_events e
      WHERE e.tenant_id = p_tenant_id AND e.phone = p_phone AND e.consent_type = 'terms'
      ORDER BY e.occurred_at DESC, (e.value = false) DESC, e.created_at DESC, e.id DESC
      LIMIT 1
    )
  );
$function$;

-- ============================================================================
-- 11. Grants + RLS
-- ============================================================================
-- Semua RPC di file ini HANYA dipanggil server (service_role lewat PostgREST).
-- Supabase + harness memberi EXECUTE default ke PUBLIC/anon/authenticated → cabut.
REVOKE ALL ON FUNCTION record_consent_event(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_checkout_consent(TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_onboarding_step(TEXT, INTEGER, JSONB, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_checkout_order(TEXT, INTEGER[], TEXT, TEXT, TEXT, INTEGER, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_checkout_claim(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_checkout_claim(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION consent_state_for_phone(TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_consent_event(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION record_checkout_consent(TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION save_onboarding_step(TEXT, INTEGER, JSONB, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION claim_checkout_order(TEXT, INTEGER[], TEXT, TEXT, TEXT, INTEGER, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION complete_checkout_claim(UUID, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_checkout_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION consent_state_for_phone(TEXT, VARCHAR) TO service_role;

-- `consent_events` = bukti: service_role boleh baca + tambah, TIDAK boleh ubah/hapus
-- (trigger menolak juga, ini lapisan kedua).
GRANT SELECT, INSERT ON consent_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON onboarding_progress TO service_role;
GRANT SELECT, INSERT, UPDATE ON checkout_claims TO service_role;

ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_claims ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['consent_events', 'onboarding_progress', 'checkout_claims']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'deny_client_access_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY deny_client_access_%I ON %I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        t, t
      );
    END IF;
  END LOOP;
END $$;
