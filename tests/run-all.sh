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

# DB / port / prefix /tmp per-worktree (RX2-2). Satu sumber kebenaran supaya
# bash dan node tidak pernah menghitung nilai berbeda.
eval "$(node --experimental-strip-types "$HERE/harness/isolate.mts" env)"
echo "worktree: $HARNESS_SLUG  db: $HARNESS_PG_DB  port base: $HARNESS_PORT_BASE"

echo "=============================================================="
echo "1/10 harness: local Postgres stand-in + mock Scalev"
echo "=============================================================="
bash "$HERE/harness/seed.sh"

echo
echo "=============================================================="
echo "2/10 unit checks (pure helpers)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-remediation-units.mts"
node --experimental-strip-types "$HERE/test-wa-first-units.mts"
node --experimental-strip-types "$HERE/test-consent-gate-units.mts"
# F-W4-1c: klasifikasi hasil cancel + verifikasi response (nol DB/HTTP).
node --experimental-strip-types "$HERE/test-cancel-ttl-units.mts"
# A6: teks legal yang dipublikasikan harus tetap = teks yang disetujui owner.
node --experimental-strip-types "$HERE/test-legal-draft-shape.mts"

echo
echo "=============================================================="
echo "3/10 guard checks (existing redaction/replay helpers)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-webhook-guards.mts"

echo
echo "=============================================================="
echo "4/10 promo SQL: atomic redeem, kuota, kedaluwarsa, race"
echo "    (own throwaway DB — redeems fired from parallel psql conns)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-promo-sql.mts"

echo
echo "=============================================================="
echo "5/10 consent/checkout gate SQL: urutan, idempotensi, append-only,"
echo "     single-flight klaim, hak akses anon"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-consent-gate-sql.mts"

echo
echo "=============================================================="
echo "6/10 end-to-end: webhook routes -> PostgREST -> Postgres"
echo "=============================================================="
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo ">> next build"
  npm run build >"$TMP_PREFIX/build.log" 2>&1 || { tail -40 "$TMP_PREFIX/build.log"; exit 1; }
  echo ">> build ok"
fi
node --experimental-strip-types "$HERE/test-webhook-e2e.mts"

echo
echo "=============================================================="
echo "7/10 end-to-end: promo (dashboard auth/CRUD + checkout + webhook)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-promo-e2e.mts"

echo
echo "=============================================================="
echo "8/10 end-to-end: WA-first identity (OTP mock) + status + kandidat promo"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-wa-first-e2e.mts"

echo
echo "=============================================================="
echo "9/10 end-to-end: checkout gate + consent (T&C wajib, opt-in terpisah)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-consent-gate-e2e.mts"

echo
echo "=============================================================="
echo "10/10 end-to-end: cancel order Scalev saat TTL retire (F-W4-1c)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-cancel-ttl-e2e.mts"

echo
echo "ALL SUITES PASSED"
echo "=============================================================="
