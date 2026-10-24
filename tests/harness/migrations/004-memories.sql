-- Harness-only: tabel `memories` (mirror dari staging/h1-memory/migration-001-memories.sql)
-- + pencabutan grant `service_role` (mirror migration-002-memories-revoke-service-role.sql).
--
-- Kenapa ikut di harness: tes harus membuktikan dua hal yang jadi alasan
-- jembatan ini berbentuk RPC SECURITY DEFINER, bukan tulis langsung dari web:
--   1. `service_role` TIDAK bisa menyentuh `memories` (permission denied),
--   2. RLS FORCE + policy `app.tenant` benar-benar aktif.
-- Bukan bagian dari schema staging.
--
-- Catatan: role `nina_app` tidak dipakai tes mana pun di harness, tapi dibuat
-- supaya bentuk tabel/grant-nya identik dengan staging.

CREATE TABLE IF NOT EXISTS memories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_wa      VARCHAR(20) NOT NULL,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS memories_user_content_idx ON memories (user_wa, content_hash);
CREATE INDEX IF NOT EXISTS memories_user_wa_idx ON memories (user_wa);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON memories;
CREATE POLICY tenant_isolation ON memories
  FOR ALL
  USING  (user_wa = current_setting('app.tenant', true))
  WITH CHECK (user_wa = current_setting('app.tenant', true));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nina_app') THEN
    CREATE ROLE nina_app LOGIN NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

-- 003-harness-grants.sql memberi service_role ALL di semua tabel + default
-- privileges; batalkan untuk `memories` supaya harness sama dengan produksi.
REVOKE ALL ON memories FROM PUBLIC;
REVOKE ALL ON memories FROM anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO nina_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON memories TO nina_app;
