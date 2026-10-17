#!/usr/bin/env bash
# Bukti negatif (mutasi pembalik) untuk W4RX4 T1 — asersi deterministik di
# tests/test-consent-gate-sql.mts §11 harus FAIL kalau penjaga index dikembalikan
# ke bentuk pra-fix (`WHERE status = 'in_flight'` saja).
#
#   bash tests/harness/w4t1-mutation.sh
#
# Semua di harness LOKAL (Postgres lokal). Nol staging/produksi, nol data
# pelanggan. Mutasi = satu hal saja (predikat index), bukan revert commit.
# File dipulihkan apa pun yang terjadi (trap).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
SRC="staging/schema-consent.sql"
PRISTINE="/tmp/w4t1-schema-fixed.sql"
cp "$SRC" "$PRISTINE"

mutate() { # $1 = fixed|pre
  python3 - "$SRC" "$1" <<'PY'
import sys
path, mode = sys.argv[1], sys.argv[2]
sql = open(path, encoding="utf-8").read()
fixed = """BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_live_phone
  ON checkout_claims (tenant_id, phone)
  WHERE status IN ('in_flight', 'created') AND paid_at IS NULL;
DROP INDEX IF EXISTS uq_checkout_claims_inflight_phone;
COMMIT;"""
pre = """CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_inflight_phone
  ON checkout_claims (tenant_id, phone)
  WHERE status = 'in_flight';"""
if mode == "fixed":
    assert pre in sql, "bentuk pra-fix tidak ditemukan"
    out = sql.replace(pre, fixed)
else:
    assert fixed in sql, "bentuk ber-fix tidak ditemukan"
    out = sql.replace(fixed, pre)
open(path, "w", encoding="utf-8").write(out)
PY
}
indexes() {
  sudo -u postgres psql -q -d "$HARNESS_PG_DB" -Atc \
    "select '   '||indexdef from pg_indexes where tablename='checkout_claims' and indexname like 'uq_%';"
}
restore() { cp "$PRISTINE" "$SRC"; }
trap restore EXIT

echo "== 1. pra-fix: predikat index dikembalikan ke bentuk sempit =="
mutate pre
grep -n -A2 "uq_checkout_claims" "$SRC" | sed 's/^/   /'
bash "$HERE/seed.sh" --fresh >/tmp/w4t1-mut-seed.log 2>&1
indexes

echo
echo "== 2. asersi deterministik harus FAIL (pra-fix) =="
node --experimental-strip-types tests/test-consent-gate-sql.mts >/tmp/w4t1-mut-sql.log 2>&1
echo "   EXIT=$?  log=/tmp/w4t1-mut-sql.log"
grep -E "^SQL gate|^  FAIL T1" /tmp/w4t1-mut-sql.log | sed 's/^/   /'

echo
echo "== 3. pulihkan + seed ulang =="
restore
trap - EXIT
bash "$HERE/seed.sh" --fresh >/tmp/w4t1-mut-restore-seed.log 2>&1
indexes
node --experimental-strip-types tests/test-consent-gate-sql.mts >/tmp/w4t1-mut-post-sql.log 2>&1
echo "   ulang pasca-fix: $(grep -E '^SQL gate' /tmp/w4t1-mut-post-sql.log)"
echo "   git status staging/schema-consent.sql: [$(git status --short -- "$SRC" | tr -d '\n')]"
