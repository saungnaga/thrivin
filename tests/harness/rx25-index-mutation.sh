#!/usr/bin/env bash
# tests/harness/rx25-index-mutation.sh — pembalik penjaga per-nomor (RX2-5).
#
# Kartu t_370981ec: asersi "dua kunci berbeda paralel" (tests/test-consent-gate-e2e.mts)
# pernah merah satu kali. Bukti negatif kelas race ini = jalankan probe dengan
# penjaga index dikembalikan ke bentuk PRA-FIX, lalu lihat kebocorannya muncul
# lagi — dan hilang lagi setelah dipulihkan.
#
#   bash tests/harness/rx25-index-mutation.sh narrow  [db]   # WHERE status='in_flight'
#   bash tests/harness/rx25-index-mutation.sh restore [db]   # predikat penuh (schema)
#   bash tests/harness/rx25-index-mutation.sh show    [db]
#
# HANYA untuk DB throwaway harness (default: $HARNESS_PG_DB / turunan worktree).
# JANGAN dipakai ke staging/produksi.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MODE="${1:-show}"
DB="${2:-${HARNESS_PG_DB:-$(node --experimental-strip-types "$HERE/isolate.mts" db)}}"

case "$DB" in
  *staging*|*prod*|*production*) echo "refuse: '$DB' bukan DB harness" >&2; exit 2;;
esac

run() { sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -q "$@"; }

show() {
  sudo -u postgres psql -d "$DB" -tAc \
    "select coalesce((select indexdef from pg_indexes where indexname='uq_checkout_claims_live_phone'),'TIDAK ADA')"
}

case "$MODE" in
  narrow)
    # Bentuk pra-7d8389d: hanya klaim 'in_flight' yang ditahan. Baris 'created'
    # (order sudah tercetak, belum dibayar) TIDAK dipegang penjaga apa pun.
    run -c "DROP INDEX IF EXISTS uq_checkout_claims_live_phone;
            CREATE UNIQUE INDEX uq_checkout_claims_live_phone
              ON checkout_claims (tenant_id, phone)
              WHERE status = 'in_flight';"
    echo "narrow:"; show;;
  restore)
    # Pulihkan dengan mengapply ULANG sumber kebenarannya (idempoten), bukan
    # menyalin teks index ke skrip ini: teks di staging/ tidak boleh punya salinan.
    # Catatan: DB yang masih memuat hasil kebocoran (2+ baris hidup untuk satu
    # nomor) MEMANG akan menolak index ini — "could not create unique index ...
    # is duplicated". Itu bukan bug skrip; bersihkan datanya (TRUNCATE
    # checkout_claims / seed.sh --fresh) dulu, jangan tempel index-nya.
    rc=0
    sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -q -f - < "$REPO/staging/schema-consent.sql" >/dev/null || rc=$?
    sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -q -f - < "$REPO/staging/migration-fw41c-cancel.sql" >/dev/null || rc=$?
    if [ "$rc" != "0" ]; then
      echo "restore GAGAL (rc=$rc): DB memuat duplikat baris hidup (jejak kebocoran)." >&2
      echo "bersihkan dulu (TRUNCATE checkout_claims) atau seed.sh --fresh." >&2
      exit 1
    fi
    echo "restore:"; show;;
  show) show;;
  *) echo "usage: $0 narrow|restore|show [db]" >&2; exit 2;;
esac
