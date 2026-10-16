-- Dijalankan seed.sh SEBELUM migrasi (RX2-2).
--
-- `CREATE OR REPLACE FUNCTION` hanya mengganti fungsi dengan signature IDENTIK.
-- Kalau signature-nya berubah, yang lama tetap tinggal sebagai OVERLOAD, dan
-- panggilan tanpa cast eksplisit jadi:
--   ERROR: Could not choose a best candidate function
-- Itu yang dulu terjadi di DB bersama: `cancel_promo_redemption(uuid,varchar)`
-- dari branch ini + `cancel_promo_redemption(uuid,varchar,text,text)` dari
-- worktree lain. Drop by NAME membuang semua overload-nya.
DROP FUNCTION IF EXISTS cancel_promo_redemption;
