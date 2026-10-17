#!/usr/bin/env bash
# Bukti negatif (mutasi pembalik) untuk W4RX4 T3 — asersi T3 di
# tests/test-consent-gate-sql.mts + tests/test-consent-gate-e2e.mts harus FAIL
# kalau normalisasi `order_id = ''` di cabang replay `claim_checkout_order`
# dikembalikan ke bentuk pra-fix (tidak ada).
#
#   bash tests/harness/w4t3-mutation.sh
#
# Semua di harness LOKAL (Postgres lokal + mock Scalev). Nol staging/produksi,
# nol data pelanggan. Mutasi = satu hal saja (baris normalisasi dibuang), bukan
# revert commit. File dipulihkan apa pun yang terjadi (trap).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
SRC="staging/schema-consent.sql"
PRISTINE="/tmp/w4t3-schema-fixed.sql"
cp "$SRC" "$PRISTINE"

mutate() { # buang baris normalisasi -> bentuk pra-fix
  python3 - "$SRC" <<'PY'
import sys
path = sys.argv[1]
sql = open(path, encoding="utf-8").read()
line = "    v_existing.order_id := NULLIF(v_existing.order_id, '');\n"
assert line in sql, "baris normalisasi ber-fix tidak ditemukan"
open(path, "w", encoding="utf-8").write(sql.replace(line, "", 1))
PY
}
guard_state() {
  if grep -q "NULLIF(v_existing.order_id, '')" "$SRC"; then
    echo "   normalisasi: ADA"
  else
    echo "   normalisasi: TIDAK ADA"
  fi
}
restore() { cp "$PRISTINE" "$SRC"; }
trap restore EXIT

echo "== 1. pra-fix: baris normalisasi order_id='' dibuang =="
mutate pre
guard_state
bash "$HERE/seed.sh" --fresh >/tmp/w4t3-mut-seed.log 2>&1

echo
echo "== 2. asersi T3 SQL harus FAIL (pra-fix) =="
node --experimental-strip-types tests/test-consent-gate-sql.mts >/tmp/w4t3-mut-sql.log 2>&1
echo "   EXIT=$?  log=/tmp/w4t3-mut-sql.log"
grep -E "^SQL gate|^  FAIL T3" /tmp/w4t3-mut-sql.log | sed 's/^/   /'

echo
echo "== 3. asersi T3 jalur APP harus FAIL juga (pra-fix, HTTP + mock Scalev) =="
echo "   (.next dari run terakhir dipakai; mutasi ini skema saja)"
node --experimental-strip-types tests/test-consent-gate-e2e.mts >/tmp/w4t3-mut-e2e.log 2>&1
echo "   EXIT=$?  log=/tmp/w4t3-mut-e2e.log"
grep -E "^e2e gate|^  FAIL T3" /tmp/w4t3-mut-e2e.log | sed 's/^/   /'

echo
echo "== 4. pulihkan + seed ulang =="
restore
trap - EXIT
guard_state
bash "$HERE/seed.sh" --fresh >/tmp/w4t3-mut-restore-seed.log 2>&1
node --experimental-strip-types tests/test-consent-gate-sql.mts >/tmp/w4t3-mut-post-sql.log 2>&1
echo "   ulang pasca-fix SQL: $(grep -E '^SQL gate' /tmp/w4t3-mut-post-sql.log)"
node --experimental-strip-types tests/test-consent-gate-e2e.mts >/tmp/w4t3-mut-post-e2e.log 2>&1
echo "   ulang pasca-fix e2e: $(grep -E '^e2e gate' /tmp/w4t3-mut-post-e2e.log)"
echo "   git status staging/schema-consent.sql: [$(git status --short -- "$SRC" | tr -d '\n')]"
