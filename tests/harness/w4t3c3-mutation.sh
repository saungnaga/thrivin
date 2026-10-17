#!/usr/bin/env bash
# Bukti negatif (mutasi pembalik) untuk kartu t_bd4781a6 — W4RX4 T3 follow-up
# C-3 + C-4. Asersi baru di tests/test-consent-gate-sql.mts +
# tests/test-consent-gate-e2e.mts harus FAIL kalau tiap penjaganya dibalik
# SATU PER SATU (bukan revert commit, bukan satu tumpukan mutasi).
#
#   bash tests/harness/w4t3c3-mutation.sh
#
# Leg 1 = penjaga BACA C-3 ("punya order" = nomor bisnis ATAU payment_url).
# Leg 2 = penjaga TULIS C-4 (complete_checkout_claim menolak nomor kosong).
# Semua di harness LOKAL (Postgres lokal + mock Scalev). Nol staging/produksi,
# nol data pelanggan. Path sementara per-worktree (pelajaran C-7).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
SRC="staging/schema-consent.sql"
PRISTINE="$TMP_PREFIX/w4t3c3-schema-fixed.sql"
SQL_LOG="$TMP_PREFIX/w4t3c3-mut-sql.log"
E2E_LOG="$TMP_PREFIX/w4t3c3-mut-e2e.log"
mkdir -p "$TMP_PREFIX"
cp "$SRC" "$PRISTINE"
restore() { cp "$PRISTINE" "$SRC"; }
trap restore EXIT

mutate() { # $1 = nama leg
  python3 - "$SRC" "$1" <<'PY'
import sys
path, leg = sys.argv[1], sys.argv[2]
sql = open(path, encoding="utf-8").read()
if leg == "read":
    old = "    IF v_existing.order_id IS NOT NULL OR COALESCE(v_existing.payment_url, '') <> '' THEN\n"
    new = "    IF v_existing.order_id IS NOT NULL THEN\n"
else:
    old = ("  IF p_order_id IS NULL OR btrim(p_order_id) = '' THEN\n"
           "    RETURN json_build_object('status', 'invalid_order');\n"
           "  END IF;\n\n")
    new = ""
assert old in sql, f"penjaga {leg} tidak ditemukan (sudah dibalik?)"
open(path, "w", encoding="utf-8").write(sql.replace(old, new, 1))
print(f"   mutasi {leg}: penjaga DIBUANG")
PY
}

guard_state() {
  if grep -q "COALESCE(v_existing.payment_url, '') <> ''" "$SRC"; then
    echo "   penjaga BACA C-3: ADA"
  else
    echo "   penjaga BACA C-3: TIDAK ADA"
  fi
  if grep -q "btrim(p_order_id) = ''" "$SRC"; then
    echo "   penjaga TULIS C-4: ADA"
  else
    echo "   penjaga TULIS C-4: TIDAK ADA"
  fi
}

echo "== 0. pohon ber-fix =="
guard_state
bash "$HERE/seed.sh" --fresh >"$TMP_PREFIX/w4t3c3-mut-seed.log" 2>&1

echo
echo "== 1. LEG 1: penjaga baca C-3 dibuang =="
mutate read
guard_state
bash "$HERE/seed.sh" --fresh >"$TMP_PREFIX/w4t3c3-mut-seed1.log" 2>&1
node --experimental-strip-types tests/test-consent-gate-sql.mts >"$SQL_LOG" 2>&1
echo "   SQL EXIT=$?  log=$SQL_LOG"
grep -E "^SQL gate|^  FAIL C-3" "$SQL_LOG" | sed 's/^/   /'
node --experimental-strip-types tests/test-consent-gate-e2e.mts >"$E2E_LOG" 2>&1
echo "   e2e EXIT=$?  log=$E2E_LOG"
grep -E "^e2e gate|^  FAIL C-3" "$E2E_LOG" | sed 's/^/   /'

echo
echo "== 2. LEG 2: penjaga tulis C-4 dibuang (leg 1 dipulihkan) =="
restore
mutate write
guard_state
bash "$HERE/seed.sh" --fresh >"$TMP_PREFIX/w4t3c3-mut-seed2.log" 2>&1
node --experimental-strip-types tests/test-consent-gate-sql.mts >"$SQL_LOG" 2>&1
echo "   SQL EXIT=$?  log=$SQL_LOG"
grep -E "^SQL gate|^  FAIL C-4" "$SQL_LOG" | sed 's/^/   /'

echo
echo "== 3. pulihkan + buktikan hijau lagi =="
restore
trap - EXIT
guard_state
bash "$HERE/seed.sh" --fresh >"$TMP_PREFIX/w4t3c3-mut-seed3.log" 2>&1
node --experimental-strip-types tests/test-consent-gate-sql.mts >"$TMP_PREFIX/w4t3c3-mut-post-sql.log" 2>&1
echo "   ulang pasca-fix SQL: $(grep -E '^SQL gate' "$TMP_PREFIX/w4t3c3-mut-post-sql.log")"
node --experimental-strip-types tests/test-consent-gate-e2e.mts >"$TMP_PREFIX/w4t3c3-mut-post-e2e.log" 2>&1
echo "   ulang pasca-fix e2e: $(grep -E '^e2e gate' "$TMP_PREFIX/w4t3c3-mut-post-e2e.log")"
echo "   git status staging/schema-consent.sql: [$(git status --short -- "$SRC" | tr -d '\n')]"
