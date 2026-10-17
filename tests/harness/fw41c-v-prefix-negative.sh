#!/usr/bin/env bash
# Bukti NEGATIF ronde patch V (kartu t_1d1cf77f) — higiene V-6.
#
#   bash tests/harness/fw41c-v-prefix-negative.sh
#
# Menjalankan SUITE BARU (tests/ dari worktree pasca-fix) di atas KODE PRA-FIX yang
# di-checkout dari HEAD, dengan DB yang DI-DROP DULU dan namanya DICETAK supaya
# angka PASS/FAIL-nya bisa diatribusikan (pelajaran V-6: run dulu keluar dari DB
# yang masih membawa kolom/skema pasca-fix ⇒ sebagian PASS-nya lolos semu).
#
# Nol staging, nol produksi, nol Scalev nyata, nol data pelanggan. Klon privat di
# $W4V_PREFIX_BASE (default ~/w4v-evidence), DB sendiri, port sendiri, TMP sendiri.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BASE="${W4V_PREFIX_BASE:-$HOME/w4v-evidence}"
CLONE="$BASE/prefix-clone"
STAMP="$(date +%s | tail -c 7)"
DB="${W4V_PREFIX_DB:-thrivin_test_w4v_prefix_$STAMP}"
LOG="$BASE/prefix-negative.log"
mkdir -p "$BASE"

echo "== 0. klon pra-fix =="
rm -rf "$CLONE"
git clone -q --no-hardlinks "$REPO" "$CLONE"
cd "$CLONE"
git log --oneline -1
# Assertion pasca-fix, kode pra-fix: satu-satunya kombinasi yang bisa membuktikan
# perbaikan ronde V load-bearing.
rm -rf tests && cp -a "$REPO/tests" tests
ln -sfn "$REPO/node_modules" node_modules

echo
echo "== 1. DB FRESH (drop dulu) — nama DB: $DB =="
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB;" >/dev/null
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
HARNESS_PG_DB="$DB" bash tests/harness/seed.sh --fresh >"$BASE/prefix-seed.log" 2>&1
echo "   seed exit=$? (lihat $BASE/prefix-seed.log)"
sudo -u postgres psql -d "$DB" -Atc "select 'db=' || current_database() || ' | nominate_stale_cancels=' || (select count(*) from pg_proc where proname='nominate_stale_cancels') || ' | lease_30s=' || (select count(*) from pg_proc where proname='claim_checkout_cancel' and prosrc like '%30 seconds%')"

echo
echo "== 2. build app pra-fix =="
npm run build >"$BASE/prefix-build.log" 2>&1 && echo "   build ok"

echo
echo "== 3. suite POST-fix vs kode PRA-fix (harus FAIL pada asersi ronde V) =="
HARNESS_PG_DB="$DB" node --experimental-strip-types tests/test-cancel-ttl-e2e.mts >"$LOG" 2>&1
echo "   EXIT=$?  log=$LOG"
grep -E "^cancel TTL e2e:" "$LOG" | sed 's/^/   /'
grep -E "^  FAIL" "$LOG" | sed 's/^/   /'
echo
echo "   (DB $DB + klon $CLONE ditinggalkan sebagai artefak; hapus manual kalau selesai)"
