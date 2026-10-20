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

// ── 1. status publikasi (DIPERBARUI di W4: draft sudah dipublikasikan) ───────
// W2 memeriksa "belum ada route/link". Setelah owner menyetujui teks (16/10),
// W4 t_f5ec336c mempublikasikannya — jadi yang diperiksa sekarang adalah
// kebalikannya, plus bukti bahwa yang dipublikasikan = versi yang dicatat.
check("src/app/terms route EXISTS (published in W4)", fs.existsSync(path.join(REPO, "src", "app", "terms")));
check(
  "footer links /terms",
  /href="\/terms"/.test(read(path.join("src", "components", "Footer.tsx")))
);
check(
  "checkout links /terms",
  /TERMS_PATH/.test(read(path.join("src", "app", "companion", "nina", "onboarding", "[step]", "page.tsx")))
);
check(
  "published version constant is terms-2026-10-15-v1",
  /TERMS_VERSION = "terms-2026-10-15-v1"/.test(read(path.join("src", "lib", "legal.ts")))
);
check(
  "no raw placeholder literal in page.tsx templates",
  !/«/.test(read(path.join("src", "app", "terms", "page.tsx"))) &&
    !/«/.test(read(path.join("src", "app", "privacy", "page.tsx")))
);
// F-S3 (revisi 2026-10-20): nol placeholder di konstanta legal. Alamat dihapus
// dari dokumen atas perintah pemilik, jadi tidak ada lagi «…» yang menunggu diisi.
const legalConsts = read(path.join("src", "lib", "legal.ts"));
const placeholdersInLegal = legalConsts.match(/«[^»]+»/g) || [];
check(
  "legal constants have zero placeholders",
  placeholdersInLegal.length === 0,
  `found placeholders: ${JSON.stringify(placeholdersInLegal)}`
);

check(
  "privacy page has the new published sections",
  // Revisi owner 20/10: pasal "Pengingat WhatsApp" dihapus, penomoran 3..7 bergeser.
  ["1. Data Apa", "2. Bagaimana", "3. Garansi", "4. Berapa Lama", "5. Pihak Ketiga", "6. Perubahan", "7. Hubungi"].every((s) =>
    read(path.join("src", "app", "privacy", "page.tsx")).includes(s)
  )
);
check(
  "absolute claim replaced",
  !/100% aman/.test(read(path.join("src", "app", "privacy", "page.tsx")))
);

// Revisi owner 20/10 ("poin soal reminder apus aja"): kata pengingat/reminder
// tidak boleh muncul lagi di dua halaman legal. Cek di sumber supaya mutasi
// balik ketahuan tanpa perlu build + HTTP.
for (const page of ["terms", "privacy"]) {
  const src = read(path.join("src", "app", page, "page.tsx"));
  check(`${page}: nol klausul pengingat/reminder`, !/pengingat|reminder/i.test(src));
}

// Revisi owner 20/10: pasal pengingat dihapus dari dua halaman. Uji bergigi:
// penomoran harus 1..N tanpa bolong, dan setiap rujukan "(pasal N)" harus
// menunjuk pasal yang benar-benar ada — jangan sampai nomor lama menggantung.
for (const page of ["terms", "privacy"]) {
  const src = read(path.join("src", "app", page, "page.tsx"));
  const numbers = [...src.matchAll(/<h2[^>]*>\s*(\d+)\./g)].map((m) => Number(m[1]));
  check(
    `${page}: pasal bernomor 1..${numbers.length} tanpa bolong`,
    numbers.length > 0 && numbers.every((n, i) => n === i + 1),
    `found ${JSON.stringify(numbers)}`
  );
  for (const ref of src.matchAll(/pasal (\d+)/g)) {
    const n = Number(ref[1]);
    check(`${page}: rujukan pasal ${n} menunjuk pasal yang ada`, numbers.includes(n));
  }
}

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
