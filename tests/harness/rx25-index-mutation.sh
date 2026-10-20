#!/usr/bin/env bash
# tests/harness/rx25-index-mutation.sh — pembalik penjaga per-nomor (RX2-5).
#
# Kartu t_370981ec: asersi "dua kunci berbeda paralel" (tests/test-consent-gate-e2e.mts)
# pernah merah satu kali. Bukti negatif kelas race ini = jalankan probe dengan
# penjaga index dikembalikan ke bentuk PRA-FIX, lalu lihat kebocorannya muncul
# lagi — dan hilang lagi setelah dipulihkan.
#
# Kartu t_a259d6c6 (B-7): bentuk pra-fix = commit 7d8389d, dan satu-satunya yang
# berubah di sana adalah PREDIKAT index per-nomor (`WHERE status='in_flight'`
# → `WHERE status IN ('in_flight','created') AND paid_at IS NULL`). Langkah 6
# (`SELECT ... status='created' AND paid_at IS NULL`) sudah ada sebelum fix itu,
# jadi "kombinasi mutasi yang wajib" = index saja; yang wajib BUKAN index+langkah 6.
# Karena itu buktinya harus lewat probe JENDELA deterministik
# (tests/test-rx25-window-probe.mts). Probe frekuensi (test-rx25-race-probe.mts)
# TERUKUR tidak layak jadi bukti negatif kelas ini: dengan predikat pra-fix
# terpasang ia tetap 40/40 bersih 0 anomali, sedangkan probe jendela pada index
# yang sama bocor 3/3 putaran (t_a259d6c6).
#
#   bash tests/harness/rx25-index-mutation.sh proof   [db] [rounds]  # merah→hijau, ter-assert
#   bash tests/harness/rx25-index-mutation.sh narrow  [db]   # WHERE status='in_flight'
#   bash tests/harness/rx25-index-mutation.sh restore [db]   # predikat penuh (schema)
#   bash tests/harness/rx25-index-mutation.sh show    [db]
#
# `proof` = satu perintah yang meng-assert DUA arah (pra-fix WAJIB bocor, pasca
# pulih WAJIB ditahan) dan keluar non-nol kalau salah satu arah tidak terpenuhi.
# Tanpa itu, "mutasi tidak pernah terpasang" (mis. ditolak penjaga nama DB, atau
# .next belum dibuild) terbaca sebagai "bukti negatif hijau" — persis yang bikin
# B-7 tidak konklusif. `proof` TIDAK dipasang di run-all: mutasi ini destruktif
# (DROP/CREATE index di DB harness) dan harus manual.
#
# HANYA untuk DB throwaway harness (default: $HARNESS_PG_DB / turunan worktree).
# JANGAN dipakai ke staging/produksi.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MODE="${1:-show}"
DB="${2:-${HARNESS_PG_DB:-$(node --experimental-strip-types "$HERE/isolate.mts" db)}}"

# Penjaga nama DB (B-7). Nama DB harness SELALU turunan tests/harness/isolate.mts:
# `thrivin_(test|promo)_<slug>_<6 hex>`, dan <slug> datang dari nama DIREKTORI
# worktree. Worktree yang namanya memuat "staging" (mis. batch-2026-10-15/i1-staging-rc
# → thrivin_test_i1_staging_rc_<hash>) karena itu menghasilkan DB throwaway yang
# SAH; pola lama `*staging*` menolaknya buta sehingga mutasi tak pernah terpasang.
# Yang TETAP ditolak: apa pun yang memuat "prod"/"production" (selalu, walau
# kebetulan berbentuk harness), dan nama ber-"staging" yang BUKAN bentuk harness
# (DB staging nyata: `staging`, `thrivin_staging`, `supabase-staging`, ...).
is_harness_db() { [[ "$1" =~ ^thrivin_(test|promo)_[a-z0-9_]+_[0-9a-f]{6}$ ]]; }
refuse() { echo "refuse: '$DB' bukan DB harness" >&2; exit 2; }
DB_LC="${DB,,}"
case "$DB_LC" in *prod*) refuse;; esac
case "$DB_LC" in *staging*) is_harness_db "$DB_LC" || refuse;; esac

run() { sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -q "$@"; }

show() {
  sudo -u postgres psql -d "$DB" -tAc \
    "select coalesce((select indexdef from pg_indexes where indexname='uq_checkout_claims_live_phone'),'TIDAK ADA')"
}

narrow_apply() {
  # Bentuk pra-7d8389d: hanya klaim 'in_flight' yang ditahan. Baris 'created'
  # (order sudah tercetak, belum dibayar) TIDAK dipegang penjaga apa pun.
  run -c "DROP INDEX IF EXISTS uq_checkout_claims_live_phone;
          CREATE UNIQUE INDEX uq_checkout_claims_live_phone
            ON checkout_claims (tenant_id, phone)
            WHERE status = 'in_flight';"
}

restore_apply() {
  # Pulihkan dengan mengapply ULANG sumber kebenarannya (idempoten), bukan
  # menyalin teks index ke skrip ini: teks di staging/ tidak boleh punya salinan.
  # Catatan: DB yang masih memuat hasil kebocoran (2+ baris hidup untuk satu
  # nomor) MEMANG akan menolak index ini — "could not create unique index ...
  # is duplicated". Itu bukan bug skrip; bersihkan datanya (TRUNCATE
  # checkout_claims / seed.sh --fresh) dulu, jangan tempel index-nya.
  local rc=0
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -q -f - < "$REPO/staging/schema-consent.sql" >/dev/null || rc=$?
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -q -f - < "$REPO/staging/migration-fw41c-cancel.sql" >/dev/null || rc=$?
  if [ "$rc" != "0" ]; then
    echo "restore GAGAL (rc=$rc): DB memuat duplikat baris hidup (jejak kebocoran)." >&2
    echo "bersihkan dulu (TRUNCATE checkout_claims) atau seed.sh --fresh." >&2
    exit 1
  fi
}

case "$MODE" in
  narrow)
    narrow_apply; echo "narrow:"; show;;
  restore)
    restore_apply; echo "restore:"; show;;
  show) show;;
  proof)
    ROUNDS="${3:-3}"
    OUT="${HARNESS_TMP_PREFIX:-/tmp}/rx25-proof"
    mkdir -p "$OUT"
    [ -d "$REPO/.next" ] || {
      echo "proof needs a build: '$REPO/.next' tidak ada — jalankan 'npm run build' dulu." >&2
      exit 1
    }
    # Probe dipin ke DB yang SAMA dengan yang dimutasi skrip ini. Tanpa pin ini
    # (B-7): operator yang mengoper db eksplisit sementara HARNESS_PG_DB menunjuk
    # DB lain akan memutasi satu DB dan mengukur DB lain — vonis "hijau/merah"
    # yang tidak mengukur apa pun. RUN_ID baru per leg supaya identitas listener
    # tidak mewarisi run lama.
    probe() { # $1 = tag
      ( cd "$REPO" &&
        HARNESS_PG_DB="$DB" HARNESS_RUN_ID="rx25-proof-$1-$$" \
          RX25_OUT="$OUT" RX25_TAG="$1" \
          node --experimental-strip-types tests/test-rx25-window-probe.mts "$ROUNDS" ) \
        >"$OUT/probe-$1.log" 2>&1
    }
    echo "DB: $DB   rounds: $ROUNDS   out: $OUT"
    FAIL=0
    before="$(show)"
    case "$before" in
      *created*) ;;
      *) echo "   catatan: DB mulai dari bentuk PRA-FIX (sisa run lama) — dipulihkan ke predikat penuh di langkah 3";;
    esac

    echo "== 1. pra-fix: predikat index dikembalikan (index saja — langkah 6 sudah ada pra-fix) =="
    narrow_apply
    show | sed 's/^/   /'
    case "$(show)" in
      *created*) echo "   !! predikat masih memuat 'created' — mutasi TIDAK terpasang" >&2; FAIL=1;;
      *) echo "   mutasi terpasang (predikat tanpa 'created')";;
    esac

    echo
    echo "== 2. probe jendela deterministik WAJIB merah (kebocoran lahir lagi) =="
    rc=0
    probe pre || rc=$?
    grep -E "kebocoran dari" "$OUT/probe-pre.log" | sed 's/^/   /' || true
    echo "   EXIT=$rc  log=$OUT/probe-pre.log"
    if [ "$rc" != "1" ]; then
      echo "   !! TIDAK berteeth: pra-fix keluar $rc (harus 1 = ada kebocoran)" >&2
      FAIL=1
    fi
    # Pra-syarat probe (jendela benar-benar terbuka) harus sah; kalau tidak,
    # "merah" bisa datang dari sebab lain.
    grep -cE "menahan=true" "$OUT/probe-pre.log" | grep -qx "$ROUNDS" || {
      echo "   !! pra-syarat jendela tidak sah di semua $ROUNDS putaran (lihat log)" >&2
      FAIL=1
    }
    # Vonis hanya sah kalau probe benar-benar mengukur DB yang dimutasi di atas.
    grep -qF "\"db\": \"$DB\"" "$OUT/window-pre.json" || {
      echo "   !! probe mengukur DB lain dari yang dimutasi (lihat 'db' di $OUT/window-pre.json)" >&2
      FAIL=1
    }

    echo
    echo "== 3. bersihkan jejak kebocoran + pulihkan predikat penuh (sumber: staging/) =="
    run -c "TRUNCATE checkout_claims, consent_events, onboarding_progress RESTART IDENTITY CASCADE;"
    restore_apply
    show | sed 's/^/   /'
    # Pemulihan dianggap sah kalau predikat penuh kembali (memuat 'created'), dan
    # — kalau DB memang mulai dari keadaan penuh — hasilnya identik dengan
    # sebelum mutasi. DB yang MEMANG mulai dari bentuk pra-fix (sisa run lama)
    # tidak boleh membuat bukti negatif gagal karena sebab yang salah.
    case "$(show)" in
      *created*)
        [ "$(show)" = "$before" ] || { echo "   !! index pasca-pulih beda dari sebelum mutasi" >&2; FAIL=1; } ;;
      *) echo "   !! index pasca-pulih BUKAN predikat penuh (tidak memuat 'created')" >&2; FAIL=1;;
    esac
    [ -z "$(git -C "$REPO" status --short -- staging tests | grep -v '^?? ' || true)" ] || {
      echo "   !! ada file berubah di staging/ atau tests/ — mutasi tidak boleh menyentuh pohon" >&2
      FAIL=1
    }

    echo
    echo "== 4. probe yang sama WAJIB hijau (0 kebocoran) =="
    rc=0
    probe post || rc=$?
    grep -E "kebocoran dari" "$OUT/probe-post.log" | sed 's/^/   /' || true
    echo "   EXIT=$rc  log=$OUT/probe-post.log"
    if [ "$rc" != "0" ]; then
      echo "   !! penjaga TIDAK menahan: pasca-pulih keluar $rc (harus 0)" >&2
      FAIL=1
    fi

    echo
    echo "   ringkasan: $OUT/window-pre.json  $OUT/window-post.json"
    if [ "$FAIL" = "0" ]; then
      echo "BUKTI NEGATIF RX2-5: OK — pra-fix bocor (exit 1), pasca-pulih ditahan (exit 0), index pulih identik."
    else
      echo "BUKTI NEGATIF RX2-5: GAGAL — lihat baris '!!' di atas." >&2
      exit 1
    fi;;
  *) echo "usage: $0 proof|narrow|restore|show [db] [rounds]" >&2; exit 2;;
esac
