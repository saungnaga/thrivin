-- DRAFT — DDL PRODUKSI, JANGAN APPLY SENDIRI (kartu t_22ccd958).
-- Owner yang menjalankan, jalur yang sama seperti bundel 2026-10-20.
-- Idempotent: aman dijalankan ulang.
--
-- Kenapa: `first_greeting_status='sent'` hanya berarti "Meta menerima panggilan
-- kirim". Delivery sebenarnya datang asinkron lewat webhook `statuses` Meta yang
-- membawa `wamid`; tanpa menyimpan `wamid` kita tidak bisa mengorelasikan
-- receipt itu ke baris sapaan. Kolom ini kunci korelasinya.
--
-- Nol backfill: baris lama tidak punya wamid (kode lama membuangnya), jadi
-- status mereka tetap apa adanya — jangan dikarang "delivered".
--
-- Dampak: kolom nullable, tanpa default, tanpa rewrite data bermakna.
-- Kode (`recordGreetingStatus`) menulis kolom ini BEST-EFFORT: sebelum DDL ini
-- dijalankan, PATCH-nya gagal dan cuma menulis warning, status sapaan tetap
-- tercatat seperti sekarang. Jadi urutan deploy kode-lalu-DDL aman.

ALTER TABLE onboarding_snapshots
  ADD COLUMN IF NOT EXISTS first_greeting_wamid VARCHAR(150);

-- Lookup receipt = `WHERE tenant_id = ... AND first_greeting_wamid = ...`,
-- dipanggil per status webhook. Partial index supaya baris lama (NULL) tidak ikut.
CREATE INDEX IF NOT EXISTS idx_onboarding_snapshots_greeting_wamid
  ON onboarding_snapshots (tenant_id, first_greeting_wamid)
  WHERE first_greeting_wamid IS NOT NULL;
