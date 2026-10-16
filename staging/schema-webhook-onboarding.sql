-- Schema: Scalev webhook + onboarding data pipeline (v3 — remediasi VETO)
-- Divisi: Thrivin (Forge - Fullstack Engineer)
-- Reviewer: Atlas (Tech Lead), Sentinel (Security & Compliance)
-- Tanggal: 2026-10-13
-- Target: Supabase Staging -> Produksi
--
-- Changes vs v2 (see projects/thrivin/security/review-webhook-onboarding-2026-10-12):
--   H-4  purge_expired_webhook_data() now logs every run to purge_audit_log so a
--        dead scheduler is visible, and is scheduled via pg_cron when available.
--   H-5  onboarding_snapshots is written AFTER the order exists (order_id NOT NULL
--        in practice); upsert key is (tenant_id, order_id). Pre-order guard index kept.
--   L-3  one retention value (30 days) for both tables.
--   M-1  explicit deny_client_access policies replace the decorative USING(true) claim.
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. Webhook event inbox & idempotency ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_events_inbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  source VARCHAR(50) NOT NULL DEFAULT 'scalev',
  event_id VARCHAR(150) NOT NULL,
  fulfillment_key VARCHAR(150),                    -- order-scoped idempotency scope
  event_type VARCHAR(100) NOT NULL,
  order_id VARCHAR(100),
  phone VARCHAR(20),
  payload_version VARCHAR(20) NOT NULL DEFAULT 'v2',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,      -- whitelist subset + body_sha256 (H-2)
  status VARCHAR(50) NOT NULL DEFAULT 'received',  -- received, processing, completed, duplicate, failed
  error_redacted TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  CONSTRAINT uq_webhook_inbox_tenant_event UNIQUE (tenant_id, source, event_id)
);

ALTER TABLE webhook_events_inbox ADD COLUMN IF NOT EXISTS fulfillment_key VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_tenant_source ON webhook_events_inbox (tenant_id, source);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_order_id ON webhook_events_inbox (order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_status ON webhook_events_inbox (status);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_retention ON webhook_events_inbox (expires_at);

-- H-6: the arbiter for concurrent deliveries. The route INSERTs with
-- ON CONFLICT DO NOTHING (Prefer: resolution=ignore-duplicates) against THIS
-- index; only the winning insert may activate a subscription.
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_inbox_fulfillment
  ON webhook_events_inbox (tenant_id, source, fulfillment_key);

-- ============================================================================
-- 2. Onboarding snapshots (pre-payment profile capture)
-- ============================================================================
CREATE TABLE IF NOT EXISTS onboarding_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'thrivin',
  phone VARCHAR(20) NOT NULL,
  order_id VARCHAR(100),
  snapshot_version VARCHAR(20) NOT NULL DEFAULT 'v2',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_greeting_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  first_greeting_sent_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'active',    -- active, applied, expired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  CONSTRAINT uq_onboarding_snapshots_tenant_order UNIQUE (tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_snapshots_phone ON onboarding_snapshots (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_onboarding_snapshots_order_id ON onboarding_snapshots (order_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_snapshots_greeting ON onboarding_snapshots (first_greeting_status);
CREATE INDEX IF NOT EXISTS idx_onboarding_snapshots_retention ON onboarding_snapshots (expires_at);

-- H-5: defence in depth. The route no longer writes pre-order rows (order_id IS
-- NULL), but if a future code path does, this index makes it an upsert target
-- instead of an unbounded insert (NULL never conflicts with NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_snapshots_pre_order
  ON onboarding_snapshots (tenant_id, phone)
  WHERE order_id IS NULL;

-- ============================================================================
-- 3. Retention enforcement (H-4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS purge_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_inbox INTEGER NOT NULL,
  deleted_snapshots INTEGER NOT NULL,
  triggered_by TEXT
);

DROP FUNCTION IF EXISTS purge_expired_webhook_data();

CREATE OR REPLACE FUNCTION purge_expired_webhook_data()
RETURNS TABLE (ran_at TIMESTAMPTZ, deleted_inbox INTEGER, deleted_snapshots INTEGER) AS $$
DECLARE
  v_inbox INTEGER;
  v_snapshots INTEGER;
BEGIN
  DELETE FROM webhook_events_inbox WHERE expires_at < now();
  GET DIAGNOSTICS v_inbox = ROW_COUNT;

  DELETE FROM onboarding_snapshots WHERE expires_at < now() AND status <> 'active';
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  -- Durable evidence that the job actually ran (a scheduler that silently dies
  -- is indistinguishable from a job that deletes nothing).
  INSERT INTO purge_audit_log (deleted_inbox, deleted_snapshots, triggered_by)
  VALUES (v_inbox, v_snapshots, current_setting('application_name', true));

  RETURN QUERY SELECT now(), v_inbox, v_snapshots;
END;
$$ LANGUAGE plpgsql;

-- Schedule via pg_cron when the extension exists (Supabase).
-- Without pg_cron, schedule the same call from ops cron (see staging/purge-cron.sh).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-thrivin-webhook-data') THEN
      PERFORM cron.schedule(
        'purge-thrivin-webhook-data',
        '0 3 * * *',
        'SELECT purge_expired_webhook_data();'
      );
    END IF;
  END IF;
END $$;

-- Dead-scheduler alarm: rows that should already be gone.
-- RX2-1: `purge_audit_log` sekarang dipakai bersama job retensi PII (deleted_progress
-- terisi, kolom webhook NULL) ⇒ last_purge_at HANYA melihat baris job webhook,
-- supaya run PII tidak menyamarkan scheduler webhook yang mati.
CREATE OR REPLACE VIEW v_webhook_retention_backlog AS
  SELECT
    (SELECT count(*) FROM webhook_events_inbox WHERE expires_at < now()) AS expired_inbox_rows,
    (SELECT count(*) FROM onboarding_snapshots WHERE expires_at < now() AND status <> 'active') AS expired_snapshot_rows,
    (SELECT max(ran_at) FROM purge_audit_log WHERE deleted_inbox IS NOT NULL) AS last_purge_at;

-- V-2 (pola sama, temuan Sentinel ronde 2): view Postgres default berjalan
-- sebagai PEMILIK (role migrasi, BYPASSRLS), jadi policy RLS di tabel-tabel di
-- bawahnya tidak berlaku dan klien ANON (kunci publishable yang selalu ada di
-- bundle browser) bisa membaca backlog retensi + waktu purge terakhir lewat
-- PostgREST. Sama seperti v_promo_codes: security_invoker + cabut grant klien.
ALTER VIEW v_webhook_retention_backlog SET (security_invoker = on);
REVOKE ALL ON v_webhook_retention_backlog FROM anon, authenticated;
GRANT SELECT ON v_webhook_retention_backlog TO service_role;

-- ============================================================================
-- 4. Row Level Security
-- The real control is key distribution: the service-role key lives only on the
-- server. These policies make a wrong key fail loudly instead of quietly.
-- ============================================================================
ALTER TABLE webhook_events_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_snapshots ENABLE ROW LEVEL SECURITY;
-- purge_audit_log adalah satu-satunya tabel di file ini yang belum dikunci.
-- Supabase memberi grant default (ALL) untuk objek baru di schema public, jadi
-- tanpa RLS kunci publishable (anon) bisa membaca riwayat purge langsung dari
-- PostgREST. Efeknya juga terlihat lewat v_webhook_retention_backlog:
-- security_invoker membuat dua kolom count jadi 0 untuk anon, tapi
-- last_purge_at tetap terisi kalau tabel ini tidak dikunci.
ALTER TABLE purge_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['webhook_events_inbox', 'onboarding_snapshots', 'purge_audit_log'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t AND policyname = 'deny_client_access_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        'deny_client_access_' || t, t
      );
    END IF;
  END LOOP;
END $$;