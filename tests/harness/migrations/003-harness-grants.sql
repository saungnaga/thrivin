-- Harness-only grants. Supabase grants service_role access to every table
-- automatically; self-hosted Postgres does not, so PostgREST requests made with
-- the service-role JWT need this. Not part of the staging schema.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Keep future tables (created by re-running the migrations) reachable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- Replicate Supabase's default privileges for NEW objects in schema `public`:
-- anon/authenticated get ALL on tables+views and EXECUTE on functions. Without
-- this the harness UNDER-models Supabase in a way that hides real leaks — e.g.
-- `v_promo_codes` looked safe locally (anon had no grant) while a publishable
-- key could read every promo code in Supabase (review-promo-2026-10-14, V-2).
-- RLS deny policies are what actually stop anon on the tables; the point of
-- these defaults is to make "I didn't grant it" not silently pass as "safe".
-- Runs after 003-alphabetical order but BEFORE 004 (promo schema), so the
-- objects created there really do inherit these grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
