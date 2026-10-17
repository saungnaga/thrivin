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
  -- F-W4-1c: DUA id, dan keduanya dipakai untuk hal berbeda.
  --   `order_id`          = nomor order BISNIS (mis. 250130JQHFZG) — yang di-join webhook.
  --   `scalev_order_uuid` = canonical UUIDv7 (`orderData.id`) — SATU-SATUNYA nilai yang
  --                         diterima `POST /v3/orders/change-status` (schema `ids` =
  --                         `OrderPrimaryKeyInput`: UUIDv7 atau legacy numerik; nomor
  --                         bisnis BUKAN keduanya ⇒ mengirim `order_id` selalu ditolak).
  order_id TEXT,
  scalev_order_uuid TEXT,
  payment_url TEXT,
  amount INTEGER,
  -- F-W4-1: diisi webhook pembayaran (mark_checkout_claim_paid). Dipakai untuk
  -- membedakan "order belum dibayar yang masih hidup" (dipakai ulang / memblokir
  -- paket lain) dari riwayat order yang sudah lunas (pembelian ulang sah).
  paid_at TIMESTAMPTZ,
  -- F-W4-1c audit cancel. Semuanya NON-PII: hitungan, error ter-redact (<=200 char),
  -- jadwal retry, lease attempt, dan jejak pembayaran telat. Nomor WhatsApp, nama,
  -- email, token, dan raw payload upstream TIDAK PERNAH masuk kolom-kolom ini.
  cancel_attempts INTEGER NOT NULL DEFAULT 0,
  cancel_last_error TEXT,
  cancel_next_retry_at TIMESTAMPTZ,
  cancel_claimed_at TIMESTAMPTZ,
  cancel_claimed_until TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  late_payment_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- F-W4-1c lifecycle. Migrasi aditif (staging/migration-fw41c-cancel.sql) yang
  -- memperluas constraint di DB yang sudah memuat versi lama file ini.
  CONSTRAINT checkout_claims_status_check
    CHECK (status IN ('in_flight', 'created', 'cancel_pending', 'retired', 'cancel_failed', 'failed')),
  CONSTRAINT checkout_claims_phone_check CHECK (phone ~ '^62[0-9]{8,13}$'),
  CONSTRAINT checkout_claims_idem_check CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT checkout_claims_plan_check CHECK (plan_key IN ('month', 'quarter', 'half', 'year')),
  CONSTRAINT checkout_claims_cancel_error_check
    CHECK (cancel_last_error IS NULL OR length(cancel_last_error) <= 200)
);

-- F-W4-1c: kunci idempotensi kini PARTIAL — hanya state AKTIF yang dijaga.
-- Baris `retired`/`failed` tidak ikut, supaya kunci yang ordernya sudah
-- dibatalkan/dilepas boleh dipakai ulang (M-2) tanpa menghapus bukti baris lama
-- (yang masih diperlukan join webhook order lama). Satu transaksi + DROP
-- mendahului CREATE (nama index sama): tanpa DROP, `IF NOT EXISTS` diam-diam
-- mempertahankan index lama yang menjepit SEMUA state = replay `retired` 500.
BEGIN;
DROP INDEX IF EXISTS uq_checkout_claims_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_idempotency
  ON checkout_claims (tenant_id, idempotency_key)
  WHERE status IN ('in_flight', 'created', 'cancel_pending', 'cancel_failed');
COMMIT;

-- Satu order HIDUP per nomor: dua tab / dua klik paralel tidak boleh sama-sama
-- mencetak order. "Hidup" = belum dibayar dan belum di-retire, yaitu
-- `in_flight` (Scalev belum menjawab) ATAU `created` yang belum lunas.
--
-- Kenapa `created` ikut dijaga (W4RX4 T1): langkah 6 (`SELECT ... status='created'
-- AND paid_at IS NULL`) dan langkah 7 (`INSERT`) di `claim_checkout_order` berada
-- di snapshot READ COMMITTED yang BERBEDA. Kalau commit `complete_checkout_claim`
-- milik request pertama menyelip di antara keduanya, langkah 6 tidak melihat baris
-- `created` itu dan INSERT lolos — index yang hanya menjaga `in_flight` sudah
-- kehilangan penjaganya tepat pada saat itu ⇒ DUA order belum-dibayar hidup.
-- Dengan `created` ikut dijaga, INSERT request kedua ditahan index sampai commit
-- itu selesai, lalu ditolak (unique_violation ⇒ `in_flight` ⇒ route 409).
--
-- `paid_at IS NULL` wajib ada di predikat: pembelian ULANG setelah lunas (dan
-- setelah retire TTL 3b menandai baris 'failed') harus tetap boleh.
--
-- Nama index DIGANTI (bukan `IF NOT EXISTS` dengan nama lama): seed.sh/apply
-- mengulang file ini ke DB yang sudah ada, dan `CREATE ... IF NOT EXISTS` bernama
-- sama akan DIAM-DIAM mempertahankan index lama yang lebih sempit = lubang tetap
-- terbuka. Karena itu index lama di-DROP, dan penjaganya diverifikasi lewat
-- `pg_indexes` di dokumen bukti.
--
-- URUTAN + SATU TRANSAKSI (W4RX4 T1 follow-up F-1): file ini diapply
-- per-statement (`psql -v ON_ERROR_STOP=1 -f -`, autocommit). Tanpa blok di bawah,
-- DROP yang mendahului CREATE COMMIT lebih dulu, lalu CREATE gagal (mis. DB sudah
-- memuat >=2 baris hidup untuk satu nomor) dan DB tertinggal TANPA penjaga
-- per-nomor sama sekali — kegagalan apply justru meninggalkan DB LEBIH LEMAH dari
-- sebelum apply, di kondisi yang paling butuh penjaganya. CREATE dulu ⇒ gagal =
-- index lama masih berdiri; DROP belakangan ⇒ tidak pernah ada keadaan separuh.
-- `CREATE INDEX` non-concurrent memegang ACCESS EXCLUSIVE sebentar: apply saat
-- trafik rendah, dan jalankan pre-check duplikat (lihat dokumen bukti §5) SEBELUM
-- apply — kalau ada duplikat, CREATE memang harus gagal; bersihkan datanya dulu,
-- jangan tempel index-nya.
-- F-W4-1c: state cancel IKUT menahan. Baris `cancel_pending`/`cancel_failed`
-- berarti order Scalev-nya BELUM terbukti mati ⇒ mencetak order kedua untuk
-- nomor itu persis lubang yang ditutup kartu ini. `retired` sengaja TIDAK ikut
-- (semua ID sudah terverifikasi canceled ⇒ replacement sah), begitu pula
-- `failed` tanpa order.
--
-- Nama index SAMA seperti versi lama ⇒ DROP wajib mendahului CREATE di dalam
-- SATU transaksi. Transaksi tunggal membuat DDL-nya atomik: kalau CREATE gagal
-- (mis. DB masih memuat >=2 baris hidup untuk satu nomor), DROP-nya ikut
-- di-rollback dan index lama tetap berdiri — tidak pernah ada keadaan separuh.
BEGIN;
DROP INDEX IF EXISTS uq_checkout_claims_live_phone;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_live_phone
  ON checkout_claims (tenant_id, phone)
  WHERE status IN ('in_flight', 'created', 'cancel_pending', 'cancel_failed')
    AND paid_at IS NULL;
DROP INDEX IF EXISTS uq_checkout_claims_inflight_phone;
COMMIT;

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
--   2. replay: idempotency key yang sudah PERNAH mencetak order -> kembalikan order
--      yang SAMA (termasuk baris `failed` yang order-nya masih tersimpan, mis.
--      hasil retire TTL 3b — kunci sama = order sama, lihat F-W4-1b); order yang
--      SUDAH DIBAYAR dibalas `already_paid` tanpa link (W4RX4 T2);
--   3. klaim in-flight yang basi (worker mati) di-expire; klaim 'created' yang
--      belum dibayar & sudah lewat TTL juga dianggap ditinggalkan (status failed);
--   4. langkah wajib: semua harus ADA di `onboarding_progress.steps` (isi datanya
--      divalidasi ulang di TS sebelum order dibuat);
--   5. T&C: harus ada event `terms` dengan value true untuk versi yang diminta;
--   6. F-W4-1 (keputusan owner 16/10, opsi a): kalau nomor ini MASIH punya order
--      belum dibayar yang hidup → paket SAMA: kembalikan order itu (`reuse_unpaid`,
--      tanpa order kedua); paket BEDA: `unpaid_conflict` (route balas 409);
--   7. baru: klaim `in_flight`.
-- Return: {status, missing_steps, claim_id, order_id, payment_url, plan_key}
--
-- F-W4-1c: helper kecil untuk jalur `unique_violation` penjaga per-nomor. Kalau
-- yang menahan nomor ini ternyata baris cancel (bukan `in_flight`), jawabannya
-- harus sejujurnya begitu — kalau tidak, pelanggan melihat "ORDER_IN_FLIGHT"
-- padahal ordernya sedang/gagal dicancel dan butuh jalur lain.
CREATE OR REPLACE FUNCTION blocked_live_status(
  p_tenant_id VARCHAR,
  p_phone TEXT
) RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT COALESCE((
    SELECT c.status FROM checkout_claims c
    WHERE c.tenant_id = p_tenant_id AND c.phone = p_phone
      AND c.status IN ('cancel_pending', 'cancel_failed') AND c.paid_at IS NULL
    ORDER BY c.created_at DESC
    LIMIT 1
  ), 'in_flight');
$function$;

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
  v_unpaid RECORD;
  v_blocked RECORD;
  v_blocked_status TEXT;
  v_claim_id UUID;
  -- F-W4-1: umur maksimum order BELUM DIBAYAR yang masih dianggap hidup.
  -- ponytail: konstanta tetap (60 menit); jadi parameter kalau ops butuh tuning.
  v_unpaid_ttl CONSTANT INTERVAL := INTERVAL '60 minutes';
BEGIN
  IF p_phone !~ '^62[0-9]{8,13}$' THEN
    RETURN json_build_object('status', 'invalid_phone');
  END IF;
  IF p_plan_key NOT IN ('month', 'quarter', 'half', 'year') THEN
    RETURN json_build_object('status', 'invalid_plan');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id || ':checkout:' || p_phone));

  -- 2. Replay idempotent: order yang sudah tercetak dikembalikan apa adanya.
  -- F-W4-1c (M-2): sejak `uq_checkout_claims_idempotency` jadi PARTIAL, satu kunci
  -- bisa punya >1 baris (mis. `retired` + klaim `in_flight` baru). Yang dibaca
  -- replay WAJIB baris AKTIF lebih dulu; baris terminal hanya sisa bukti + join
  -- webhook order lama dan tidak boleh menentukan jawaban.
  SELECT id, phone, status, order_id, scalev_order_uuid, payment_url, paid_at INTO v_existing
  FROM checkout_claims
  WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
  ORDER BY (status IN ('in_flight', 'created', 'cancel_pending', 'cancel_failed')) DESC,
           created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- F-S1: Kunci terikat ke nomor pembuat pertama. Replay lintas-nomor ditolak fail-closed.
    IF v_existing.phone <> p_phone THEN
      RETURN json_build_object('status', 'key_conflict');
    END IF;

    -- W4RX4 T3: `order_id = ''` BUKAN order. Kolomnya mengizinkan string kosong
    -- (hanya RPC langsung yang bisa menulisnya — route selalu mengisi hasil
    -- Scalev), dan `'' IS NOT NULL` MEMUASKAN pemeriksaan "sudah punya order" di
    -- bawah: kunci ini menjawab `already_created` dengan order_id kosong
    -- SEKALIGUS tidak bisa dipakai ulang ⇒ nyangkut permanen. Dinormalisasi satu
    -- kali di sini, di titik masuk jalur replay — sama seperti
    -- `mark_checkout_claim_paid` yang memperlakukan order_id kosong sebagai bukan
    -- order. Nol perubahan signature.
    -- ponytail: menutup JALUR BACA saja, dan sengaja HANYA di sini. `created`
    -- tanpa order_id TIDAK digrant ulang di bawah (status itu MENGAKU ada order —
    -- melepasnya berarti mencetak order kedua). Kalau nanti butuh invariant keras,
    -- tutup di tulis (CHECK order_id <> '') — itu keputusan ops kalau baris ''
    -- sudah telanjur ada di DB.
    v_existing.order_id := NULLIF(v_existing.order_id, '');

    -- W4RX4 T2: order yang SUDAH LUNAS tidak pernah boleh menerima link bayarnya
    -- kembali. UI langsung `window.location.href = paymentUrl`, jadi replay kunci
    -- lama pada baris yang ordernya sudah dibayar (mis. baris `failed` hasil retire
    -- 3b yang kemudian dibayar, atau baris `created` yang dibayar webhook) akan
    -- melempar pembeli ke halaman pembayaran order yang sudah dibayar. Dibalas
    -- `already_paid` TANPA order_id/payment_url; route menjawab 409.
    IF v_existing.paid_at IS NOT NULL THEN
      RETURN json_build_object('status', 'already_paid', 'claim_id', v_existing.id);
    END IF;

    IF v_existing.status = 'created' THEN
      -- F-W4-1c (M-2): `created` yang order/link-nya tidak lengkap BUKAN order yang
      -- bisa dipakai ulang (link kosong = UI redirect ke halaman kosong, dan kunci
      -- nyangkut). Barisnya dipertahankan untuk rekonsiliasi ops, bukan dikarang.
      IF v_existing.order_id IS NULL OR COALESCE(v_existing.payment_url, '') = '' THEN
        RETURN json_build_object('status', 'checkout_reconciliation', 'claim_id', v_existing.id);
      END IF;
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
    -- F-W4-1c (M-2): order yang cancel-nya belum tuntas MENAHAN nomor ini. Router
    -- memakai state ini untuk memicukan worker cancel (fail-closed sampai sukses).
    IF v_existing.status IN ('cancel_pending', 'cancel_failed') THEN
      RETURN json_build_object('status', v_existing.status, 'claim_id', v_existing.id);
    END IF;
    -- F-W4-1c: `retired` = cancel sudah diverifikasi upstream, jadi link lama MATI.
    -- Kunci ini dipakai ulang untuk klaim BARU, bukan mengembalikan link mati itu.
    -- `uq_checkout_claims_idempotency` sudah partial ⇒ baris terminal tidak menjepit.
    IF v_existing.status = 'retired' THEN
      -- Tapi kalau nomor ini SUDAH punya order hidup (mis. tab lain sudah dapat
      -- pengganti), jawab dengan order itu — jangan mencetak order ketiga.
      SELECT id, plan_key, order_id, payment_url INTO v_unpaid
      FROM checkout_claims
      WHERE tenant_id = p_tenant_id AND phone = p_phone
        AND status = 'created' AND paid_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1;
      IF FOUND THEN
        IF v_unpaid.plan_key = p_plan_key THEN
          RETURN json_build_object(
            'status', 'reuse_unpaid',
            'claim_id', v_unpaid.id,
            'order_id', v_unpaid.order_id,
            'payment_url', v_unpaid.payment_url
          );
        END IF;
        RETURN json_build_object(
          'status', 'unpaid_conflict',
          'claim_id', v_unpaid.id,
          'plan_key', v_unpaid.plan_key
        );
      END IF;
      BEGIN
        INSERT INTO checkout_claims (tenant_id, phone, idempotency_key, plan_key, status)
        VALUES (p_tenant_id, p_phone, p_idempotency_key, p_plan_key, 'in_flight')
        RETURNING id INTO v_claim_id;
      EXCEPTION WHEN unique_violation THEN
        -- Nomor ini masih punya order HIDUP dari kunci lain ⇒ jawab seperti biasa.
        RETURN json_build_object('status', blocked_live_status(p_tenant_id, p_phone));
      END;
      RETURN json_build_object('status', 'granted', 'claim_id', v_claim_id);
    END IF;
    -- F-W4-1b (baris `failed` dari retire versi LAMA, sebelum state cancel ada):
    -- kunci ini tetap milik order itu — grant ulang akan mencetak order KEDUA
    -- untuk kunci yang sama padahal order pertama belum dibayar.
    IF v_existing.order_id IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'already_created',
        'claim_id', v_existing.id,
        'order_id', v_existing.order_id,
        'payment_url', v_existing.payment_url
      );
    END IF;
    -- Punya canonical ID tapi tanpa nomor bisnis: bukan order yang bisa
    -- dipertanggungjawabkan ke pelanggan ⇒ tahan untuk rekonsiliasi, jangan karang.
    IF COALESCE(v_existing.scalev_order_uuid, '') <> '' THEN
      RETURN json_build_object('status', 'checkout_reconciliation', 'claim_id', v_existing.id);
    END IF;
    -- 'failed' TANPA order: percobaan sebelumnya gagal sebelum order tercetak
    -- (release_checkout_claim) ⇒ aman dipakai ulang (hanya untuk nomor sama).
    -- W4RX4 F-2: baris ini juga bisa ditahan `uq_checkout_claims_live_phone`
    -- kalau nomor itu sudah punya order HIDUP dari kunci LAIN (K1 dilepas,
    -- K2 mencetak order). Tanpa EXCEPTION, unique_violation naik mentah ⇒
    -- PostgREST 500 ⇒ route balas 503 GATE_UNAVAILABLE, bukan 409
    -- ORDER_IN_FLIGHT — pelanggan mentok sampai order penahan lunas/retire.
    -- Sama seperti langkah 7: tolak lewat jawaban, bukan lewat error.
    BEGIN
      UPDATE checkout_claims
        SET status = 'in_flight', plan_key = p_plan_key, updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_claim_id;
    EXCEPTION WHEN unique_violation THEN
      RETURN json_build_object('status', blocked_live_status(p_tenant_id, p_phone));
    END;
    RETURN json_build_object('status', 'granted', 'claim_id', v_claim_id);
  END IF;

  -- 3. Klaim in-flight basi tidak boleh mengunci nomor selamanya.
  UPDATE checkout_claims
    SET status = 'failed', updated_at = now()
    WHERE tenant_id = p_tenant_id AND phone = p_phone AND status = 'in_flight'
      AND created_at < now() - make_interval(secs => p_inflight_ttl_seconds);

  -- 3b. F-W4-1c: order belum dibayar yang lewat TTL harus DIBATALKAN sebelum
  -- nomor ini boleh mendapat order baru. RPC ini TIDAK memanggil Scalev (tidak
  -- ada pg_net/http dari SQL) — ia hanya memindahkan state; worker/route yang
  -- melakukan HTTP cancel. `order_id`/`payment_url` sengaja dibiarkan: kunci lama
  -- yang di-replay tetap dijawab dengan order itu (langkah 2), bukan order baru.
  UPDATE checkout_claims
    SET status = 'cancel_pending',
        cancel_next_retry_at = now(),
        cancel_last_error = NULL,
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND phone = p_phone AND status = 'created'
      AND paid_at IS NULL
      AND scalev_order_uuid IS NOT NULL AND scalev_order_uuid <> ''
      AND created_at < now() - v_unpaid_ttl;

  -- 3c. Order TTL TANPA canonical ID (baris pra-F-W4-1c) tidak boleh dicancel
  -- dengan ID tebakan — `order_id` bisnis ditolak schema `ids` — dan tidak boleh
  -- dilepas diam-diam: antrean backfill/rekonsiliasi owner. State
  -- `cancel_failed` tetap MENAHAN nomor (penjaga per-nomor), jadi tidak ada
  -- order kedua yang lahir di belakang link yang masih hidup.
  UPDATE checkout_claims
    SET status = 'cancel_failed',
        cancel_last_error = COALESCE(cancel_last_error, 'missing_canonical_order_id'),
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND phone = p_phone AND status = 'created'
      AND paid_at IS NULL
      AND (scalev_order_uuid IS NULL OR scalev_order_uuid = '')
      AND created_at < now() - v_unpaid_ttl;

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
  -- F-S7: Aturan tie-break konsisten: jika terjadi seri occurred_at, `false` menang (fail-closed).
  SELECT value INTO v_terms
  FROM consent_events
  WHERE tenant_id = p_tenant_id AND phone = p_phone AND consent_type = 'terms'
    AND text_version = p_terms_version
  ORDER BY occurred_at DESC, (value = false) DESC, created_at DESC, id DESC
  LIMIT 1;

  IF COALESCE(v_terms, false) IS NOT TRUE THEN
    RETURN json_build_object('status', 'consent_required');
  END IF;

  -- 6. F-W4-1c: order yang cancel-nya BELUM terbukti (cancel_pending) atau gagal
  -- terminal (cancel_failed) menahan checkout. Route memetakan ini ke 409/423
  -- TANPA order_id/payment_url dan tanpa INSERT order baru. `retired` sengaja
  -- tidak ikut: link lamanya sudah mati ⇒ replacement sah.
  SELECT id, status INTO v_blocked
  FROM checkout_claims
  WHERE tenant_id = p_tenant_id AND phone = p_phone
    AND status IN ('cancel_pending', 'cancel_failed') AND paid_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('status', v_blocked.status, 'claim_id', v_blocked.id);
  END IF;

  -- 6b. F-W4-1 (opsi a): satu nomor tidak boleh mencetak order BELUM DIBAYAR kedua.
  SELECT id, plan_key, order_id, payment_url INTO v_unpaid
  FROM checkout_claims
  WHERE tenant_id = p_tenant_id AND phone = p_phone
    AND status = 'created' AND paid_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_unpaid.plan_key = p_plan_key THEN
      -- Paket SAMA → kembalikan order/link yang sama (tidak ada order kedua).
      RETURN json_build_object(
        'status', 'reuse_unpaid',
        'claim_id', v_unpaid.id,
        'order_id', v_unpaid.order_id,
        'payment_url', v_unpaid.payment_url
      );
    END IF;
    -- Paket BEDA → blokir eksplisit; route menjawab 409 tanpa data order apa pun.
    RETURN json_build_object(
      'status', 'unpaid_conflict',
      'claim_id', v_unpaid.id,
      'plan_key', v_unpaid.plan_key
    );
  END IF;

  -- 7. Klaim. Kalau nomor ini sudah punya order HIDUP (in-flight, atau order belum
  -- dibayar yang baru saja dicetak request lain), unique index parsial
  -- `uq_checkout_claims_live_phone` yang menolak — bukan pengecekan "baca dulu"
  -- yang bisa balapan (W4RX4 T1: langkah 6 di atas bisa saja snapshot-nya lebih
  -- tua dari commit `complete` milik request lain).
  BEGIN
    INSERT INTO checkout_claims (tenant_id, phone, idempotency_key, plan_key, status)
    VALUES (p_tenant_id, p_phone, p_idempotency_key, p_plan_key, 'in_flight')
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('status', blocked_live_status(p_tenant_id, p_phone));
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
  p_amount INTEGER DEFAULT NULL,
  p_scalev_order_uuid TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  -- F-W4-1c: canonical UUID (`orderData.id`) disimpan di kolom SENDIRI. Nomor
  -- bisnis `p_order_id` tetap dipakai webhook untuk join; endpoint cancel hanya
  -- menerima canonical ID, jadi keduanya wajib ada.
  UPDATE checkout_claims
    SET status = 'created',
        order_id = p_order_id,
        scalev_order_uuid = NULLIF(p_scalev_order_uuid, ''),
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
-- 9b. RPC: tandai klaim sudah DIBAYAR (dipanggil webhook pembayaran)
-- ============================================================================
-- F-W4-1: `paid_at` adalah satu-satunya pembeda antara "punya order belum
-- dibayar" (dipakai ulang / memblokir paket lain) dan riwayat lunas yang boleh
-- dibeli ulang. Di-set dari jalur uang (webhook `payment.received`/`order.paid`)
-- dengan kunci `order_id` — sama seperti consume_promo_for_order.
-- Idempotent: retry webhook tidak mengubah timestamp pertama.
CREATE OR REPLACE FUNCTION mark_checkout_claim_paid(
  p_order_id TEXT,
  p_paid_at TIMESTAMPTZ DEFAULT NULL,
  p_tenant_id VARCHAR DEFAULT 'thrivin'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_id UUID;
  v_state TEXT;
  v_late BOOLEAN := false;
BEGIN
  IF p_order_id IS NULL OR length(p_order_id) = 0 THEN
    RETURN json_build_object('status', 'invalid_order');
  END IF;

  -- F-W4-1c: pembayaran yang masuk SETELAH order di-retire / sedang-gagal
  -- dicancel = pembayaran TELAT. Kebijakan owner: akses TETAP diberikan (dedup
  -- `fulfillment_key` di webhook yang menentukan grant), tapi event-nya ditandai
  -- duplikat di sini supaya ops bisa cek refund manual. Retry cancel otomatis
  -- dihentikan oleh worker karena `paid_at` sudah terisi.
  UPDATE checkout_claims
    SET paid_at = COALESCE(paid_at, LEAST(COALESCE(p_paid_at, now()), now())),
        late_payment_at = CASE
          WHEN status IN ('cancel_pending', 'cancel_failed', 'retired')
            THEN COALESCE(late_payment_at, now())
          ELSE late_payment_at
        END,
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id
    RETURNING id, status, (late_payment_at IS NOT NULL) INTO v_id, v_state, v_late;

  IF v_id IS NULL THEN
    -- Order yang tidak lewat gate (mis. dibuat manual di dashboard Scalev).
    RETURN json_build_object('status', 'not_found');
  END IF;
  RETURN json_build_object(
    'status', 'marked',
    'claim_id', v_id,
    'state', v_state,
    'late_payment', COALESCE(v_late, false)
  );
END;
$function$;

-- ============================================================================
-- 9c. RPC cancel F-W4-1c: klaim attempt + catat hasilnya (tanpa PII)
-- ============================================================================
-- Pembagian tugas: RPC hanya memindahkan STATE (atomik, dengan lease), worker HTTP
-- di route/sweep yang memanggil Scalev. Tidak ada pg_net/http dari SQL.
--
-- `claim_checkout_cancel` = klaim attempt: satu baris hanya boleh dipegang satu
-- worker pada satu waktu (`cancel_claimed_until`), dan HANYA kalau belum dibayar
-- (M-3). Pembayaran yang muncul setelah klaim ini diambil = late payment.
CREATE OR REPLACE FUNCTION claim_checkout_cancel(
  p_claim_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_row RECORD;
BEGIN
  UPDATE checkout_claims
    SET cancel_attempts = cancel_attempts + 1,
        cancel_claimed_at = now(),
        -- V-3 (review-W4RX4): lease WAJIB >= jendela worker sendiri
        -- (CANCEL_MAX_ATTEMPTS x CANCEL_TIMEOUT_MS + backoff + margin = ~16,3 s);
        -- 15 s dulu lebih pendek dari attempt-nya sendiri ⇒ worker kedua bisa
        -- melease baris yang sama saat attempt pertama masih jalan (id yang sama
        -- dikirim 4x, dan cancel kedua bisa dijawab terminal 400/403/404 ⇒
        -- nomor terkunci). 30 s = budget + margin. Dikunci assertion
        -- `tests/test-cancel-ttl-e2e.mts` §10 (lease >= floor turunan konstanta TS).
        cancel_claimed_until = now() + INTERVAL '30 seconds',
        updated_at = now()
    WHERE id = p_claim_id
      AND status = 'cancel_pending'
      AND paid_at IS NULL
      -- V-4: jadwal retry (backoff) WAJIB dibaca, kalau tidak backoff hanya
      -- dekorasi — baris langsung bisa dilease ulang tiap request checkout.
      AND (cancel_next_retry_at IS NULL OR cancel_next_retry_at <= now())
      AND (cancel_claimed_until IS NULL OR cancel_claimed_until <= now())
    RETURNING id, scalev_order_uuid, order_id, cancel_attempts INTO v_row;

  IF NOT FOUND THEN
    -- Sudah dipegang worker lain, sudah dibayar, atau statusnya berubah:
    -- jangan kirim HTTP cancel (M-3: nol baris = jangan retry).
    RETURN json_build_object('status', 'not_claimed');
  END IF;

  RETURN json_build_object(
    'status', 'claimed',
    'claim_id', v_row.id,
    'scalev_order_uuid', v_row.scalev_order_uuid,
    'order_id', v_row.order_id,
    'cancel_attempts', v_row.cancel_attempts
  );
END;
$function$;

-- `record_checkout_cancel_result` = satu-satunya pintu keluar state cancel.
-- p_result: 'retired' (semua ID terverifikasi canceled) · 'cancel_pending'
-- (transient/tak terklasifikasi ⇒ TAHAN + retry) · 'cancel_failed' (terminal).
-- p_error WAJIB sudah di-redact pemanggil; panjang dipotong 200 char (CHECK).
CREATE OR REPLACE FUNCTION record_checkout_cancel_result(
  p_claim_id UUID,
  p_result TEXT,
  p_error TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_state TEXT;
BEGIN
  IF p_result NOT IN ('retired', 'cancel_pending', 'cancel_failed') THEN
    RETURN json_build_object('status', 'invalid_result');
  END IF;

  -- M-3: pembayaran yang masuk SETELAH attempt cancel diklaim. Aktivasinya
  -- urusan webhook; di sini: tandai duplikat, lepas lease, hentikan retry.
  IF EXISTS (SELECT 1 FROM checkout_claims WHERE id = p_claim_id AND paid_at IS NOT NULL) THEN
    UPDATE checkout_claims
      SET cancel_claimed_at = NULL,
          cancel_claimed_until = NULL,
          cancel_next_retry_at = NULL,
          cancel_last_error = NULL,
          late_payment_at = COALESCE(late_payment_at, now()),
          updated_at = now()
      WHERE id = p_claim_id;
    RETURN json_build_object('status', 'late_payment', 'claim_id', p_claim_id);
  END IF;

  IF p_result = 'retired' THEN
    UPDATE checkout_claims
      SET status = 'retired',
          canceled_at = COALESCE(canceled_at, now()),
          payment_url = NULL,
          cancel_last_error = NULL,
          cancel_next_retry_at = NULL,
          cancel_claimed_at = NULL,
          cancel_claimed_until = NULL,
          updated_at = now()
      WHERE id = p_claim_id AND status = 'cancel_pending'
      RETURNING status INTO v_state;
  ELSIF p_result = 'cancel_failed' THEN
    UPDATE checkout_claims
      SET status = 'cancel_failed',
          cancel_last_error = left(COALESCE(p_error, 'terminal'), 200),
          payment_url = NULL,
          cancel_next_retry_at = NULL,
          cancel_claimed_at = NULL,
          cancel_claimed_until = NULL,
          updated_at = now()
      WHERE id = p_claim_id AND status = 'cancel_pending'
      RETURNING status INTO v_state;
  ELSE
    UPDATE checkout_claims
      SET cancel_last_error = left(COALESCE(p_error, 'transient'), 200),
          -- ponytail: 30 detik tetap; jadikan parameter kalau ops butuh tuning.
          cancel_next_retry_at = now() + INTERVAL '30 seconds',
          cancel_claimed_at = NULL,
          cancel_claimed_until = NULL,
          updated_at = now()
      WHERE id = p_claim_id AND status = 'cancel_pending'
      RETURNING status INTO v_state;
  END IF;

  IF v_state IS NULL THEN
    RETURN json_build_object('status', 'not_found');
  END IF;
  RETURN json_build_object('status', 'recorded', 'claim_id', p_claim_id, 'state', v_state);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 9d. V-1: penemu order terlantar (nominasi untuk sweep).
-- ----------------------------------------------------------------------------
-- Kenapa perlu: step 3b `claim_checkout_order` bersifat LAZY — ia hanya jalan
-- kalau pelanggan itu checkout LAGI. Order yang ditinggalkan (pelanggan tidak
-- kembali) tidak pernah masuk antrean cancel, jadi sapuan 30 menit hanya
-- mengulang baris yang sudah diketahui — sementara link Scalev tetap bisa
-- dibayar ~24 jam (fakta produk 17/10). RPC ini memberi sweep penemu barisnya.
--
-- Sama seperti 3b/3c: SQL hanya MEMINDAHKAN STATE (nol panggilan Scalev; tidak
-- ada pg_net/http dari sini), semantiknya identik supaya tidak ada dua aturan:
--   uuid ada   -> cancel_pending (worker/route yang HTTP cancel)
--   uuid kosong -> cancel_failed 'missing_canonical_order_id' (antrean owner,
--                  baris tetap MENAHAN nomor lewat penjaga per-nomor)
-- `p_limit` yang dilewati tidak hilang: sapuan berikutnya mengambil sisanya
-- (ORDER BY created_at ASC + LIMIT), jadi tidak ada baris yang keluar dari
-- pandangan kecuali saat backlog memang sedang diproses.
CREATE OR REPLACE FUNCTION nominate_stale_cancels(
  p_tenant_id TEXT,
  p_limit INTEGER DEFAULT 200,
  p_unpaid_ttl_seconds INTEGER DEFAULT 3600
) RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_pending INTEGER := 0;
  v_missing INTEGER := 0;
BEGIN
  WITH stale AS (
    SELECT id FROM checkout_claims
     WHERE tenant_id = p_tenant_id
       AND status = 'created'
       AND paid_at IS NULL
       AND created_at < now() - make_interval(secs => p_unpaid_ttl_seconds)
     ORDER BY created_at ASC
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE SKIP LOCKED
  ), moved AS (
    UPDATE checkout_claims c
       SET status = CASE WHEN COALESCE(c.scalev_order_uuid, '') <> ''
                         THEN 'cancel_pending' ELSE 'cancel_failed' END,
           cancel_next_retry_at = CASE WHEN COALESCE(c.scalev_order_uuid, '') <> ''
                                       THEN now() ELSE c.cancel_next_retry_at END,
           cancel_last_error = CASE WHEN COALESCE(c.scalev_order_uuid, '') <> ''
                                    THEN NULL
                                    ELSE COALESCE(c.cancel_last_error, 'missing_canonical_order_id') END,
           updated_at = now()
      FROM stale s
     WHERE c.id = s.id
     RETURNING c.status
  )
  SELECT count(*) FILTER (WHERE status = 'cancel_pending'),
         count(*) FILTER (WHERE status = 'cancel_failed')
    INTO v_pending, v_missing
    FROM moved;

  RETURN json_build_object(
    'status', 'nominated',
    'nominated', COALESCE(v_pending, 0),
    'missing_id', COALESCE(v_missing, 0)
  );
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
-- 10b. Retensi PII Onboarding & Purge (F-S4 / RX2-1 / Kebijakan Privasi <= 30 hari)
-- ============================================================================
-- Kebijakan Privasi (/privacy klausul 5) menyatakan data profil disimpan paling
-- lama 30 hari sebelum dihapus atau dianonimkan. Fungsi ini membersihkan
-- state onboarding yang ditinggalkan / tidak aktif serta riwayat klaim checkout lama.
--
-- RX2-1: `purge_audit_log` (dibuat skema webhook, H-4) dipakai bersama supaya
-- "scheduler mati" bisa dibedakan dari "tidak ada yang perlu dihapus". Baris run
-- ini dikenali dari `deleted_progress IS NOT NULL`; kolom jalur webhook sengaja
-- NULL (bukan 0) supaya alarm webhook tidak salah membaca run ini sebagai runnya
-- sendiri. Karena itu NOT NULL di kedua kolom webhook dilonggarkan.
-- Urutan apply: skema webhook (H-4) mendahului file ini — lihat tests/harness/seed.sh.
-- Guard di bawah menegakkan urutan itu: tanpa `purge_audit_log`, blok ALTER cuma
-- berisik 4x "relation does not exist" tapi fungsi retensi tetap tercipta (body
-- plpgsql tidak divalidasi saat CREATE) dan gagal setiap run — PII tidak terhapus,
-- tanpa alarm. Lebih baik berhenti di sini dengan pesan yang menyebut file-nya.
DO $$ BEGIN
  IF to_regclass('public.purge_audit_log') IS NULL THEN
    RAISE EXCEPTION 'RX2-1: apply schema-webhook-onboarding.sql dulu (purge_audit_log belum ada)';
  END IF;
END $$;
ALTER TABLE purge_audit_log ADD COLUMN IF NOT EXISTS deleted_progress INTEGER;
ALTER TABLE purge_audit_log ADD COLUMN IF NOT EXISTS deleted_claims INTEGER;
ALTER TABLE purge_audit_log ALTER COLUMN deleted_inbox DROP NOT NULL;
ALTER TABLE purge_audit_log ALTER COLUMN deleted_snapshots DROP NOT NULL;

CREATE OR REPLACE FUNCTION purge_expired_onboarding_progress(
  p_retention_days INTEGER DEFAULT 30
)
RETURNS TABLE (ran_at TIMESTAMPTZ, deleted_progress INTEGER, deleted_claims INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  -- ponytail: TTL in-flight (600s) disalin dari default claim_checkout_order;
  -- naikkan keduanya bersamaan kalau TTL-nya diubah.
  v_inflight_ttl CONSTANT INTERVAL := INTERVAL '600 seconds';
  v_progress INTEGER;
  v_claims INTEGER;
  v_abandoned INTEGER;
  v_cutoff TIMESTAMPTZ;
BEGIN
  IF p_retention_days IS NULL OR p_retention_days < 1 THEN
    RAISE EXCEPTION 'p_retention_days must be >= 1';
  END IF;

  v_cutoff := now() - make_interval(days => p_retention_days);

  -- 1. Hapus progress onboarding yang tidak aktif / ditinggalkan lebih dari 30 hari.
  DELETE FROM onboarding_progress
  WHERE updated_at < v_cutoff;
  GET DIAGNOSTICS v_progress = ROW_COUNT;

  -- 2. Hapus klaim checkout lama (> 30 hari) agar tabel klaim tetap ramping.
  -- F-W4-1c (M-4): state terminal baru (`retired`, `cancel_failed`) ikut dibuang —
  -- tanpa itu jejak `phone` di baris hasil cancel tinggal SELAMANYA, melanggar
  -- retensi 30 hari. `cancel_pending` SENGAJA tidak ikut: metadata retry/
  -- rekonsiliasinya masih diperlukan sampai selesai.
  DELETE FROM checkout_claims
  WHERE updated_at < v_cutoff AND status IN ('created', 'failed', 'retired', 'cancel_failed');
  GET DIAGNOSTICS v_claims = ROW_COUNT;

  -- 3. RX2-1: klaim `in_flight` yang worker-nya mati sebelum release_checkout_claim
  -- menyimpan `phone` selamanya (filter lama hanya menyentuh created/failed).
  -- Klaim yang MASIH hidup disegarkan dalam hitungan detik (TTL in-flight),
  -- jadi cutoff-nya TTL + retensi: klaim hidup tidak mungkin kena, dan klaim
  -- terbengkalai akhirnya benar-benar dibuang.
  DELETE FROM checkout_claims
  WHERE status = 'in_flight'
    AND updated_at < v_cutoff - v_inflight_ttl;
  GET DIAGNOSTICS v_abandoned = ROW_COUNT;
  v_claims := v_claims + v_abandoned;

  -- 4. RX2-1: jejak audit — tanpa baris ini, scheduler yang mati tidak terlihat.
  INSERT INTO purge_audit_log (deleted_progress, deleted_claims, triggered_by)
  VALUES (v_progress, v_claims, current_setting('application_name', true));

  RETURN QUERY SELECT now(), v_progress, v_claims;
END;
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-thrivin-onboarding-progress') THEN
      PERFORM cron.schedule(
        'purge-thrivin-onboarding-progress',
        '15 3 * * *',
        'SELECT purge_expired_onboarding_progress();'
      );
    END IF;
  END IF;
END $$;

-- RX2-1: alarm job retensi PII, pola sama dengan v_webhook_retention_backlog:
-- baris yang SEHARUSNYA sudah hilang tetap kelihatan kalau scheduler mati.
-- Retensi 30 hari ditulis literal karena view tidak menerima parameter.
CREATE OR REPLACE VIEW v_onboarding_retention_backlog AS
  SELECT
    (SELECT count(*) FROM onboarding_progress WHERE updated_at < now() - INTERVAL '30 days') AS expired_progress_rows,
    (SELECT count(*) FROM checkout_claims WHERE updated_at < now() - INTERVAL '30 days') AS expired_claim_rows,
    (SELECT max(ran_at) FROM purge_audit_log WHERE deleted_progress IS NOT NULL) AS last_purge_at;

-- V-2 (pola sama): view default berjalan sebagai PEMILIK (BYPASSRLS) sehingga
-- klien anon bisa membaca backlog + waktu purge terakhir. security_invoker + REVOKE.
ALTER VIEW v_onboarding_retention_backlog SET (security_invoker = on);
REVOKE ALL ON v_onboarding_retention_backlog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON v_onboarding_retention_backlog TO service_role;

-- ============================================================================
-- 11. Grants + RLS
-- ============================================================================
-- Semua RPC di file ini HANYA dipanggil server (service_role lewat PostgREST).
-- Supabase + harness memberi EXECUTE default ke PUBLIC/anon/authenticated → cabut.
REVOKE ALL ON FUNCTION record_consent_event(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_checkout_consent(TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_onboarding_step(TEXT, INTEGER, JSONB, VARCHAR) FROM PUBLIC, anon, authenticated;
-- F-W4-1c: signature `complete_checkout_claim` berubah (tambah p_scalev_order_uuid)
-- ⇒ daftar REVOKE/GRANT di bawah WAJIB memakai signature BARU; signature lama
-- dibuang di tests/harness/drop-stale.sql supaya tidak tertinggal sebagai overload.
REVOKE ALL ON FUNCTION blocked_live_status(VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_checkout_order(TEXT, INTEGER[], TEXT, TEXT, TEXT, INTEGER, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_checkout_claim(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_checkout_claim(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mark_checkout_claim_paid(TEXT, TIMESTAMPTZ, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_checkout_cancel(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_checkout_cancel_result(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nominate_stale_cancels(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION consent_state_for_phone(TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION purge_expired_onboarding_progress(INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_consent_event(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION record_checkout_consent(TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION save_onboarding_step(TEXT, INTEGER, JSONB, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION blocked_live_status(VARCHAR, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_checkout_order(TEXT, INTEGER[], TEXT, TEXT, TEXT, INTEGER, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION complete_checkout_claim(UUID, TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION release_checkout_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION mark_checkout_claim_paid(TEXT, TIMESTAMPTZ, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION claim_checkout_cancel(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION record_checkout_cancel_result(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION nominate_stale_cancels(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION consent_state_for_phone(TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION purge_expired_onboarding_progress(INTEGER) TO service_role;

-- F-S5: Revoke eksplisit hak tabel dari role klien publik (anon, authenticated, PUBLIC).
-- Mencegah bypass default privilege Supabase di mana tabel baru dapat di-SELECT/INSERT/UPDATE oleh klien.
REVOKE ALL ON TABLE consent_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE onboarding_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE checkout_claims FROM PUBLIC, anon, authenticated;

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
