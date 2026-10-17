#!/usr/bin/env bash
# Mutation check: does tests/test-harness-keepalive.mts actually guard the fix?
#
#   bash tests/harness/f5-noreuse-mutation.sh [outdir]
#
# Mutation (one line, exactly the kind of "fix" a later edit could introduce):
# the harness fetch wrapper stops asking for `connection: close`, so pooled
# sockets come back. Expected: the guard exits 1 and the reuse assertion fails.
# The file is restored byte-for-byte afterwards (trap + sha256 check).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${1:-$HOME/t_f0de3b47-evidence}"
mkdir -p "$OUT"
TARGET="$HERE/stack.mts"
BAK="$(mktemp)"
cp "$TARGET" "$BAK"
restore() { cp "$BAK" "$TARGET"; rm -f "$BAK"; }
trap restore EXIT

before=$(sha256sum "$TARGET" | cut -d' ' -f1)
python3 - "$TARGET" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
src = p.read_text()
needle = 'headers.set("connection", "close");'
assert src.count(needle) == 1, f"expected exactly 1 mutation site, found {src.count(needle)}"
p.write_text(src.replace(needle, 'headers.set("connection", "keep-alive");'))
PY
after=$(sha256sum "$TARGET" | cut -d' ' -f1)
echo "mutation: stack.mts ${before:0:12} -> ${after:0:12} (connection: close -> keep-alive)"

cd "$REPO"
node --experimental-strip-types tests/test-harness-keepalive.mts >"$OUT/f5-mutation-off.log" 2>&1
rc=$?
echo "guard exit=$rc (expect 1)"
grep -E '^(PASS|FAIL)' "$OUT/f5-mutation-off.log"
restore
trap - EXIT
restored=$(sha256sum "$TARGET" | cut -d' ' -f1)
if [ "$restored" != "$before" ]; then
  echo "RESTORE FAILED: stack.mts is not byte-for-byte identical (${restored:0:12} != ${before:0:12})" >&2
  exit 2
fi
echo "restored byte-for-byte: ${restored:0:12}"
if [ "$rc" = "1" ]; then
  echo "MUTATION CAUGHT (guard went red on a one-line regression)"
else
  echo "MUTATION NOT CAUGHT — guard is not a guard" >&2
  exit 1
fi
