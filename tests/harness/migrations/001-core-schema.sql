-- Harness-only core schema (subset of staging/schema/db-tables.sql).
-- Local Postgres stand-in for Supabase so the route tests are end-to-end:
-- routes -> real HTTP -> PostgREST -> real Postgres constraints.
--
-- This mirrors the tables the Scalev onboarding/webhook flow touches. It is NOT
-- a replacement for staging/schema/db-tables.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  memory TEXT DEFAULT ''::text,
  onboarding_complete BOOLEAN DEFAULT false,
  onboarding_step TEXT DEFAULT 'welcome'::text,
  onboarding_data JSONB DEFAULT '{}'::jsonb,
  daily_message_count INTEGER DEFAULT 0,
  last_message_date DATE DEFAULT CURRENT_DATE,
  CONSTRAINT users_phone_key UNIQUE (phone)
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  token_limit INTEGER NOT NULL,
  price INTEGER NOT NULL,
  features JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO subscription_plans (id, name, token_limit, price, features, is_active) VALUES
  (1, 'Starter', 100000, 49000, '{"reminders": false}'::jsonb, true),
  (2, 'Pro', 500000, 149000, '{"vision": true, "reminders": true}'::jsonb, true),
  (3, 'Premium', 2000000, 349000, '{"vision": true, "priority": true, "reminders": true}'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  token_used INTEGER NOT NULL DEFAULT 0,
  token_limit INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT subscriptions_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text, 'suspended'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id, status);

-- Roles used by PostgREST's `db-anon-role` / JWT `role` claim. Mirrors Supabase.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT;
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;