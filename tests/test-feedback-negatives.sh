#!/usr/bin/env bash
# tests/test-feedback-negatives.sh — mutation proof for the kritik/saran suite.
#
#   bash tests/test-feedback-negatives.sh
#
# A green suite proves nothing unless it can go red. This script breaks one
# guarantee at a time in src/app/api/feedback/route.ts, rebuilds, and asserts the
# suite CATCHES it:
#
#   M1  a failed durable insert is answered 201 {"ok":true}
#       -> "no false thank-you" checks must fail
#   M2  GET starts listing what other people wrote
#       -> "no list exposure" checks must fail
#
# Each mutant is reverted and the tree rebuilt before the next one, and once more
# at the end, so a passing run leaves the worktree exactly as it found it.
#
# No staging, no production, no customer data: local Postgres + local PostgREST.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
cd "$REPO"

ROUTE="src/app/api/feedback/route.ts"
BACKUP="$(mktemp)"
cp "$ROUTE" "$BACKUP"
BUILD_LOG="/tmp/thrivin-feedback-negative-build.log"

restore() {
  cp "$BACKUP" "$ROUTE"
  rm -f "$BACKUP"
  echo ">> restoring pristine route + rebuilding"
  if ! npm run build >"$BUILD_LOG" 2>&1; then
    echo "!! restore build FAILED — see $BUILD_LOG" >&2
    exit 1
  fi
}
trap restore EXIT

run_mutant() {
  local label="$1"; shift
  local log="/tmp/thrivin-feedback-negative-${label}.log"
  echo
  echo "=============================================================="
  echo "Mutant ${label}: $*"
  echo "=============================================================="
  cp "$BACKUP" "$ROUTE"
  python3 - "$ROUTE" "$label" <<'PY'
import pathlib, sys
path, label = sys.argv[1], sys.argv[2]
p = pathlib.Path(path)
s = p.read_text()

if label == "m1":
    # A failed durable insert is reported as success.
    old = '''      console.error("[Feedback] store failed:", redactError(err));
      return NextResponse.json(
        { ok: false, error: "Kritik/saran kamu belum tersimpan. Coba kirim ulang." },
        { status: 503 }
      );
'''
    new = '''      console.error("[Feedback] store failed:", redactError(err));
      return NextResponse.json({ ok: true }, { status: 201 });
      '''
    assert s.count(old) == 1, "m1 anchor not found"
    s = s.replace(old, new)

elif label == "m2":
    # The read path starts listing what everyone wrote.
    old = '''/** No list exposure, ever. */
export function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}'''
    new = '''/** No list exposure, ever. */
export function GET() {
  return NextResponse.json(
    { rows: [{ message_text: "leaked" }], total: 1 },
    { status: 200 }
  );
}'''
    assert s.count(old) == 1, "m2 anchor not found"
    s = s.replace(old, new)
else:
    raise SystemExit(f"unknown mutant {label}")

p.write_text(s)
print(f">> {label} applied")
PY

  npm run build >"$BUILD_LOG" 2>&1 || {
    tail -30 "$BUILD_LOG"
    echo "!! mutated build failed — that alone is a finding" >&2
    exit 1
  }

  set +e
  node --experimental-strip-types "$HERE/test-feedback-e2e.mts" > "$log" 2>&1
  local suite_exit=$?
  set -e
  echo ">> suite exit code: ${suite_exit} (must be non-zero)"
  grep -E "^FAIL" "$log" | head -20 || true

  local bad=0
  if [ "$suite_exit" = "0" ]; then
    echo "!! suite PASSED on mutated code — checks are not sensitive" >&2
    bad=1
  fi
  shift
  for wanted in "$@"; do
    if ! grep -q "^FAIL  ${wanted}" "$log"; then
      echo "!! expected FAIL missing for this mutant: ${wanted}" >&2
      bad=1
    fi
  done
  return "$bad"
}

status=0
run_mutant m1 "insert failure answered 201 (false thank-you)" \
  "unreachable DB -> 503" \
  "503 body makes no success claim" \
  "missing Supabase config -> 503 (no disk fallback)" \
  || status=1
run_mutant m2 "GET answers 200 with the rows (list exposure)" \
  "GET /api/feedback -> 405" \
  "405 advertises POST only" \
  || status=1

if [ "$status" = "0" ]; then
  echo
  echo "MUTATION PROOF OK — the suite catches a false thank-you and a feedback listing."
fi
exit "$status"
