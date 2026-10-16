/**
 * Per-worktree isolation for the local harness (RX2-2).
 *
 * Sebelum ini SEMUA worktree memakai satu nama DB, satu rentang port, dan satu
 * set file /tmp. Dua `run-all.sh` dari dua worktree karena itu berebut Postgres
 * dan port yang sama: run 1 PASS, run 2-3 FAIL karena worktree lain meninggalkan
 * overload asing `cancel_promo_redemption(uuid,varchar,text,text)` di DB bersama
 * (CREATE OR REPLACE menambah overload, bukan mengganti).
 *
 * Semua nilai di bawah diturunkan dari path repo, jadi tiap worktree dapat DB,
 * prefix /tmp, dan blok 20 port sendiri. Butuh berbagi? Set HARNESS_PG_DB /
 * HARNESS_PORT_BASE / HARNESS_TMP_PREFIX secara eksplisit.
 *
 * Port di 40000+ dengan sengaja: `fetch` (undici) menolak port di daftar "bad
 * port" WHATWG (tertinggi 10080), jadi port app tidak bisa jatuh ke sana dan
 * berubah jadi "fetch failed" misterius.
 *
 * CLI (dipakai seed.sh / run-all.sh supaya bash dan node tidak pernah berbeda):
 *   node --experimental-strip-types tests/harness/isolate.mts db
 *   node --experimental-strip-types tests/harness/isolate.mts env
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

/** Repo root worktree INI (tests/harness/isolate.mts -> ../..). */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

const hash = (extra = "") =>
  crypto.createHash("sha1").update(REPO_ROOT + extra).digest("hex");

/** Nama stabil worktree ini: <slug_dir>_<6 hex hash path> (aman buat nama DB). */
export const SLUG = (() => {
  const base = path
    .basename(REPO_ROOT)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .slice(0, 20);
  return `${base || "ws"}_${hash(":slug").slice(0, 6)}`;
})();

export const PG_DB = process.env.HARNESS_PG_DB || `thrivin_test_${SLUG}`;
export const PROMO_DB = process.env.HARNESS_PROMO_DB || `thrivin_promo_${SLUG}`;

/** Blok port worktree ini (20 slot). Lihat catatan "bad port" di atas. */
export const PORT_BASE = Number(
  process.env.HARNESS_PORT_BASE ||
    40000 + (parseInt(hash(":port").slice(0, 6), 16) % 1200) * 20
);

const slot = (n: number) => PORT_BASE + n;
export const PORTS = {
  postgrest: slot(0),
  postgrestUpstream: slot(1),
  webhookApp: slot(2),
  webhookMock: slot(3),
  promoApp: slot(4),
  promoWeak: slot(5),
  promoMock: slot(6),
  waApp: slot(7),
  waBroken: slot(8),
  waNoProvider: slot(9),
  waQuota: slot(10),
  waMockProd: slot(11),
  w4App: slot(12),
  w4Broken: slot(13),
  w4Mock: slot(14),
  probeApp: slot(15),
  probeMock: slot(16),
  // F-W4-1c (cancel TTL): app normal, app tanpa key cancel, dan mock-nya.
  cancelApp: slot(17),
  cancelBroken: slot(18),
  cancelMock: slot(19),
} as const;

/** Artefak /tmp: di-prefix SLUG supaya worktree paralel tak pernah satu file. */
export const TMP_PREFIX =
  process.env.HARNESS_TMP_PREFIX || path.join(os.tmpdir(), `thrivin-${SLUG}`);
export const tmpPath = (name: string): string => path.join(TMP_PREFIX, name);
// Server mock & app menulis log/orders ke sini langsung (openSync/writeFileSync),
// jadi direktori harus ada sebelum import ini selesai.
fs.mkdirSync(TMP_PREFIX, { recursive: true });

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const what = process.argv[2];
  if (what === "db") {
    console.log(PG_DB);
  } else if (what === "env") {
    console.log(`HARNESS_SLUG=${SLUG}`);
    console.log(`HARNESS_PG_DB=${PG_DB}`);
    console.log(`HARNESS_PORT_BASE=${PORT_BASE}`);
    console.log(`TMP_PREFIX=${TMP_PREFIX}`);
  } else {
    console.error("usage: node --experimental-strip-types isolate.mts <db|env>");
    process.exit(2);
  }
}
