#!/usr/bin/env bash
# RX2-1b bukti (dua lapis).
#
#  A. SQL: penulis lain di tabel yang sama (purge_expired_onboarding_progress —
#     retensi PII, kolom webhook NULL) memuaskan query LAMA, tidak memuaskan query BARU.
#  B. Mutasi negatif di level suite: baris INSERT audit di purge_expired_webhook_data()
#     dikomentari (di staging/schema-webhook-onboarding.sql — seed.sh menyalinnya ke
#     harness, jadi mutasinya ikut ter-apply tiap run), lalu tests/test-webhook-e2e.mts
#     dijalankan dua varian asersi: LAMA (tanpa filter) tetap PASS, BARU
#     (deleted_inbox IS NOT NULL) FAIL. Sesudahnya file dipulihkan + seed diulang.
#
# Semua di harness LOKAL (Postgres/PostgREST/mock Scalev). Nol staging, nol data pelanggan.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
q() { sudo -u postgres psql -Atc "$1" -d "$HARNESS_PG_DB"; }

OLD_TEST="tests/test-webhook-e2e-old.mts"        # salinan sekali pakai, asersi sebelum fix
SRC="staging/schema-webhook-onboarding.sql"
PRISTINE="/tmp/rx21b-pristine-webhook.sql"
cp "$SRC" "$PRISTINE"
CW_PID=""
cleanup() {
  [ -n "$CW_PID" ] && kill "$CW_PID" 2>/dev/null
  cp "$PRISTINE" "$SRC"                          # pulihkan apa pun yang terjadi
  rm -f "$OLD_TEST"
}
trap cleanup EXIT

# Hanya baris query H-4 yang berubah: buang filter deleted_inbox (= versi pra-fix).
sed 's/ AND deleted_inbox IS NOT NULL//' tests/test-webhook-e2e.mts > "$OLD_TEST"
echo "varian asersi LAMA -> $OLD_TEST ($(grep -c "interval '1 minute';" "$OLD_TEST") baris query tanpa filter)"

echo
echo "== A. dua query atas isi tabel yang sama (tanpa mutasi) =="
q "TRUNCATE purge_audit_log;" >/dev/null
q "SELECT purge_expired_onboarding_progress(30);" >/dev/null
q "SELECT '  deleted_inbox='||coalesce(deleted_inbox::text,'NULL')||' deleted_progress='||coalesce(deleted_progress::text,'NULL')||' triggered_by='||coalesce(triggered_by,'-') FROM purge_audit_log;"
echo -n "  LAMA (tanpa filter)              count = "
q "SELECT count(*) FROM purge_audit_log WHERE ran_at > now() - interval '1 minute';"
echo -n "  BARU (deleted_inbox IS NOT NULL) count = "
q "SELECT count(*) FROM purge_audit_log WHERE ran_at > now() - interval '1 minute' AND deleted_inbox IS NOT NULL;"

echo
echo "== B. mutasi negatif: purge_expired_webhook_data() berhenti menulis audit =="
sed -i '/^  INSERT INTO purge_audit_log (deleted_inbox/,+1s/^/-- /' "$SRC"
grep -n -A1 '^-- *INSERT INTO purge_audit_log (deleted_inbox' "$SRC" | sed 's/^/  /'
q "TRUNCATE purge_audit_log;" >/dev/null
# Seed dulu supaya mutasi benar-benar masuk ke DB (seed.sh menyalin SRC -> harness/002).
bash "$HERE/seed.sh" >/tmp/rx21b-mut-seed.log 2>&1
echo -n "  setelah seed, prosrc: "
q "SELECT CASE WHEN prosrc ~ E'(^|\n)-- *INSERT INTO purge_audit_log' THEN 'INSERT audit DIKOMENTARI (mutasi aktif)' ELSE 'INSERT audit hidup (mutasi GAGAL)' END FROM pg_proc WHERE proname='purge_expired_webhook_data';"
q "TRUNCATE purge_audit_log;" >/dev/null

# Penulis lain disimulasikan tiap 5s selama run pertama, supaya jendela 1 menit
# pasti terisi walau suite butuh >1 menit sampai asersi H-4 (identik dengan baris
# yang ditulis purge_expired_onboarding_progress: kolom webhook NULL).
( while :; do
    q "INSERT INTO purge_audit_log (deleted_progress, deleted_claims, triggered_by) VALUES (0,0,'rx21b-other-writer');" >/dev/null
    sleep 5
  done ) &
CW_PID=$!

run() { # $1 = file test, $2 = label log
  echo "  -- run $2 @ $(date +%T): $(q "SELECT CASE WHEN prosrc ~ E'(^|\n)-- *INSERT INTO purge_audit_log' THEN 'INSERT audit dikomentari (mutasi aktif)' ELSE 'INSERT audit hidup' END FROM pg_proc WHERE proname='purge_expired_webhook_data';")"
  node --experimental-strip-types "$1" >"/tmp/rx21b-$2.log" 2>&1
  echo "     EXIT=$?  selesai $(date +%T)  log=/tmp/rx21b-$2.log"
  grep -E "^(PASS|FAIL) +H-4" "/tmp/rx21b-$2.log" | sed 's/^/     /'
  grep -E "end-to-end checks passed" "/tmp/rx21b-$2.log" | sed 's/^/     /'
  echo "     baris 1 menit terakhir: LAMA=$(q "SELECT count(*) FROM purge_audit_log WHERE ran_at > now() - interval '1 minute';") BARU=$(q "SELECT count(*) FROM purge_audit_log WHERE ran_at > now() - interval '1 minute' AND deleted_inbox IS NOT NULL;")"
}
run "$OLD_TEST" "M-old"                   # pra-fix: tetap hijau walau job webhook bisu
kill "$CW_PID" 2>/dev/null; CW_PID=""     # stop penulis lain; barisnya masih <60s
run "tests/test-webhook-e2e.mts" "M-new"  # pasca-fix: menangkap job yang bisu

echo
echo "== pemulihan =="
cp "$PRISTINE" "$SRC"
bash "$HERE/seed.sh" >/tmp/rx21b-restore-seed.log 2>&1
echo -n "  prosrc: "
q "SELECT CASE WHEN prosrc ~ E'(^|\n)-- *INSERT INTO purge_audit_log' THEN 'INSERT audit masih dikomentari (GAGAL PULIH)' ELSE 'INSERT audit hidup (pulih)' END FROM pg_proc WHERE proname='purge_expired_webhook_data';"
echo "  git status staging/schema-webhook-onboarding.sql: $(git status --short -- "$SRC" || true)(bersih = tidak ada perubahan tersisa)"
