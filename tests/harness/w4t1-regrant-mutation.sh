#!/usr/bin/env bash
# Bukti negatif (mutasi pembalik) untuk W4RX4 T1 follow-up F-2 — asersi §12 di
# tests/test-consent-gate-sql.mts harus FAIL kalau penangkap `EXCEPTION WHEN
# unique_violation` di langkah 2 `claim_checkout_order` (replay baris `failed`)
# dilepas kembali ke bentuk pra-fix.
#
#   bash tests/harness/w4t1-regrant-mutation.sh
#
# Mutasi ditambatkan pada STRUKTUR — blok `BEGIN … EXCEPTION WHEN
# unique_violation THEN … END;` yang membungkus `UPDATE … WHERE id =
# v_existing.id` — bukan pada teks isi blok atau jumlah blok di berkas. Isi blok
# sudah bergerak setelah merge T3 (return-nya kini `blocked_live_status(...)`,
# bukan `'in_flight'`) dan berkas kini memuat 3 blok penangkap (langkah 1,
# langkah 2, langkah 7); mutasi berbasis teks-salinan jadi no-op SUNYI dan
# laporan "pra-fix exit 0" palsu (QC B-2, kartu t_514b5cba). Bentuk anchor tidak
# ketemu / mutasi tidak berubah / pra-fix tidak merah karena alasan yang benar ⇒
# script ABORT (exit != 0) dan suite TIDAK dianggap bukti.
#
# Semua di harness LOKAL (Postgres lokal). Nol staging/produksi, nol data
# pelanggan. Mutasi = satu hal saja (pembungkus langkah 2), bukan revert commit.
# File dipulihkan apa pun yang terjadi (trap) dan dibuktikan byte-identik
# (sha256) dengan salinan awal. EXIT=0 hanya kalau kedua arah terbukti:
# pra-fix SUITE FAIL (dengan `FAIL F-2` benar-benar ada di log), pasca-fix hijau.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
eval "$(node --experimental-strip-types tests/harness/isolate.mts env)"
SRC="staging/schema-consent.sql"
PRISTINE="/tmp/w4t1-regrant-schema-fixed.sql"
PRE_LOG="/tmp/w4t1-regrant-pre-sql.log"
POST_LOG="/tmp/w4t1-regrant-post-sql.log"
cp "$SRC" "$PRISTINE"
ORIG_SHA="$(sha256sum "$SRC" | awk '{print $1}')"

abort() { echo; echo "ABORT: $*"; echo "BUKTI NEGATIF TIDAK TERBUKTI"; exit 1; }

# Jumlah blok penangkap di berkas. Dipakai sebagai DELTA (harus turun tepat 1),
# bukan sebagai angka mutlak yang bisa basi saat skema bergerak.
guards() { grep -c "EXCEPTION WHEN unique_violation" "$SRC"; }

# $1 = pre (lepas pembungkus langkah 2). Anchor dicari dari struktur; isi blok
# tidak ikut dipakai sebagai kunci. Gagal cari/gagal ubah ⇒ exit != 0.
mutate_pre() {
  python3 - "$SRC" <<'PY'
import sys
path = sys.argv[1]
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)

anchor = [i for i, l in enumerate(lines) if l.strip() == "WHERE id = v_existing.id"]
if len(anchor) != 1:
    sys.exit(f"anchor 'WHERE id = v_existing.id' muncul {len(anchor)}x (harap 1)")
a = anchor[0]

exc = next((i for i in range(a, min(a + 6, len(lines)))
           if lines[i].strip().startswith("EXCEPTION WHEN unique_violation THEN")), None)
if exc is None:
    sys.exit("penangkap EXCEPTION WHEN unique_violation tidak ada setelah anchor UPDATE")
if not any("RETURNING id INTO v_claim_id;" in lines[i] for i in range(a, exc)):
    sys.exit("anchor UPDATE bukan bentuk `RETURNING id INTO v_claim_id;`")

begin = next((i for i in range(a, max(a - 6, -1), -1) if lines[i].strip() == "BEGIN"), None)
end = next((i for i in range(exc, min(exc + 6, len(lines))) if lines[i].strip() == "END;"), None)
if begin is None or end is None or not begin < a < exc < end:
    sys.exit(f"pembungkus BEGIN..END tidak lengkap (BEGIN={begin} EXCEPTION={exc} END={end})")

out = lines[:begin] + lines[begin + 1:exc] + lines[end + 1:]
body = "".join(out[begin:exc - 1])
if "UPDATE checkout_claims" not in body or "WHERE id = v_existing.id" not in body:
    sys.exit("bentuk pra-fix tidak memuat UPDATE langkah 2 yang utuh")
open(path, "w", encoding="utf-8").write("".join(out))
print(f"   dibuang {exc - begin + 1} baris: BEGIN (baris {begin + 1}) + EXCEPTION..END (baris {exc + 1}..{end + 1})")
print("   bentuk pra-fix sekarang:")
for l in out[begin - 1:exc - 1]:
    sys.stdout.write("   | " + l)
PY
}
restore() { cp "$PRISTINE" "$SRC"; }
trap restore EXIT

BEFORE="$(guards)"
echo "== 1. pasca-fix: penangkap di RPC klaim = $BEFORE blok (isi/temuan tidak dipakai sebagai kunci)"
grep -n "EXCEPTION WHEN unique_violation" "$SRC" | sed 's/^/   /'

echo
echo "== 2. pra-fix: pembungkus langkah 2 dilepas (anchor struktural)"
mutate_pre || abort "mutasi tidak bisa diterapkan ⇒ no-op sunyi dicegah"
AFTER="$(guards)"
[ "$AFTER" = "$((BEFORE - 1))" ] || abort "jumlah penangkap $BEFORE -> $AFTER (harap turun tepat 1)"
git diff --quiet -- "$SRC" && abort "mutasi tidak mengubah $SRC"
bash "$HERE/seed.sh" --fresh >/tmp/w4t1-regrant-seed.log 2>&1
node --experimental-strip-types tests/test-consent-gate-sql.mts >"$PRE_LOG" 2>&1
PRE_EXIT=$?
PRA_FAIL="$(grep -c '^  FAIL F-2: replay K1 saat nomor punya order hidup' "$PRE_LOG")"
echo "   penangkap sekarang: $AFTER  EXIT=$PRE_EXIT  FAIL-F-2=$PRA_FAIL  log=$PRE_LOG"
grep -E "^SQL gate|^  FAIL F-2" "$PRE_LOG" | sed 's/^/   /'
[ "$PRE_EXIT" != "0" ] || abort "pra-fix exit 0 ⇒ mutasi tidak bergigi"
[ "$PRA_FAIL" != "0" ] || abort "pra-fix merah tapi bukan karena asersi F-2 ⇒ merah salah alasan (log: $PRE_LOG)"

echo
echo "== 3. pulihkan (byte-identik) + seed ulang"
restore
trap - EXIT
RESTORED_SHA="$(sha256sum "$SRC" | awk '{print $1}')"
echo "   sha256 awal=$ORIG_SHA"
echo "   sha256 kini=$RESTORED_SHA"
[ "$RESTORED_SHA" = "$ORIG_SHA" ] || abort "berkas tidak pulih byte-identik"
[ -z "$(git status --short -- "$SRC")" ] || abort "berkas masih kotor setelah restore"
echo "   penangkap kembali: $(guards)  git status: [$(git status --short -- "$SRC" | tr -d '\n')]"
bash "$HERE/seed.sh" --fresh >/tmp/w4t1-regrant-restore-seed.log 2>&1
node --experimental-strip-types tests/test-consent-gate-sql.mts >"$POST_LOG" 2>&1
POST_EXIT=$?
echo "   EXIT=$POST_EXIT  $(grep -E '^SQL gate' "$POST_LOG")"
[ "$POST_EXIT" = "0" ] || abort "pasca-fix tidak hijau (log: $POST_LOG)"

echo
echo "BUKTI NEGATIF OK: pra-fix FAIL (exit $PRE_EXIT, FAIL F-2 x$PRA_FAIL), pasca-fix hijau (exit 0), berkas pulih sha256 $ORIG_SHA"
exit 0
