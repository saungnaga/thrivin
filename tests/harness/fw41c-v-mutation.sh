#!/usr/bin/env bash
# Bukti negatif (mutasi pembalik) untuk RONDE PATCH V — kartu t_1d1cf77f.
#
#   bash tests/harness/fw41c-v-mutation.sh [v1|v2|v3|v4|all]
#
# Tiap mutasi mengembalikan SATU perbaikan ke bentuk pra-fix, lalu menuntut asersi
# yang menguncinya FAIL. Mutasi = satu hal saja (bukan revert commit). Sumber
# dipulihkan apa pun yang terjadi (trap), dan DB di-seed fresh SEBELUM tiap run
# (higiene V-6: bukti negatif di DB yang di-drop dulu, bukan DB sisa pasca-fix).
#
#   V-1  sapuan tidak menominasi  -> §11 "baris basi jadi retired" harus FAIL
#   V-2  hasil batch dipukul rata -> §12 "cancel_failed|missing_canonical_order_id" harus FAIL
#   V-3  lease 30 s -> 15 s       -> §10 "lease ≥ jendela worker" harus FAIL
#   V-4  gerbang cancel_next_retry_at dibuang -> §10 "backoff dibaca" harus FAIL
#
# Semua lokal: Postgres lokal + PostgREST lokal + mock Scalev lokal. Nol staging,
# nol produksi, nol data pelanggan, nol kredensial nyata.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
echo "db: $HARNESS_PG_DB  prefix: $TMP_PREFIX"

SWEEP="staging/cancel-sweep.mts"
CANCEL="src/lib/checkout-cancel.ts"
SCHEMA="staging/schema-consent.sql"
OUT="${W4V_EVIDENCE_DIR:-$HOME/w4v-evidence}/mutation"
mkdir -p "$OUT"

for f in "$SWEEP" "$CANCEL" "$SCHEMA"; do cp "$f" "/tmp/w4v-pristine-$(basename "$f")"; done
restore() {
  cp "/tmp/w4v-pristine-$(basename "$SWEEP")" "$SWEEP"
  cp "/tmp/w4v-pristine-$(basename "$CANCEL")" "$CANCEL"
  cp "/tmp/w4v-pristine-$(basename "$SCHEMA")" "$SCHEMA"
}
trap restore EXIT

py() { python3 - "$@"; }

mutate_v1() { # sapuan tidak lagi menominasi baris basi (pra-fix: hanya retry antrean)
  py "$SWEEP" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = """  const nom = await nominateStaleCancels();
  console.log(
    `[checkout-cancel] sweep nominasi: nominated=${nom.nominated} missing_id=${nom.missingId}`
  );
"""
assert old in s, "blok nominasi tidak ditemukan"
open(p, "w", encoding="utf-8").write(s.replace(old, "  const nom = { nominated: 0, missingId: 0 };\n", 1))
PY
}

mutate_v2() { # hasil batch dipukul rata: SEMUA baris yang dilease dicap retired
  py "$CANCEL" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = """      for (const claim of withId) await record(claim.claimId, "retired");"""
assert old in s, "baris retire per-ID tidak ditemukan"
open(p, "w", encoding="utf-8").write(s.replace(old, """      for (const claim of claimed) await record(claim.claimId, "retired");""", 1))
PY
}

mutate_v3() { # lease kembali lebih pendek dari jendela worker sendiri
  py "$SCHEMA" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = "cancel_claimed_until = now() + INTERVAL '30 seconds',"
assert old in s, "lease 30 s tidak ditemukan"
open(p, "w", encoding="utf-8").write(s.replace(old, "cancel_claimed_until = now() + INTERVAL '15 seconds',", 1))
PY
}

mutate_v4() { # gerbang backoff dibuang (cancel_next_retry_at jadi dekorasi)
  py "$SCHEMA" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = "      AND (cancel_next_retry_at IS NULL OR cancel_next_retry_at <= now())\n"
assert old in s, "gerbang cancel_next_retry_at tidak ditemukan"
open(p, "w", encoding="utf-8").write(s.replace(old, "", 1))
PY
}

run_case() { # $1 = nama (log), $2 = pola FAIL yang WAJIB muncul
  local name="$1" pattern="$2" log="$OUT/$1.log"
  bash "$HERE/seed.sh" --fresh >"$OUT/$1-seed.log" 2>&1
  node --experimental-strip-types tests/test-cancel-ttl-e2e.mts >"$log" 2>&1
  local code=$?
  echo "   EXIT=$code  log=$log"
  echo "   FAIL yang ketangkap:"
  grep -c "^  FAIL" "$log" | sed 's/^/     jumlah FAIL=/'
  grep -E "^  FAIL" "$log" | while read -r line; do
    case "$line" in *"$pattern"*) echo "     ✅ $line (sesuai harapan)";; *) echo "     ? $line";; esac
  done
  if grep -qF "$pattern" "$log" && [ "$code" != "0" ]; then
    echo "   HASIL: $name TERBUKTI GAGAL saat perbaikannya dibalik"
  else
    echo "   HASIL: ⚠️ $name tidak menangkap mutasinya (assertion tidak load-bearing)"
  fi
}

WHICH="${1:-all}"
case "$WHICH" in v1|all)
  echo; echo "== V-1: nominasi dibuang dari sapuan =="
  mutate_v1; run_case "v1-sweep-tanpa-nominasi" "baris basi jadi \`retired\` TANPA checkout ulang"
  restore;;
esac
case "$WHICH" in v2|all)
  echo; echo "== V-2: hasil cancel dipukul rata per batch =="
  mutate_v2; echo "   (rebuild: mutasi ada di src/ yang dipakai app)"
  npm run build >"$OUT/v2-build.log" 2>&1 && echo "   build ok"
  run_case "v2-batch-dipukul-rata" "cancel_failed|missing_canonical_order_id"
  restore;;
esac
case "$WHICH" in v3|all)
  echo; echo "== V-3: lease 30 s -> 15 s =="
  mutate_v3; run_case "v3-lease-pendek" "lease ≥ jendela worker"
  restore;;
esac
case "$WHICH" in v4|all)
  echo; echo "== V-4: gerbang backoff dibuang =="
  mutate_v4; run_case "v4-backoff-dibuang" "backoff dibaca"
  restore;;
esac

restore
echo; echo "== pulih: sumber kembali pasca-fix, DB di-seed fresh, app di-rebuild =="
grep -c "INTERVAL '30 seconds'" "$SCHEMA" | sed 's/^/   lease 30 s di skema: /'
grep -c "nominateStaleCancels()" "$SWEEP" | sed 's/^/   nominasi di sapuan: /'
npm run build >"$OUT/rebuild-restored.log" 2>&1 && echo "   rebuild ok"
bash "$HERE/seed.sh" --fresh >"$OUT/final-seed.log" 2>&1 && echo "   seed fresh ok"
