/**
 * Tree-wide copy-claim scan (W1 delta C-6).
 * Run: node --experimental-strip-types tests/test-web-copy-treewide.mts
 *      COPY_ROOT=/path/to/other/tree node --experimental-strip-types tests/test-web-copy-treewide.mts
 *
 * `test-web-copy-copy.mts` only inspects a hardcoded UI_FILES list, so a brand
 * new component could reintroduce a retired price claim unnoticed. This scan
 * walks every shipped source file instead, so the rule survives new files.
 *
 * Same negative-proof contract as the sibling suites: point COPY_ROOT at the
 * pre-fix tree (`git archive 2e10f56`) and this MUST exit 1 — no mocked pass.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.env.COPY_ROOT
  ? path.resolve(process.env.COPY_ROOT)
  : path.resolve(import.meta.dirname, "..");

const SCAN_DIRS = ["src", "public"];
const SCAN_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".html", ".json", ".md", ".txt", ".svg",
]);

/**
 * A claim that only a comment still mentions is not shown to anyone. Skipping
 * comment-only lines keeps `pricing-copy.ts` able to explain the retired
 * wording. ponytail: line-level, not a real parser — a claim appended to a
 * trailing comment on a code line is still caught, which is the failure mode
 * that matters.
 */
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
}

/** B1: price claims retired by W1 — none may come back anywhere.
 *  Lists are lowercase and matched against the lowercased line (C-6.1): the
 *  original case-sensitive check let `Mulai dari Rp` / `Khusus Pengguna Baru`
 *  through, and Indonesian copy starts sentences with a capital. */
const BANNED_PRICE = ["39.000", "39rb", "39000", "mulai dari rp"];

/** B2: promo_gate claims the server does not enforce. `redeem_promo` checks
 *  is_active/expires_at/plan_keys + one redemption per phone number; there is no
 *  new-user gate, so no shipped copy may say there is one. */
const BANNED_PROMO_GATE = ["pengguna baru", "user baru"];

const hits: string[] = [];
const scanFiles: string[] = [];

function walk(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs);
    else if (SCAN_EXT.has(path.extname(entry.name))) scanFile(abs);
  }
}

function scanFile(abs: string) {
  scanFiles.push(abs);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  lines.forEach((line, idx) => {
    if (isCommentLine(line)) return;
    const lower = line.toLowerCase();
    for (const bad of [...BANNED_PRICE, ...BANNED_PROMO_GATE]) {
      if (lower.includes(bad)) {
        hits.push(`${path.relative(root, abs)}:${idx + 1}: "${bad}" — ${line.trim().slice(0, 120)}`);
      }
    }
  });
}

for (const dir of SCAN_DIRS) walk(path.join(root, dir));

console.log(`B1/B2 tree-wide: scanned ${scanFiles.length} files under ${SCAN_DIRS.join(", ")} (root: ${root})`);
for (const hit of hits) console.log(`FAIL  ${hit}`);
console.log(
  hits.length === 0
    ? `\nPASS  no retired price claim and no unenforced promo gate in ${scanFiles.length} files`
    : `\n${hits.length} violation(s) found`
);
process.exit(hits.length === 0 ? 0 : 1);
