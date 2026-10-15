/**
 * Read-only shape check for the W2 legal draft (t_e8d57ab3).
 *
 * Proves four things without touching DB/schema/server:
 *   1. no /terms route or link was published (route + component shape unchanged vs base);
 *   2. every clause in the T&C draft carries a `Provenance` line with resolvable source paths;
 *   3. every assumption / open-question id used in a clause exists in its registry;
 *   4. every placeholder («…») sits in a clause that is flagged as awaiting an owner decision.
 *
 * Run: node --experimental-strip-types tests/test-legal-draft-shape.mts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = process.cwd();
const BASE = "9392cdd";
const DOCS = ["terms-draft-2026-10-15.md", "privacy-delta-2026-10-15.md", "consent-wording-2026-10-15.md"];
const LEGAL_DIR = path.join(REPO, "docs", "legal");

let checks = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  checks++;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

function read(rel: string): string {
  const file = path.join(REPO, rel);
  // Missing file is a FAIL, not a crash: the point of running this on the
  // pre-draft tree is to see the checks report red, not to throw ENOENT.
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
}

const terms = read(path.join("docs", "legal", DOCS[0]));

// ── 1. nothing published ─────────────────────────────────────────────────────
check("no src/app/terms route", !fs.existsSync(path.join(REPO, "src", "app", "terms")));
check(
  "no /terms link in app/components",
  !fs
    .readdirSync(path.join(REPO, "src"), { recursive: true })
    .filter((f) => /\.(tsx?|mjs)$/.test(String(f)))
    .some((f) => /["'`]\/terms["'`]/.test(read(path.join("src", String(f)))))
);

const baseDiff = execFileSync("git", ["diff", "--name-only", BASE, "--", "src"], { cwd: REPO })
  .toString()
  .trim();
check("src/ untouched vs base " + BASE, baseDiff === "", `changed: ${baseDiff}`);

check("privacy page still has its 4 existing sections", ["1. Data Apa", "2. Bagaimana", "3. Garansi Uang", "4. Hubungi"].every((s) => read(path.join("src", "app", "privacy", "page.tsx")).includes(s)));

// ── 2. draft files + registries ──────────────────────────────────────────────
for (const doc of DOCS) check(`draft exists: docs/legal/${doc}`, fs.existsSync(path.join(LEGAL_DIR, doc)));

function registryIds(md: string, heading: string): Set<string> {
  const body = md.split(`## ${heading}`)[1]?.split("\n## ")[0] ?? "";
  return new Set([...body.matchAll(/^- \*\*([A-Z0-9-]+)\*\*/gm)].map((m) => m[1]));
}
const assumptions = registryIds(terms, "Registry asumsi");
const questions = registryIds(terms, "Registry pertanyaan owner");
check("assumption registry non-empty", assumptions.size >= 8, `${assumptions.size}`);
check("question registry non-empty", questions.size >= 12, `${questions.size}`);

// ── 3. every clause carries provenance ───────────────────────────────────────
const clauseRe = /^### ([A-Z0-9]+)\./gm;
const spans = [...terms.matchAll(clauseRe)].map((m, i, all) => ({
  id: m[1],
  start: m.index!,
  end: i + 1 < all.length ? all[i + 1].index! : terms.length,
}));
check("terms draft has >= 15 clauses", spans.length >= 15, `${spans.length}`);

const repoPath = /^(src|staging|tests|docs|public)\//;
// References that legitimately live outside this worktree: other worktrees
// (rc / promo-ws / w1 head), vault docs, the S0 contract and the spec.
const externalOk = /^(rc staging|promo-ws|w1 head|obsidian|spec|S0 kontrak|securing-agent-data-access|t_fdba2939)/;

for (const { id, start, end } of spans) {
  const block = terms.slice(start, end);
  const provLine = block.split("\n").find((l) => l.startsWith("**Provenance:**"));
  check(`${id}: provenance line present`, Boolean(provLine));
  if (!provLine) continue;

  const field = (key: "S" | "A" | "O") => (provLine.match(new RegExp(`\\b${key}=([^·]*)`))?.[1] ?? "").trim();
  const src = field("S");
  const asum = field("A");
  const open = field("O");

  check(`${id}: S/A/O all declared`, /\bS=/.test(provLine) && /\bA=/.test(provLine) && /\bO=/.test(provLine), provLine);

  for (const ref of src.split(",").map((s) => s.trim().replace(/`/g, ""))) {
    if (!ref || ref === "—") continue;
    if (repoPath.test(ref)) {
      const file = ref.replace(/:[\d,\-–]+$/, "").replace(/^rc staging\//, "staging/");
      check(`${id}: source path exists (${file})`, fs.existsSync(path.join(REPO, file)), ref);
    } else {
      check(`${id}: external source named (${ref.split(" ")[0]})`, externalOk.test(ref), ref);
    }
  }

  if (asum && asum !== "—") {
    const ids = asum.split(",").map((s) => s.trim()).filter(Boolean);
    check(`${id}: assumption ids registered`, ids.every((a2) => assumptions.has(a2)), ids.join("|"));
  }

  const openIds = open === "—" || !open ? [] : open.split(",").map((s) => s.trim()).filter(Boolean);
  if (openIds.length) {
    check(`${id}: open-question ids registered`, openIds.every((q) => questions.has(q)), openIds.join("|"));
  }

  const placeholders = block.split("\n").filter((l) => l.startsWith("> ") && l.includes("\u00ab"));
  check(`${id}: placeholder implies an open question`, placeholders.length === 0 || openIds.length > 0, `${placeholders.length} placeholder line(s)`);
}

// ── 4. the two consent checkboxes are specified as separate + unchecked ───────
const consent = read(path.join("docs", "legal", DOCS[2]));
check("consent draft: T&C box marked required", /WAJIB untuk transaksi/.test(consent));
check("consent draft: reminder box marked optional", /^## C2\. Checkbox 2 .*OPSIONAL, terpisah/m.test(consent));
check("consent draft: both default unchecked", (consent.match(/Default: tidak tercentang/g) ?? []).length >= 2);
check("consent draft: refusal does not block payment", /tidak menghalangi pembelian/.test(consent));

console.log(`\n${checks - failed}/${checks} checks passed`);
process.exit(failed === 0 ? 0 : 1);
