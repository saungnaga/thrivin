/**
 * Private /tmp artifact helpers (RX2-4 follow-up B2).
 *
 * `isolate.mts` derives /tmp paths from the worktree path, so the path itself is
 * predictable: anyone who can write to /tmp can pre-create
 * `<prefix>/postgrest.conf -> <victim>` and a plain `fs.writeFileSync()` follows
 * the link, overwriting a file outside the harness (verifier probe t_6e7be2aa:
 * sentinel overwritten, dir mode 775). Same class of bug for the mock's
 * per-pid artifact defaults.
 *
 * Rules encoded here (fail-closed, no silent fallback):
 *   - every artifact dir is mode 0700 and owned by this uid; a symlink where a
 *     directory is expected, or a dir owned by someone else, is a hard error;
 *   - files are created with O_CREAT|O_EXCL|O_NOFOLLOW (never follows a symlink,
 *     even in the race window after the stale entry is removed);
 *   - rewritten files (mock order/cancel mirrors, written on every request) use
 *     O_TRUNC|O_NOFOLLOW after an lstat sanity check.
 *
 * Plain .mjs on purpose: `tests/mock-scalev.mjs` is run without
 * --experimental-strip-types and cannot import a .mts file.
 */
import fs from "fs";
import os from "os";
import path from "path";

const MODE = 0o700;

/** Buat (atau rapikan) direktori privat milik uid ini. Throw kalau bukan milik kita. */
export function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: MODE });
  const st = fs.lstatSync(dir);
  if (st.isSymbolicLink()) {
    throw new Error(
      `${dir}: symlink, bukan direktori — path artefak /tmp yang predictable tidak ` +
        `boleh diikuti (kemungkinan pre-created oleh proses lain).`
    );
  }
  if (!st.isDirectory()) throw new Error(`${dir}: ada, tapi bukan direktori.`);
  if (st.uid !== process.getuid()) {
    throw new Error(
      `${dir}: milik uid ${st.uid}, bukan uid kita (${process.getuid()}) — menolak ` +
        `menulis artefak ke direktori yang bisa dikendalikan proses lain.`
    );
  }
  if ((st.mode & 0o777) !== MODE) fs.chmodSync(dir, MODE);
  return dir;
}

/** Direktori artefak unik (OS-assigned, 0700) — dipakai kalau tidak ada override. */
export function mkPrivateTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const OPEN_EXCL =
  fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
const OPEN_TRUNC =
  fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW;

/**
 * Tulis file baru, eksklusif, tanpa mengikuti symlink. Entri lama dengan nama yang
 * sama dibuang lebih dulu — kalau itu symlink, hanya link-nya yang hilang; O_EXCL
 * tetap menolak kalau link-nya dibuat ulang di antara rm dan open.
 */
export function writePrivateFile(file, content, mode = 0o600) {
  ensurePrivateDir(path.dirname(file));
  fs.rmSync(file, { force: true });
  const fd = fs.openSync(file, OPEN_EXCL, mode);
  try {
    fs.writeSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
}

/** Tulis ulang file milik kita sendiri (mock menulis mirror-nya tiap request). */
export function rewritePrivateFile(file, content, mode = 0o600) {
  ensurePrivateDir(path.dirname(file));
  const st = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!st) return writePrivateFile(file, content, mode);
  if (st.isSymbolicLink() || !st.isFile() || st.uid !== process.getuid()) {
    throw new Error(
      `${file}: bukan file biasa milik uid kita (symlink/non-file/uid lain) — ` +
        `menolak menulis lewatnya.`
    );
  }
  const fd = fs.openSync(file, OPEN_TRUNC, mode);
  try {
    fs.writeSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
}
