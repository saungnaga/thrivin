-- Dijalankan seed.sh SEBELUM migrasi (RX2-2).
--
-- `CREATE OR REPLACE FUNCTION` hanya mengganti fungsi dengan signature IDENTIK.
-- Kalau signature-nya berubah, yang lama tetap tinggal sebagai OVERLOAD, dan
-- panggilan tanpa cast eksplisit jadi:
--   ERROR: Could not choose a best candidate function
-- Itu yang dulu terjadi di DB bersama: `cancel_promo_redemption(uuid,varchar)`
-- dari branch ini + `cancel_promo_redemption(uuid,varchar,text,text)` dari
-- worktree lain.
--
-- `DROP FUNCTION <nama>` tanpa daftar argumen GAGAL saat ada overload
-- ("function name ... is not unique"), jadi tiap signature di-drop dari katalog.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.proname = 'cancel_promo_redemption'
      AND p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION %s', fn.sig);
  END LOOP;
END $$;

-- F-W4-1c: `complete_checkout_claim` bertambah `p_scalev_order_uuid` di ujung
-- signature. Versi 4-argumen lama tetap tinggal sebagai OVERLOAD di DB yang
-- sudah ada, dan panggilan 4-argumen jadi ambigu ("Could not choose a best
-- candidate function") — padahal REVOKE/GRANT di schema-consent.sql hanya
-- menyebut signature baru, jadi overload lama bisa tertinggal dengan hak
-- EXECUTE default (PUBLIC). Buang versi lamanya dari katalog sebelum apply.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.proname = 'complete_checkout_claim'
      AND p.pronamespace = 'public'::regnamespace
      AND pg_get_function_identity_arguments(p.oid) = 'p_claim_id uuid, p_order_id text, p_payment_url text, p_amount integer'
  LOOP
    EXECUTE format('DROP FUNCTION %s', fn.sig);
  END LOOP;
END $$;
