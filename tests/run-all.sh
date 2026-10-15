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

echo "=============================================================="
echo "1/6  harness: local Postgres stand-in + mock Scalev"
echo "=============================================================="
bash "$HERE/harness/seed.sh"

if ! command -v node >/dev/null; then echo "node is required" >&2; exit 1; fi

echo
echo "=============================================================="
echo "2/6  unit checks (pure helpers)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-remediation-units.mts"

echo
echo "=============================================================="
echo "2b/6 copy checks (W1: pricing claims, promo label, guarantee)"
echo "     source-level: COPY_ROOT=<tree> reruns against another revision"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-web-copy-units.mts"
node --experimental-strip-types "$HERE/test-web-copy-copy.mts"

echo
echo "=============================================================="
echo "2c/6 copy check, tree-wide (W1: retired price claims + promo gates)"
echo "     walks every shipped file, so new components are covered too"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-web-copy-treewide.mts"

echo
echo "=============================================================="
echo "3/6  guard checks (existing redaction/replay helpers)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-webhook-guards.mts"

echo
echo "=============================================================="
echo "4/6  promo SQL: atomic redeem, kuota, kedaluwarsa, race"
echo "    (own throwaway DB — redeems fired from parallel psql conns)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-promo-sql.mts"

echo
echo "=============================================================="
echo "5/6  end-to-end: webhook routes -> PostgREST -> Postgres"
echo "=============================================================="
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo ">> next build"
  npm run build >/tmp/thrivin-test-build.log 2>&1 || { tail -40 /tmp/thrivin-test-build.log; exit 1; }
  echo ">> build ok"
fi
node --experimental-strip-types "$HERE/test-webhook-e2e.mts"

echo
echo "=============================================================="
echo "6/6  end-to-end: promo (dashboard auth/CRUD + checkout + webhook)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-promo-e2e.mts"

echo
echo "=============================================================="
echo "ALL SUITES PASSED"
echo "=============================================================="
