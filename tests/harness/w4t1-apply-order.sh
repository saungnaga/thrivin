#!/usr/bin/env bash
# Bukti negatif W4RX4 T1 follow-up F-1: §4 schema (index hidup per nomor) tidak
# boleh fail-OPEN. DB yang sudah memuat >=2 baris hidup untuk satu nomor harus
# membuat apply GAGAL, tapi index lama (penjaga) harus tetap berdiri.
#
#   bash tests/harness/w4t1-apply-order.sh
#
# Bentuk pra-fix (DROP mendahului CREATE, autocommit per-statement) ⇒ DROP sudah
# COMMIT saat CREATE gagal ⇒ penjaga per-nomor HILANG (DB lebih lemah dari sebelum
# apply). Bentuk ber-fix (BEGIN; CREATE; DROP; COMMIT;) ⇒ CREATE gagal ⇒ transaksi
# batal ⇒ index lama masih ada. Script EXIT=0 hanya kalau keduanya terbukti.
#
# Semua di harness LOKAL (Postgres lokal, DB throwaway bernama unik per worktree).
# Nol staging/produksi, nol data pelanggan, nol apply dari kartu ini.
# File sumber dipulihkan apa pun yang terjadi (trap).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
DB="${HARNESS_PG_DB}_f1order"
SRC="staging/schema-consent.sql"
PRISTINE="/tmp/w4t1-apply-order-pristine.sql"
LOG_PRE="/tmp/w4t1-apply-order-pre.log"
LOG_POST="/tmp/w4t1-apply-order-post.log"
cp "$SRC" "$PRISTINE"
cleanup() { # Hanya DB throwaway ber-suffix milik script ini — bukan DB harness utama.
  case "$DB" in
    *_f1order) sudo -u postgres psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB;" >/dev/null 2>&1 ;;
    *) echo "!! menolak drop '$DB' (nama tak berakhiran _f1order)" >&2 ;;
  esac
}
restore() { cp "$PRISTINE" "$SRC"; }
trap 'restore; cleanup' EXIT

psql_() { sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"; }

# DB di keadaan yang dokumen bukti §5 sebut: sudah memuat 2 baris hidup untuk satu
# nomor, dan yang berdiri baru index sempit pra-fix.
setup_db() {
  HARNESS_PG_DB="$DB" bash "$HERE/seed.sh" --fresh >/tmp/w4t1-apply-order-seed.log 2>&1
  psql_ -q -d "$DB" <<'SQL'
DROP INDEX IF EXISTS uq_checkout_claims_live_phone;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_inflight_phone
  ON checkout_claims (tenant_id, phone)
  WHERE status = 'in_flight';
SQL
  psql_ -q -d "$DB" -c \
    "INSERT INTO checkout_claims (tenant_id, phone, idempotency_key, plan_key, status)
     VALUES ('thrivin','6281234567890','f1order-key-1','month','created'),
            ('thrivin','6281234567890','f1order-key-2','month','created');"
}

guards() {
  sudo -u postgres psql -d "$DB" -Atc \
    "select coalesce(string_agg(indexname, ', ' order by indexname), '(kosong)')
       from pg_indexes where tablename='checkout_claims'
        and indexname like 'uq_checkout_claims_%_phone';"
}
live_rows() {
  sudo -u postgres psql -d "$DB" -Atc \
    "select count(*) from checkout_claims
      where tenant_id='thrivin' and phone='6281234567890'
        and status in ('in_flight','created') and paid_at is null;"
}
apply_file() { # $1 = log
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f - < "$SRC" >"$1" 2>&1
  return $?
}
mutate() { # $1 = pre -> Kembalikan §4 ke bentuk pra-fix (DROP dulu, tanpa transaksi)
  [ "$1" = "pre" ] || return 0
  python3 - "$SRC" <<'PY'
import sys
path = sys.argv[1]
sql = open(path, encoding="utf-8").read()
fixed = """BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_live_phone
  ON checkout_claims (tenant_id, phone)
  WHERE status IN ('in_flight', 'created') AND paid_at IS NULL;
DROP INDEX IF EXISTS uq_checkout_claims_inflight_phone;
COMMIT;"""
pre = """DROP INDEX IF EXISTS uq_checkout_claims_inflight_phone;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_live_phone
  ON checkout_claims (tenant_id, phone)
  WHERE status IN ('in_flight', 'created') AND paid_at IS NULL;"""
assert fixed in sql, "bentuk ber-fix §4 tidak ditemukan"
open(path, "w", encoding="utf-8").write(sql.replace(fixed, pre))
PY
}

echo "db: $DB   (log: $LOG_PRE / $LOG_POST)"
echo
echo "== 0. penjaga urutan: §4 harus BEGIN; CREATE; DROP; COMMIT; =="
python3 - "$SRC" <<'PY'
import sys
sql = open(sys.argv[1], encoding="utf-8").read()
i = sql.index("URUTAN + SATU TRANSAKSI")
i_begin = sql.index("BEGIN;", i)
i_create = sql.index("CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_claims_live_phone", i)
i_drop = sql.index("DROP INDEX IF EXISTS uq_checkout_claims_inflight_phone", i)
i_commit = sql.index("COMMIT;", i_drop)
assert i_begin < i_create < i_drop < i_commit, "urutan §4 salah"
print("   BEGIN < CREATE < DROP < COMMIT  OK")
PY
ORDER_OK=$?

FAIL=0

echo
echo "== 1. pra-fix: DROP mendahului CREATE, tanpa transaksi =="
mutate pre
setup_db
echo "   sebelum apply: 2 baris hidup = $(live_rows)   penjaga = [$(guards)]"
apply_file "$LOG_PRE"
echo "   apply EXIT=$?  (log: $LOG_PRE)"
grep -m1 "could not create unique index" "$LOG_PRE" | sed 's/^/   /'
echo "   sesudah apply: penjaga = [$(guards)]"
[ "$(guards)" = "(kosong)" ] || { echo "   !! pra-fix TIDAK mereproduksi (penjaga masih ada)"; FAIL=1; }
[ "$ORDER_OK" = 0 ] || FAIL=1

echo
echo "== 2. pasca-fix: BEGIN; CREATE; DROP; COMMIT; =="
restore
setup_db
echo "   sebelum apply: 2 baris hidup = $(live_rows)   penjaga = [$(guards)]"
apply_file "$LOG_POST"
echo "   apply EXIT=$?  (log: $LOG_POST)"
grep -m1 "could not create unique index" "$LOG_POST" | sed 's/^/   /'
echo "   sesudah apply: penjaga = [$(guards)]"
case "$(guards)" in
  *uq_checkout_claims_inflight_phone*) echo "   penjaga lama BERTAHAN  OK" ;;
  *) echo "   !! penjaga lama hilang (fail-open masih ada)"; FAIL=1 ;;
esac
[ "$(guards)" != *uq_checkout_claims_live_phone* ] || { echo "   !! index baru setengah terpasang"; FAIL=1; }

echo
echo "== 3. pulih: sumber kembali ke bentuk ber-fix + DB throwaway dibuang =="
restore
cleanup
trap - EXIT
echo "   git status $SRC: [$(git status --short -- "$SRC" | tr -d '\n')]"
echo "   db sisa: [$(sudo -u postgres psql -Atc "SELECT coalesce(string_agg(datname,','),'(kosong)') FROM pg_database WHERE datname LIKE '%_f1order';" -d postgres)]"
echo
if [ "$FAIL" = 0 ]; then
  echo "BUKTI F-1 OK: pra-fix penjaga HILANG (fail-open), pasca-fix penjaga BERTAHAN."
  exit 0
fi
echo "BUKTI F-1 GAGAL — lihat log di atas."
exit 1
