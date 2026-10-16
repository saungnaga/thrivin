#!/usr/bin/env bash
# Bukti negatif (mutasi pembalik) untuk W4RX4 T1 follow-up F-2 — asersi §12 di
# tests/test-consent-gate-sql.mts harus FAIL kalau blok `EXCEPTION WHEN
# unique_violation` di langkah 2 `claim_checkout_order` (replay baris `failed`)
# dilepas kembali ke bentuk pra-fix.
#
#   bash tests/harness/w4t1-regrant-mutation.sh
#
# Semua di harness LOKAL (Postgres lokal). Nol staging/produksi, nol data
# pelanggan. Mutasi = satu hal saja (blok EXCEPTION langkah 2), bukan revert
# commit. File dipulihkan apa pun yang terjadi (trap). EXIT=0 hanya kalau kedua
# arah terbukti: pra-fix SUITE FAIL, pasca-fix hijau.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
SRC="staging/schema-consent.sql"
PRISTINE="/tmp/w4t1-regrant-schema-fixed.sql"
cp "$SRC" "$PRISTINE"

mutate() { # $1 = fixed|pre
  python3 - "$SRC" "$1" <<'PY'
import sys
path, mode = sys.argv[1], sys.argv[2]
sql = open(path, encoding="utf-8").read()
fixed = """    BEGIN
      UPDATE checkout_claims
        SET status = 'in_flight', plan_key = p_plan_key, updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_claim_id;
    EXCEPTION WHEN unique_violation THEN
      RETURN json_build_object('status', 'in_flight');
    END;
"""
pre = """    UPDATE checkout_claims
      SET status = 'in_flight', plan_key = p_plan_key, updated_at = now()
      WHERE id = v_existing.id
      RETURNING id INTO v_claim_id;
"""
if mode == "pre":
    assert fixed in sql, "bentuk ber-fix langkah 2 tidak ditemukan"
    out = sql.replace(fixed, pre, 1)
else:
    assert pre in sql, "bentuk pra-fix langkah 2 tidak ditemukan"
    out = sql.replace(pre, fixed, 1)
open(path, "w", encoding="utf-8").write(out)
PY
}
guards() { # jumlah blok penangkap unique_violation di RPC klaim
  grep -c "EXCEPTION WHEN unique_violation" "$SRC"
}
restore() { cp "$PRISTINE" "$SRC"; }
trap restore EXIT

echo "== 1. pasca-fix: dua jalur UPDATE/INSERT punya penangkap =="
echo "   blok EXCEPTION di $SRC: $(guards) (harap 2: langkah 2 + langkah 7)"

echo
echo "== 2. pra-fix: blok EXCEPTION langkah 2 dilepas =="
mutate pre
echo "   blok EXCEPTION sekarang: $(guards) (harap 1)"
grep -n -B1 -A4 "WHERE id = v_existing.id" "$SRC" | sed 's/^/   /'
bash "$HERE/seed.sh" --fresh >/tmp/w4t1-regrant-seed.log 2>&1
node --experimental-strip-types tests/test-consent-gate-sql.mts >/tmp/w4t1-regrant-pre-sql.log 2>&1
PRE_EXIT=$?
echo "   EXIT=$PRE_EXIT  log=/tmp/w4t1-regrant-pre-sql.log"
grep -E "^SQL gate|^  FAIL F-2" /tmp/w4t1-regrant-pre-sql.log | sed 's/^/   /'

echo
echo "== 3. pulihkan + seed ulang =="
restore
trap - EXIT
bash "$HERE/seed.sh" --fresh >/tmp/w4t1-regrant-restore-seed.log 2>&1
echo "   blok EXCEPTION kembali: $(guards)"
node --experimental-strip-types tests/test-consent-gate-sql.mts >/tmp/w4t1-regrant-post-sql.log 2>&1
POST_EXIT=$?
echo "   EXIT=$POST_EXIT  $(grep -E '^SQL gate' /tmp/w4t1-regrant-post-sql.log)"
echo "   git status staging/schema-consent.sql: [$(git status --short -- "$SRC" | tr -d '\n')]"

echo
if [ "$PRE_EXIT" != "0" ] && [ "$POST_EXIT" = "0" ]; then
  echo "BUKTI NEGATIF OK: pra-fix FAIL (exit $PRE_EXIT), pasca-fix hijau (exit 0)"
  exit 0
fi
echo "BUKTI NEGATIF GAGAL: pra-fix exit=$PRE_EXIT (harap != 0), pasca-fix exit=$POST_EXIT (harap 0)"
exit 1
