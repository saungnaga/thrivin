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
