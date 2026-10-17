#!/usr/bin/env bash
# Bukti negatif (mutasi pembalik) C-6 — asersi ACL di tests/test-webhook-purge-acl.mts
# harus FAIL kalau pin dilepas kembali ke bentuk longgar.
#
#   bash tests/harness/w4c6-acl-mutation.sh
#
# Mutasi = SATU baris (`REVOKE ALL ON FUNCTION purge_expired_webhook_data() …`),
# bukan revert commit. File sumber dipulihkan apa pun yang terjadi (trap).
# EXIT=0 hanya kalau kedua arah terbukti: bermutasi SUITE FAIL, pulih exit 0.
#
# Log + salinan pristine di $TMP_PREFIX milik run ini (bukan /tmp global — kelas
# C-7/F-2: dua run paralel tidak boleh saling menimpa). Nol staging/produksi,
# nol data pelanggan; semua di harness Postgres lokal.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"

SRC="staging/schema-webhook-onboarding.sql"
PRISTINE="$TMP_PREFIX/w4c6-schema-fixed.sql"
LOG_PRE="$TMP_PREFIX/w4c6-mut-pre.log"
LOG_POST="$TMP_PREFIX/w4c6-mut-post.log"
mkdir -p "$TMP_PREFIX"
cp "$SRC" "$PRISTINE"

pins() { grep -c '^REVOKE ALL ON FUNCTION purge_expired_webhook_data' "$SRC" || true; }

mutate() { # buang baris REVOKE pin (bentuk longgar) — satu baris, bukan revert
  python3 - "$SRC" <<'PY'
import sys
path = sys.argv[1]
sql = open(path, encoding="utf-8").read()
revoke = "REVOKE ALL ON FUNCTION purge_expired_webhook_data() FROM PUBLIC, anon, authenticated;\n"
assert revoke in sql, "baris REVOKE pin tidak ditemukan"
open(path, "w", encoding="utf-8").write(sql.replace(revoke, "", 1))
PY
}
restore() { cp "$PRISTINE" "$SRC"; }
trap restore EXIT

echo "== 1. pasca-fix: pin ACL ada =="
echo "   baris REVOKE pin di $SRC: $(pins) (harap 1)"

echo
echo "== 2. mutasi: baris REVOKE dilepas (bentuk longgar) =="
mutate
echo "   baris REVOKE pin sekarang: $(pins) (harap 0)"
bash tests/harness/seed.sh --fresh >"$TMP_PREFIX/w4c6-mut-seed.log" 2>&1
node --experimental-strip-types tests/test-webhook-purge-acl.mts >"$LOG_PRE" 2>&1
PRE_EXIT=$?
echo "   EXIT=$PRE_EXIT  log=$LOG_PRE"
grep -E "^ACL C-6|^  FAIL" "$LOG_PRE" | sed 's/^/   /'

echo
echo "== 3. pulihkan + ulang =="
restore
trap - EXIT
echo "   baris REVOKE pin kembali: $(pins) (harap 1)"
bash tests/harness/seed.sh --fresh >"$TMP_PREFIX/w4c6-res-seed.log" 2>&1
node --experimental-strip-types tests/test-webhook-purge-acl.mts >"$LOG_POST" 2>&1
POST_EXIT=$?
echo "   EXIT=$POST_EXIT  log=$LOG_POST  $(grep -E '^ACL C-6' "$LOG_POST")"
echo "   git status $SRC: [$(git status --short -- "$SRC" | tr -d '\n')]"

echo
if [ "$PRE_EXIT" != "0" ] && [ "$POST_EXIT" = "0" ]; then
  echo "BUKTI NEGATIF OK: bermutasi FAIL (exit $PRE_EXIT), pulih hijau (exit 0)"
  exit 0
fi
echo "BUKTI NEGATIF GAGAL: bermutasi exit=$PRE_EXIT (harap != 0), pulih exit=$POST_EXIT (harap 0)"
exit 1
