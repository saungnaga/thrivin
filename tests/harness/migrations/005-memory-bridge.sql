-- ============================================================================
-- Thrivin — migration: onboarding -> `memories` bridge
-- ----------------------------------------------------------------------------
-- STATUS: DRAFT — BELUM DI-APPLY ke mana pun (staging maupun produksi).
-- Owner : Forge (Fullstack Engineer). Review wajib: Atlas + Sentinel.
-- Scope : jembatan satu arah: `users.onboarding_data` -> tabel `memories`.
--
-- KENAPA FILE INI ADA
--   Pelanggan mengisi onboarding 1-9 di web; hasilnya masuk ke
--   `users.onboarding_data` + `users.memory` (`src/lib/onboarding-store.ts`).
--   Tapi Nina membaca tabel `memories` (`plugins/nina-memory/store.py:134`) dan
--   TIDAK ADA yang menyambung keduanya — jadi Nina tetap menanyakan umur/BB/TB
--   yang sudah diisi pelanggan di web.
--
--   `users.memory` sudah DEPRECATED (nina/h1-design-review-atlas.md §5.1) —
--   jadi jembatannya BUKAN "Nina baca `users.memory`", tapi menyalurkan data
--   onboarding ke `memories`.
--
-- KENAPA FUNGSI (SECURITY DEFINER) DAN BUKAN TULIS LANGSUNG DARI WEBSITE
--   Website memakai `service_role`, dan grant `service_role` atas `memories`
--   sudah DICABUT (migration-002-memories-revoke-service-role.sql — keputusan
--   Atlas, defense-in-depth karena role itu BYPASSRLS). Itu keputusan keamanan
--   yang benar: jangan dibatalkan, jangan tambah grant table-level. Jadi
--   satu-satunya jalur tulis adalah fungsi SECURITY DEFINER milik `postgres`
--   (owner tabel, BYPASSRLS di Supabase — diverifikasi di staging:
--   `select rolbypassrls from pg_roles where rolname='postgres'` -> true).
--
-- HARDENING
--   * SECURITY DEFINER + `SET search_path = public, pg_temp` (wajib; tanpa ini
--     nama bisa dibajak lewat schema lain).
--   * `EXECUTE` hanya untuk `service_role`; anon/authenticated DILARANG (mereka
--     klien publik dan bisa memanggil apa pun lewat PostgREST /rpc/).
--   * `app.tenant` di-set lokal di dalam fungsi supaya policy RLS `memories`
--     (FORCE) selalu terpenuhi, walau executor kehilangan BYPASSRLS.
--   * Nol DROP, nol DELETE data. Semua `CREATE OR REPLACE` / `IF NOT EXISTS`.
--
-- IDEMPOTENT
--   `memories_user_content_idx (user_wa, content_hash)` dipakai sebagai target
--   ON CONFLICT; panggilan ke-2 untuk nomor yang sama tidak menambah baris.
--   Hash dihitung di SQL dan WAJIB identik dengan Python
--   (`plugins/nina-memory/store.py::content_hash`) — kalau berbeda, dedup tidak
--   pernah cocok dan memori menumpuk dobel. Paritasnya diuji di
--   `tests/test-memory-bridge.mts`.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.seed_nina_memory_from_onboarding(text);
--   DROP FUNCTION IF EXISTS public.nina_content_hash(text);
--   DROP FUNCTION IF EXISTS public.nina_normalize_content(text);
--   DROP FUNCTION IF EXISTS public.nina_normalize_wa_tenant(text);
--   lalu hapus pemanggilan RPC di webhook (`src/lib/memory-bridge.ts`).
--   Baris yang sudah masuk `memories` TIDAK dihapus: itu fakta sah milik user
--   dan bentuknya identik dengan yang ditulis Nina. Rollback = berhenti
--   menyalurkan, bukan menghapus data user.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Normalisasi nomor -> tenant key DB (`+62...`)
-- ---------------------------------------------------------------------------
-- Cermin dari `plugins/nina-memory/tenant.py::normalize_wa_tenant()` — SATU
-- konvensi saja. `users.phone` menyimpan `+62...`, kanal WA mengirim digit
-- telanjang; fungsi ini satu-satunya jembatan antar format.
CREATE OR REPLACE FUNCTION public.nina_normalize_wa_tenant(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  -- buang suffix "@domain" / ":device" -> buang pemisah [\s().-] -> buang '+'
  -- di depan -> wajib 7..15 digit (ITU-T E.164), selain itu "" (bukan tenant).
  WITH s AS (
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(
                 split_part(split_part(coalesce(p_raw, ''), '@', 1), ':', 1),
                 '[\s().-]', '', 'g'),
               '^\+*', ''),
             '^\s+|\s+$', '', 'g') AS digits
  )
  SELECT CASE WHEN digits ~ '^[0-9]{7,15}$' THEN '+' || digits ELSE '' END
  FROM s
$fn$;

-- ---------------------------------------------------------------------------
-- 2) Normalisasi isi fakta — SATU sumber kebenaran untuk hashing
-- ---------------------------------------------------------------------------
-- Cermin dari `plugins/nina-memory/store.py::normalize_content`:
--   collapse whitespace -> trim -> lowercase -> buang tanda baca ujung.
-- Kelas whitespace ditulis eksplisit supaya sama persis dengan `\s` versi
-- Python (ASCII ws + C0 1c-1f + 85 + a0 + Zs/Zl/Zp), bukan `[[:space:]]` yang
-- definisinya ikut locale database.
CREATE OR REPLACE FUNCTION public.nina_normalize_content(p_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  WITH ws AS (
    SELECT E' \t\n\r\f\v\x1c-\x1f\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000'::text AS cls
  )
  SELECT regexp_replace(
           lower(btrim(regexp_replace(coalesce(p_content, ''), '[' || ws.cls || ']+', ' ', 'g'))),
           '[' || ws.cls || '.,;:!?、。！？]+$', '')
  FROM ws
$fn$;

-- sha256 heksadesimal atas isi ternormalisasi. `sha256()` = bawaan Postgres
-- 11+ (PostgreSQL 17 di produksi) -> nol kebutuhan pgcrypto.
CREATE OR REPLACE FUNCTION public.nina_content_hash(p_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT encode(sha256(convert_to(public.nina_normalize_content(p_content), 'UTF8')), 'hex')
$fn$;

-- ---------------------------------------------------------------------------
-- 3) Jembatan onboarding -> memories
-- ---------------------------------------------------------------------------
-- Satu baris = satu fakta (`label: nilai`), karena plugin memuat baris berurutan
-- dan `fit_budget()` memotong per baris — satu blob akan memakan seluruh budget.
-- Dipanggil webhook SETELAH aktivasi sukses; best-effort (lihat src/lib/memory-bridge.ts).
CREATE OR REPLACE FUNCTION public.seed_nina_memory_from_onboarding(p_phone text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant text := public.nina_normalize_wa_tenant(p_phone);
  v_name   text;
  v_data   jsonb;
  v_focus  text;
  v_rows   integer := 0;
BEGIN
  IF v_tenant = '' THEN
    RETURN 0;                       -- nomor tidak valid: bukan tenant, jangan menulis
  END IF;

  SELECT u.name, coalesce(u.onboarding_data, '{}'::jsonb)
    INTO v_name, v_data
  FROM public.users u
  -- `users.phone` menyimpan `+62...` (konvensi H1 / db-tables.sql), TAPI jalur
  -- webhook menulis lewat `normalizePhone()` yang menghasilkan digit telanjang
  -- TANPA `+` (ditemukan Forge 2026-10-14 saat uji e2e; sudah dilaporkan ke
  -- Atlas sebagai bug terpisah). Selama dua format itu masih hidup, cocokkan
  -- keduanya PERSIS (bukan LIKE) supaya jembatan ini tetap bekerja untuk
  -- pelanggan baru. Baris dengan onboarding terisi menang.
  WHERE u.phone IN (v_tenant, ltrim(v_tenant, '+'))
  ORDER BY (nullif(u.onboarding_data, '{}'::jsonb) IS NOT NULL) DESC,
           (u.phone = v_tenant) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;                       -- non-subscriber / nomor tak dikenal: nol baris
  END IF;

  IF v_data = '{}'::jsonb AND nullif(btrim(coalesce(v_name, '')), '') IS NULL THEN
    RETURN 0;                       -- tidak ada apa pun untuk diingat
  END IF;

  -- Policy `memories` (FORCE RLS) memakai GUC ini. Belt-and-braces: owner
  -- `postgres` memang BYPASSRLS, tapi jangan bergantung pada atribut itu saja.
  PERFORM set_config('app.tenant', v_tenant, true);

  -- programFocus bisa array (checkbox web) atau string tunggal.
  v_focus := CASE jsonb_typeof(v_data -> 'programFocus')
               WHEN 'array' THEN (
                 SELECT string_agg(value #>> '{}', ', ')
                 FROM jsonb_array_elements(v_data -> 'programFocus')
               )
               ELSE v_data ->> 'programFocus'
             END;

  -- `nullif(btrim(x),'')` -> NULL untuk field kosong/hanya spasi, dan
  -- `'label: ' || NULL` = NULL -> baris itu otomatis dilewati WHERE di bawah.
  INSERT INTO public.memories (user_wa, content, content_hash, created_at, updated_at)
  SELECT v_tenant, f.line, public.nina_content_hash(f.line), now(), now()
  FROM unnest(ARRAY[
         'nama: '               || nullif(btrim(v_name), ''),
         'umur: '               || nullif(btrim(v_data ->> 'age'), '')            || ' tahun',
         'tinggi: '             || nullif(btrim(v_data ->> 'height'), '')         || ' cm',
         'berat badan: '        || nullif(btrim(v_data ->> 'weight'), '')         || ' kg',
         'gender: '             || nullif(btrim(v_data ->> 'gender'), ''),
         'tingkat aktivitas: '  || nullif(btrim(v_data ->> 'activityLevel'), ''),
         'tempat latihan: '     || nullif(btrim(v_data ->> 'workoutLocation'), ''),
         'fokus program: '      || nullif(btrim(v_focus), ''),
         'tantangan terbesar: ' || nullif(btrim(v_data ->> 'biggestChallenge'), ''),
         'gaya komunikasi: '    || nullif(btrim(v_data ->> 'communicationStyle'), '')
       ]) AS f(line)
  WHERE f.line IS NOT NULL
  ON CONFLICT (user_wa, content_hash) DO UPDATE SET updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;                    -- jumlah fakta yang ditulis (upsert), 0 = tidak ada
END;
$fn$;

-- Owner eksplisit: SECURITY DEFINER hanya sekuat owner-nya.
ALTER FUNCTION public.seed_nina_memory_from_onboarding(text) OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- 4) GRANT — hanya jalur server yang boleh memanggil
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.seed_nina_memory_from_onboarding(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nina_normalize_content(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nina_content_hash(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nina_normalize_wa_tenant(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.seed_nina_memory_from_onboarding(text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.seed_nina_memory_from_onboarding(text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.seed_nina_memory_from_onboarding(text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nina_app') THEN
    -- Dashboard/tooling boleh menghitung hash sendiri lewat aturan yang sama.
    GRANT EXECUTE ON FUNCTION public.nina_content_hash(text) TO nina_app;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Verifikasi pasca-apply (jalankan sebagai postgres)
-- ---------------------------------------------------------------------------
-- select public.nina_normalize_wa_tenant('628123456789@s.whatsapp.net');  -- +628123456789
-- select public.nina_content_hash('Berat Badan: 64 kg  ');               -- == python hash
-- select public.seed_nina_memory_from_onboarding('+628123456789');       -- jumlah fakta
-- select privilege_type, grantee from information_schema.routine_privileges
--   where routine_name = 'seed_nina_memory_from_onboarding';
--   -- harap: EXECUTE hanya service_role (+ owner postgres). anon/authenticated ABSENT.
