-- Harness-only grants. Supabase grants service_role access to every table
-- automatically; self-hosted Postgres does not, so PostgREST requests made with
-- the service-role JWT need this. Not part of the staging schema.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Keep future tables (created by re-running the migrations) reachable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;