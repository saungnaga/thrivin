#!/usr/bin/env bash
# tests/run-all.sh — full local verification suite for the Scalev remediation.
#
#   bash tests/run-all.sh            # harness + unit + guards + SQL + e2e (builds first)
#   SKIP_BUILD=1 bash tests/run-all.sh
#
# Everything runs against a LOCAL Postgres + LOCAL PostgREST + LOCAL mock of the
# Scalev API. No staging DB, no production Scalev, no customer data.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
cd "$REPO"

if ! command -v node >/dev/null; then echo "node is required" >&2; exit 1; fi

# RX2-4 R4: satu worktree = satu run pada satu waktu. Dua run dari worktree yang
# sama berebut DB yang sama (DDL bersamaan) dan dulu baru gagal jauh di dalam
# seed.sh; lock ini menggagalkannya di muka dengan pesan yang jelas. flock
# dilepas otomatis saat proses mati, jadi tidak ada lock basi.
export HARNESS_RUN_ID="${HARNESS_RUN_ID:-$$}"

# DB / port / prefix /tmp per-worktree (RX2-2). Satu sumber kebenaran supaya
# bash dan node tidak pernah menghitung nilai berbeda.
eval "$(node --experimental-strip-types "$HERE/harness/isolate.mts" env)"
echo "worktree: $HARNESS_SLUG  db: $HARNESS_PG_DB  port base: $HARNESS_PORT_BASE  run: $HARNESS_RUN_ID"

# Lock per-worktree (RX2-4 R4) — jalurnya dari isolate.mts supaya bash dan node
# tidak pernah menghitung path berbeda. Kalau `flock` tidak ada, lewati — jangan
# bikin gate gagal karena tooling opsional.
if command -v flock >/dev/null; then
  exec 9>"$HARNESS_LOCK_PATH"
  if ! flock -n 9; then
    echo "run-all SUDAH berjalan untuk worktree ini ($HARNESS_LOCK_PATH)." >&2
    echo "Satu worktree = satu run pada satu waktu (docs/w4-rx2-4-verification.txt §4)." >&2
    exit 1
  fi
fi

echo "=============================================================="
echo "1/13 harness: local Postgres stand-in + mock Scalev"
echo "=============================================================="
bash "$HERE/harness/seed.sh"

echo
echo "=============================================================="
echo "2/13 unit checks (pure helpers)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-remediation-units.mts"
node --experimental-strip-types "$HERE/test-wa-first-units.mts"
# Nina pascabayar (t_ef348cbc): outbound pembelian HANYA lewat WhatsApp Cloud,
# nol jalur Baileys walau env bridge lama masih terpasang.
node --experimental-strip-types "$HERE/test-welcome-message.mts"
node --experimental-strip-types "$HERE/test-wa-cloud-units.mts"
# Nomor terdaftar → langsung pilih paket (t_a40e5534): snapshot jadi payload
# langkah 2–8 + kunci sumber UI (jalur terdaftar tidak boleh ke langkah 2).
node --experimental-strip-types "$HERE/test-registered-onboarding-units.mts"
node --experimental-strip-types "$HERE/test-consent-gate-units.mts"
# F-W4-1c: klasifikasi hasil cancel + verifikasi response (nol DB/HTTP).
node --experimental-strip-types "$HERE/test-cancel-ttl-units.mts"
# F-W4-1c ronde V (V-7): streak sapuan yang tidak bisa disimpan wajib tetap ber-alert.
# Stub HTTP lokal + child proses sapuan; nol DB.
FW41C_V7_PROBE_PORT=$((HARNESS_PORT_BASE + 90)) node --experimental-strip-types "$HERE/harness/fw41c-v7-alert-probe.mts"
# RX2-4: higiene harness — port wajib eksplisit, nol anak yatim, pemilik port
# harus run ini (nol DB/HTTP nyata, ~2 s).
node --experimental-strip-types "$HERE/test-harness-isolation.mts"
# A6: teks legal yang dipublikasikan harus tetap = teks yang disetujui owner.
node --experimental-strip-types "$HERE/test-legal-draft-shape.mts"
# A8: feedback — helper/redaksi/batas input (nol DB/HTTP).
node --experimental-strip-types "$HERE/test-feedback-units.mts"
# Higiene klien HTTP harness: nol socket keep-alive dipakai ulang (flake
# `UND_ERR_SOCKET other side closed` di suite e2e saat kotak berbeban). Kontrol
# negatif ikut diuji di dalamnya: klien mentah HARUS gagal pada urutan yang sama.
node --experimental-strip-types "$HERE/test-harness-keepalive.mts"

echo
echo
echo "=============================================================="
echo "2b/13 copy checks (W1: pricing claims, promo label, guarantee)"
echo "     source-level: COPY_ROOT=<tree> reruns against another revision"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-web-copy-units.mts"
# BUG UANG: kutipan promo terikat paket — ganti paket tidak boleh menampilkan
# angka paket lama (quarter Rp 184.800 nyangkut ke paket 1 tahun).
node --experimental-strip-types "$HERE/test-promo-quote-plan-binding.mts"
# Checkout sederhana (owner 21/10): TEMANBARU auto-terpasang, harga coret di
# SEMUA kartu sejak halaman dibuka, banner+countdown hilang, 429 tidak jadi
# banner merah di jalur otomatis.
node --experimental-strip-types "$HERE/test-checkout-promo-auto.mts"
node --experimental-strip-types "$HERE/test-web-copy-copy.mts"

echo
echo "=============================================================="
echo "2c/13 copy check, tree-wide (W1: retired price claims + promo gates)"
echo "     walks every shipped file, so new components are covered too"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-web-copy-treewide.mts"

echo "=============================================================="
echo "3/13 guard checks (existing redaction/replay helpers)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-webhook-guards.mts"

echo
echo "=============================================================="
echo "4/13 promo SQL: atomic redeem, kuota, kedaluwarsa, race"
echo "    (own throwaway DB — redeems fired from parallel psql conns)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-promo-sql.mts"

echo
echo "=============================================================="
echo "5/13 consent/checkout gate SQL: urutan, idempotensi, append-only,"
echo "     single-flight klaim, hak akses anon"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-consent-gate-sql.mts"

echo
echo "=============================================================="
echo "6/13 end-to-end: webhook routes -> PostgREST -> Postgres"
echo "=============================================================="
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo ">> next build"
  npm run build >"$TMP_PREFIX/build.log" 2>&1 || { tail -40 "$TMP_PREFIX/build.log"; exit 1; }
  echo ">> build ok"
fi
node --experimental-strip-types "$HERE/test-webhook-e2e.mts"

echo
echo "=============================================================="
echo "7/13 end-to-end: promo (dashboard auth/CRUD + checkout + webhook)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-promo-e2e.mts"

echo
echo "=============================================================="
echo "8/13 end-to-end: WA-first TANPA OTP (lookup new/active/inactive + sesi checkout)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-wa-first-e2e.mts"

echo
echo "=============================================================="
echo "9/13 end-to-end: checkout gate + consent (T&C wajib, opt-in terpisah)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-consent-gate-e2e.mts"

echo
echo "=============================================================="
echo "10/13 end-to-end: cancel order Scalev saat TTL retire (F-W4-1c)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-cancel-ttl-e2e.mts"

echo
echo "=============================================================="
echo "11/13 ACL objek yang lahir dari DROP+CREATE (C-6, kartu t_f05112a7)"
echo "     (seed.sh --fresh + seed.sh kedua; DB ditinggal baru)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-webhook-purge-acl.mts"

echo
echo "=============================================================="
echo "12/13 end-to-end: /api/feedback + /companion/nina/kritiksaran (A8)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-feedback-e2e.mts"

echo
echo "=============================================================="
echo "13/13 end-to-end: nomor terdaftar → pilih paket (snapshot + status + CTA)"
echo "     (kartu t_a40e5534; pakai slot port probe 15/16)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-registered-onboarding-e2e.mts"

echo
echo "=============================================================="
echo "14/14 end-to-end: Nina pascabayar Cloud-only + halaman sukses WA"
echo "     (kartu t_ef348cbc; mock Graph + mock bridge hitung nol panggilan)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-postpay-e2e.mts"

echo
echo "ALL SUITES PASSED"
echo "=============================================================="