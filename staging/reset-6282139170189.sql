-- ============================================================================
-- Draft: reset surface untuk SATU nomor target (review Sentinel; BELUM dijalankan)
-- Divisi: Thrivin (Forge) · kartu t_ef348cbc · tanggal 2026-10-24
-- Target nomor: 6282139170189 (hanya nomor ini)
--
-- TUJUAN: nomor target bisa checkout ulang dari nol tanpa terkunci order/promo/
-- onboarding lama. TIDAK menyentuh nomor lain, TIDAK mengubah schema, TIDAK
-- menghapus baris global (katalog, promo_codes, purge_audit_log).
--
-- SIFAT: idempoten (semua DELETE berbasis WHERE; aman dijalankan dua kali).
-- BACKUP-FIRST: bagian 0 menyalin setiap baris yang akan dihapus ke schema
-- `reset_backup_20261024`. Jalankan SELURUH file dalam SATU transaksi, periksa
-- hitungan bagian 0, baru COMMIT. Rollback = `ROLLBACK;` selama transaksi belum
-- di-commit, atau pulihkan dari schema backup.
--
-- PRASYARAT OPERATOR (bukan SQL):
--   1) Ambil dump sebelum apply:
--        pg_dump "$DB_URL" --schema=public --data-only -f reset-pre-6282139170189.sql
--   2) Jalankan di DB STAGING lebih dulu; produksi hanya lewat pipeline/owner.
--
-- PERMUKAAN DI LUAR POSTGRES (tidak bisa dihapus file ini — langkah operator):
--   * Jadwal/cron pribadi nomor ini hidup di store cron Hermes (SQLite di VPS),
--     bukan di Supabase: hapus baris cron milik nomor tsb lewat tool cron admin.
--   * Whitelist admin Nina dibaca dari env `NINA_ADMIN_PHONES`: kalau nomor ini
--     ada di daftar itu, keluarkan lewat perubahan env + restart (bukan SQL).
-- ============================================================================

BEGIN;

-- ── 0. BACKUP-FIRST: salin baris yang akan dihapus ───────────────────────────
CREATE SCHEMA IF NOT EXISTS reset_backup_20261024;

DO $$
DECLARE
  phone_variants text[] := ARRAY['6282139170189', '082139170189', '+6282139170189'];
BEGIN
  -- users + turunan
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.users AS
       SELECT * FROM public.users WHERE phone = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.users
       SELECT * FROM public.users WHERE phone = ANY(%L)', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.subscriptions AS
       SELECT s.* FROM public.subscriptions s
        WHERE s.user_id IN (SELECT id FROM public.users WHERE phone = ANY(%L)) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.subscriptions
       SELECT s.* FROM public.subscriptions s
        WHERE s.user_id IN (SELECT id FROM public.users WHERE phone = ANY(%L))', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.conversations AS
       SELECT c.* FROM public.conversations c
        WHERE c.user_id IN (SELECT id FROM public.users WHERE phone = ANY(%L)) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.conversations
       SELECT c.* FROM public.conversations c
        WHERE c.user_id IN (SELECT id FROM public.users WHERE phone = ANY(%L))', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.messages AS
       SELECT m.* FROM public.messages m
        WHERE m.conversation_id IN (
          SELECT c.id FROM public.conversations c
           WHERE c.user_id IN (SELECT id FROM public.users WHERE phone = ANY(%L))) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.messages
       SELECT m.* FROM public.messages m
        WHERE m.conversation_id IN (
          SELECT c.id FROM public.conversations c
           WHERE c.user_id IN (SELECT id FROM public.users WHERE phone = ANY(%L)))', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.memories AS
       SELECT * FROM public.memories WHERE user_wa = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.memories
       SELECT * FROM public.memories WHERE user_wa = ANY(%L)', phone_variants);

  -- permukaan checkout/onboarding/promo/consent/webhook
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.onboarding_progress AS
       SELECT * FROM public.onboarding_progress WHERE phone = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.onboarding_progress
       SELECT * FROM public.onboarding_progress WHERE phone = ANY(%L)', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.onboarding_snapshots AS
       SELECT * FROM public.onboarding_snapshots WHERE phone = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.onboarding_snapshots
       SELECT * FROM public.onboarding_snapshots WHERE phone = ANY(%L)', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.checkout_claims AS
       SELECT * FROM public.checkout_claims WHERE phone = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.checkout_claims
       SELECT * FROM public.checkout_claims WHERE phone = ANY(%L)', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.promo_redemptions AS
       SELECT * FROM public.promo_redemptions WHERE phone = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.promo_redemptions
       SELECT * FROM public.promo_redemptions WHERE phone = ANY(%L)', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.consent_events AS
       SELECT * FROM public.consent_events WHERE phone = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.consent_events
       SELECT * FROM public.consent_events WHERE phone = ANY(%L)', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.webhook_events_inbox AS
       SELECT * FROM public.webhook_events_inbox WHERE phone = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.webhook_events_inbox
       SELECT * FROM public.webhook_events_inbox WHERE phone = ANY(%L)', phone_variants);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS reset_backup_20261024.subscription_blocks AS
       SELECT * FROM public.subscription_blocks WHERE phone = ANY(%L) AND false', phone_variants);
  EXECUTE format(
    'INSERT INTO reset_backup_20261024.subscription_blocks
       SELECT * FROM public.subscription_blocks WHERE phone = ANY(%L)', phone_variants);
END
$$;

-- Periksa isi backup SEBELUM lanjut. Kalau angka tidak sesuai harapan: ROLLBACK.
SELECT 'users' AS surface, count(*) FROM reset_backup_20261024.users
UNION ALL SELECT 'subscriptions', count(*) FROM reset_backup_20261024.subscriptions
UNION ALL SELECT 'conversations', count(*) FROM reset_backup_20261024.conversations
UNION ALL SELECT 'messages', count(*) FROM reset_backup_20261024.messages
UNION ALL SELECT 'memories', count(*) FROM reset_backup_20261024.memories
UNION ALL SELECT 'onboarding_progress', count(*) FROM reset_backup_20261024.onboarding_progress
UNION ALL SELECT 'onboarding_snapshots', count(*) FROM reset_backup_20261024.onboarding_snapshots
UNION ALL SELECT 'checkout_claims', count(*) FROM reset_backup_20261024.checkout_claims
UNION ALL SELECT 'promo_redemptions', count(*) FROM reset_backup_20261024.promo_redemptions
UNION ALL SELECT 'consent_events', count(*) FROM reset_backup_20261024.consent_events
UNION ALL SELECT 'webhook_events_inbox', count(*) FROM reset_backup_20261024.webhook_events_inbox
UNION ALL SELECT 'subscription_blocks', count(*) FROM reset_backup_20261024.subscription_blocks;

-- ── 1. Hapus permukaan (urutan: anak → induk) ────────────────────────────────
-- Riwayat chat lebih dulu (FK messages -> conversations -> users).
DELETE FROM public.messages
 WHERE conversation_id IN (
   SELECT c.id FROM public.conversations c
    WHERE c.user_id IN (SELECT id FROM public.users
                         WHERE phone IN ('6282139170189', '082139170189', '+6282139170189')));

DELETE FROM public.conversations
 WHERE user_id IN (SELECT id FROM public.users
                    WHERE phone IN ('6282139170189', '082139170189', '+6282139170189'));

DELETE FROM public.subscriptions
 WHERE user_id IN (SELECT id FROM public.users
                    WHERE phone IN ('6282139170189', '082139170189', '+6282139170189'));

DELETE FROM public.memories
 WHERE user_wa IN ('6282139170189', '082139170189', '+6282139170189');

-- Permukaan yang mengunci checkout baru (klaim idempotensi, order basi, promo).
DELETE FROM public.checkout_claims
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

DELETE FROM public.onboarding_snapshots
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

DELETE FROM public.onboarding_progress
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

DELETE FROM public.promo_redemptions
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

DELETE FROM public.consent_events
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

DELETE FROM public.webhook_events_inbox
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

DELETE FROM public.subscription_blocks
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

DELETE FROM public.users
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

-- ── 2. Verifikasi pasca-hapus (semua harus 0) ────────────────────────────────
SELECT 'users_left' AS check, count(*) FROM public.users
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189')
UNION ALL SELECT 'claims_left', count(*) FROM public.checkout_claims
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189')
UNION ALL SELECT 'snapshots_left', count(*) FROM public.onboarding_snapshots
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189')
UNION ALL SELECT 'progress_left', count(*) FROM public.onboarding_progress
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189')
UNION ALL SELECT 'redemptions_left', count(*) FROM public.promo_redemptions
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189')
UNION ALL SELECT 'memories_left', count(*) FROM public.memories
 WHERE user_wa IN ('6282139170189', '082139170189', '+6282139170189')
UNION ALL SELECT 'blocks_left', count(*) FROM public.subscription_blocks
 WHERE phone IN ('6282139170189', '082139170189', '+6282139170189');

-- ── 3. COMMIT atau ROLLBACK (pilih satu; default file ini TIDAK commit) ──────
-- COMMIT;
ROLLBACK;
