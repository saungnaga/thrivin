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
#   M3  the body is read to the end before the 8 KiB ceiling is applied (F-1)
#       -> the "refused without reading the body" checks must fail
#   M4  the raw PostgREST error body is logged (F-3)
#       -> the log-redaction checks must fail
#   M5  length measured in UTF-16 units + unpaired surrogates kept (F-4)
#       -> the emoji / surrogate checks must fail
#   M6  a duplicate token is answered without comparing the stored text (F-5)
#       -> the 409 checks must fail
#
# Run a subset with MUTANTS="m1 m3", or one with MUTANTS=m5.
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
LIB="src/lib/feedback.ts"
BACKUP_DIR="$(mktemp -d)"
cp "$ROUTE" "$BACKUP_DIR/route.ts"
cp "$LIB" "$BACKUP_DIR/feedback.ts"
BUILD_LOG="/tmp/thrivin-feedback-negative-build.log"

restore() {
  cp "$BACKUP_DIR/route.ts" "$ROUTE"
  cp "$BACKUP_DIR/feedback.ts" "$LIB"
  rm -rf "$BACKUP_DIR"
  echo ">> restoring pristine sources + rebuilding"
  if ! npm run build >"$BUILD_LOG" 2>&1; then
    echo "!! restore build FAILED — see $BUILD_LOG" >&2
    exit 1
  fi
}
trap restore EXIT

run_mutant() {
  local label="$1"; shift
  local desc="$1"; shift
  local log="/tmp/thrivin-feedback-negative-${label}.log"
  echo
  echo "=============================================================="
  echo "Mutant ${label}: ${desc}"
  echo "=============================================================="
  cp "$BACKUP_DIR/route.ts" "$ROUTE"
  cp "$BACKUP_DIR/feedback.ts" "$LIB"
  python3 - "$ROUTE" "$LIB" "$label" <<'PY'
import pathlib, sys
route_path, lib_path, label = sys.argv[1], sys.argv[2], sys.argv[3]

def edit(path, pairs):
    p = pathlib.Path(path)
    s = p.read_text()
    for old, new in pairs:
        assert s.count(old) == 1, f"{label}: anchor not found in {path}:\n{old}"
        s = s.replace(old, new)
    p.write_text(s)
    return s

if label == "m1":
    # A failed durable insert is reported as success.
    edit(route_path, [('''      console.error("[Feedback] store failed:", redactError(err));
      return NextResponse.json(
        { ok: false, error: "Kritik/saran kamu belum tersimpan. Coba kirim ulang." },
        { status: 503 }
      );
''', '''      console.error("[Feedback] store failed:", redactError(err));
      return NextResponse.json({ ok: true }, { status: 201 });
      ''')])

elif label == "m2":
    # The read path starts listing what everyone wrote.
    edit(route_path, [('''/** No list exposure, ever. */
export function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}''', '''/** No list exposure, ever. */
export function GET() {
  return NextResponse.json(
    { rows: [{ message_text: "leaked" }], total: 1 },
    { status: 200 }
  );
}''')])

elif label == "m3":
    # F-1 undone: buffer the whole body first, check the size afterwards.
    edit(route_path, [('''    const raw = await readBoundedBody(req);
    if (!raw.ok) {
      return NextResponse.json({ ok: false, error: "Permintaan terlalu besar." }, { status: 413 });
    }
''', '''    const rawText = await req.text();
    const raw = { ok: true as const, text: rawText };
    if (Buffer.byteLength(rawText, "utf-8") > 8 * 1024) {
      return NextResponse.json({ ok: false, error: "Permintaan terlalu besar." }, { status: 413 });
    }
''')])

elif label == "m4":
    # F-3 undone: log whatever PostgREST answered (it contains the failing row).
    edit(lib_path, [('''  let suffix = "";
  const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
  if (body && typeof body.code === "string" && /^[A-Za-z0-9_]{1,16}$/.test(body.code)) {
    suffix = ` code=${body.code}`;
  }
  return new Error(`[Feedback] ${what} failed: status=${res.status}${suffix}`);
''', '''  return new Error(`[Feedback] ${what} failed: status=${res.status} ${await res.text()}`);
''')])

elif label == "m5":
    # F-4 undone: UTF-16 length back, unpaired surrogates kept.
    edit(lib_path, [
        ('''    .replace(/[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]/g, "")
''', ''),
        ('''  const chars = messageLength(messageText);''', '''  const chars = messageText.length;'''),
    ])

elif label == "m6":
    # F-5 undone: a duplicate token is accepted whatever text it carries.
    edit(lib_path, [('''      textMatches: existing[0]?.message_text === input.messageText,''',
                     '''      textMatches: true,''')])

else:
    raise SystemExit(f"unknown mutant {label}")

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
want() { case " ${MUTANTS:-m1 m2 m3 m4 m5 m6} " in *" $1 "*) return 0;; *) return 1;; esac; }

if want m1; then
  run_mutant m1 "insert failure answered 201 (false thank-you)" \
    "unreachable DB -> 503" \
    "503 body carries no success marker" \
    "missing Supabase config -> 503 (no disk fallback)" \
    || status=1
fi
if want m2; then
  run_mutant m2 "GET answers 200 with the rows (list exposure)" \
    "GET /api/feedback -> 405" \
    "405 advertises POST only" \
    || status=1
fi
if want m3; then
  run_mutant m3 "body buffered before the size check (F-1 undone)" \
    "declared 100 KiB body -> 413 without any of it being read" \
    "chunked body past the ceiling -> 413 before the stream ends" \
    || status=1
fi
if want m4; then
  run_mutant m4 "raw PostgREST error body logged (F-3 undone)" \
    "submitted emoji never reaches the log" \
    "request token never reaches the log on the failure path" \
    "PostgREST \`details\` (the failing row) is never logged" \
    "the failure is logged as status + code only" \
    || status=1
fi
if want m5; then
  run_mutant m5 "UTF-16 length + unpaired surrogates kept (F-4 undone)" \
    "5 emoji (JS length 10) -> 400, never a 503" \
    "text with an unpaired surrogate -> 201, not a 503" \
    || status=1
fi
if want m6; then
  run_mutant m6 "duplicate token accepted without comparing text (F-5 undone)" \
    "same token + different text -> 409 (the edit was NOT stored)" \
    "409 body carries no success marker" \
    || status=1
fi

if [ "$status" = "0" ]; then
  echo
  echo "MUTATION PROOF OK — the suite catches every W5/W5-RX guarantee it claims."
fi
exit "$status"
