#!/usr/bin/env bash
# tests/run-all.sh — full local verification suite for the Thrivin web app.
#
#   bash tests/run-all.sh            # harness + unit + guards + e2e (builds first)
#   SKIP_BUILD=1 bash tests/run-all.sh
#
# Everything runs against a LOCAL Postgres + LOCAL PostgREST + LOCAL mock of the
# Scalev API. No staging DB, no production Scalev, no customer data.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
cd "$REPO"

echo "=============================================================="
echo "1/5  harness: local Postgres stand-in + mock Scalev"
echo "=============================================================="
bash "$HERE/harness/seed.sh"

if ! command -v node >/dev/null; then echo "node is required" >&2; exit 1; fi

echo
echo "=============================================================="
echo "2/5  unit checks (pure helpers + shipped-source properties)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-remediation-units.mts"
node --experimental-strip-types "$HERE/test-feedback-units.mts"

echo
echo "=============================================================="
echo "3/5  guard checks (existing redaction/replay helpers)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-webhook-guards.mts"

echo
echo "=============================================================="
echo "4/5  end-to-end: webhook routes -> PostgREST -> Postgres"
echo "=============================================================="
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo ">> next build"
  npm run build >/tmp/thrivin-test-build.log 2>&1 || { tail -40 /tmp/thrivin-test-build.log; exit 1; }
  echo ">> build ok"
fi
node --experimental-strip-types "$HERE/test-webhook-e2e.mts"

echo
echo "=============================================================="
echo "5/5  end-to-end: /api/feedback + /companion/nina/kritiksaran (A8)"
echo "=============================================================="
node --experimental-strip-types "$HERE/test-feedback-e2e.mts"

echo
echo "ALL SUITES PASSED"
echo "=============================================================="
