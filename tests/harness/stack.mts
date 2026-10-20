/**
 * Local Supabase stand-in for the Scalev webhook tests.
 *
 * Real Postgres + real PostgREST, so the route tests actually exercise the
 * constraints that make the remediation work (H-5 unique index, H-6 unique
 * fulfillment key with ON CONFLICT DO NOTHING, RLS deny policies).
 *
 * Why not just hit Supabase staging: staging is a shared dataset, and the tests
 * must never write to it. See thrivin-team-sop / securing-agent-data-access.
 */
import crypto from "crypto";
import fs from "fs";
import { spawn, type ChildProcess } from "child_process";
import { execFileSync } from "child_process";
import { PORTS, PG_DB, RUN_ID, tmpPath } from "./isolate.mts";
import { writePrivateFile } from "./private-fs.mjs";

/**
 * Harness HTTP client must never reuse a pooled keep-alive socket
 * (flake `UND_ERR_SOCKET "other side closed"` in the e2e suites, ported from the
 * F-5 investigation — canonical harness is w4/RX2).
 *
 * The suites call `psqlSuper()` (`execFileSync` → `sudo -u postgres psql`) in
 * chains, which blocks THIS process's event loop. An idle socket in undici's
 * pool then cannot be closed client-side (own keep-alive timeout ≈3 s) and the
 * server's FIN cannot be processed (node default `keepAliveTimeout` 5000 ms;
 * `next start` only overrides it from KEEP_ALIVE_TIMEOUT, which the harness
 * never sets). The next request lands on a socket the server is closing; on a
 * loaded box the server handles its due keep-alive timer before the arrived
 * request and the suite dies mid-run with
 *
 *     TypeError: fetch failed / SocketError: UND_ERR_SOCKET "other side closed"
 *
 * The app does NOT crash (clean log, process alive) ⇒ the suite goes green/red
 * for the wrong reason. `Connection: close` destroys the socket when the
 * response completes — no timer involved — so a blocked event loop cannot
 * re-open the window. No retry logic: one place, both e2e suites.
 *
 * `unwrappedFetch` is exported so the guard (tests/test-harness-keepalive.mts)
 * can prove the race still exists on this box with the raw client.
 */
const unwrappedFetch = globalThis.fetch;
// ponytail: only string/URL inputs get the header — every call site in tests/ uses
// those. A Request input would keep pooling; the guard fails loudly on reuse.
globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("connection", "close");
  return unwrappedFetch(input, { ...init, headers });
}) as typeof fetch;
export { unwrappedFetch };

export {
  PG_DB,
  PORTS,
  PROMO_DB,
  PORT_BASE,
  REPO_ROOT,
  RUN_ID,
  SLUG,
  TMP_PREFIX,
  tmpPath,
} from "./isolate.mts";

export const PG_HOST = process.env.HARNESS_PG_HOST || "127.0.0.1";
export const PG_PORT = process.env.HARNESS_PG_PORT || "5432";
export const PG_USER = "authenticator";
export const PG_PASSWORD = process.env.HARNESS_PG_PASSWORD || "localtestpw";
export const PG_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}`;

// Default per-worktree (isolate.mts): dua worktree paralel tidak boleh berbagi
// port. Override lewat env kalau memang mau berbagi.
export const POSTGREST_PORT = Number(
  process.env.HARNESS_POSTGREST_PORT || PORTS.postgrest
);
export const POSTGREST_URL = `http://127.0.0.1:${POSTGREST_PORT}`;
/** PostgREST listens here; the app only ever sees POSTGREST_URL (prefix proxy). */
export const POSTGREST_UPSTREAM_PORT = Number(
  process.env.HARNESS_POSTGREST_UPSTREAM_PORT || PORTS.postgrestUpstream
);
export const JWT_SECRET =
  process.env.HARNESS_JWT_SECRET || "super-secret-jwt-key-with-at-least-32-chars-long";

/**
 * Binari PostgREST. Dibaca PER PANGGILAN `startPostgrest()` (bukan saat import)
 * supaya test harness itu sendiri bisa menyuntik binari palsu — RX2-4 R2.
 */
const POSTGREST_BIN = () => process.env.POSTGREST_BIN || "/tmp/postgrest";

/** HS256 JWT PostgREST accepts; `role` selects which DB role the request runs as. */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string = JWT_SECRET
): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: "postgrest", role: "anon", exp: 4_000_000_000, ...payload });
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export const SERVICE_KEY = signJwt({ role: "service_role" });
export const ANON_KEY = signJwt({ role: "anon" });

export function hasPsql(): boolean {
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Run SQL as the postgres superuser via `sudo -u postgres` (peer auth). */
export function psqlSuper(sql: string, { db = PG_DB, csv = false } = {}): string {
  const args = ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", db];
  if (csv) args.push("-At", "-F", "|");
  args.push("-c", sql);
  return execFileSync("sudo", args, { encoding: "utf-8" }).trim();
}

export function createDatabase(): void {
  psqlSuper(`CREATE DATABASE ${PG_DB} OWNER postgres;`, { db: "postgres" });
}

export function databaseExists(): boolean {
  const out = psqlSuper(
    `SELECT 1 FROM pg_database WHERE datname = '${PG_DB}';`,
    { db: "postgres" }
  );
  return out.includes("1");
}

export function applySqlFile(file: string): void {
  // File is read as ubuntu and streamed to psql: postgres cannot traverse
  // /home/ubuntu, so `-f <path>` would fail with EACCES.
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", PG_DB, "-q", "-f", "-"],
    { input: fs.readFileSync(file), stdio: ["pipe", "ignore", "inherit"] }
  );
}

/**
 * Tunggu HTTP siap. Timeout bisa diperpendek lewat HARNESS_HTTP_WAIT_MS (dipakai
 * test harness sendiri supaya kasus "gagal start" tidak memakan 20 s).
 */
async function waitForHttp(
  url: string,
  timeoutMs = Number(process.env.HARNESS_HTTP_WAIT_MS || 20000)
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/** Identitas yang diiklankan `tests/harness/prefix-proxy.mjs` di /__proxy-identity. */
export interface ProxyIdentity {
  pid: number;
  listenPort: number;
  upstreamPort: number;
  runId: string;
}

/**
 * RX2-4 R3: baca identitas proxy. `null` = tak ada yang menjawab / jawabannya
 * bukan JSON (bukan proxy kita) — bukan error, itu artinya "belum ada listener".
 */
async function readProxyIdentity(): Promise<ProxyIdentity | null> {
  try {
    const res = await fetch(`${POSTGREST_URL}/__proxy-identity`);
    if (res.status !== 200) return null;
    const id = (await res.json()) as ProxyIdentity;
    return typeof id?.pid === "number" ? id : null;
  } catch {
    return null;
  }
}

/**
 * RX2-4 R3: tunggu mock Scalev di `port` siap SEKALIGUS buktikan itu mock MILIK
 * KITA (pola promo-ws: `GET /__mock-identity`). Kalau port kita kebetulan dipegang
 * proses lain, mock anak mati EADDRINUSE sementara `waitFor` dijawab listener
 * asing — suite lalu membaca file orders milik run lain dan hasilnya hijau/merah
 * untuk alasan yang salah. Karena itu: gagal keras, bukan mengadopsi.
 */
export async function assertMockOwner(
  port: number,
  expectedPid: number | undefined,
  timeoutMs = 20000
): Promise<void> {
  const start = Date.now();
  let last = "no response";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__mock-identity`);
      last = `status ${res.status}`;
      if (res.status === 200) {
        const id = (await res.json()) as {
          pid?: number;
          port?: number;
          ordersFile?: string;
        };
        if (id.pid !== expectedPid) {
          throw new Error(
            `port ${port}: mock Scalev dipegang proses lain (pid ${id.pid}, ` +
              `bukan anak kita pid ${expectedPid}) — port tabrakan, menolak ` +
              `lanjut (ordersFile=${id.ordersFile}).`
          );
        }
        if (Number(id.port) !== port) {
          throw new Error(
            `port ${port}: mock Scalev mengaku listen di ${id.port} — bukan mock kita.`
          );
        }
        return;
      }
      // Menjawab HTTP tapi bukan mock kita: tidak ada gunanya menunggu.
      if (res.status !== 502 && res.status !== 503) {
        throw new Error(
          `port ${port}: listener yang menjawab /__mock-identity bukan mock Scalev ` +
            `kita (${last}) — port tabrakan. Cek \`ss -ltnp | grep :${port}\`.`
        );
      }
    } catch (err: any) {
      if (err?.message?.startsWith(`port ${port}:`)) throw err;
      last = err?.cause?.code || err?.message || String(err);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `port ${port}: mock Scalev milik run ini tidak siap dalam ${timeoutMs}ms (${last}).`
  );
}

/**
 * RX2-4 follow-up B1: buktikan listener di `port` benar-benar dipegang `pid`.
 *
 * `waitForHttp()` bisa dijawab listener ASING sebelum anak kita sempat exit
 * (PostgREST bind gagal ⇒ exit beberapa ms kemudian, tapi `exitCode` masih null
 * saat itu) — probe verifier: foreign HTTP listener + `/tmp/postgrest` yang
 * "resource busy" tetap menghasilkan handle dan proxy meneruskan body asing.
 * Jadi bukan soal kalah cepat: kita tidak boleh menyimpulkan kepemilikan dari
 * "HTTP menjawab" sama sekali. Di Linux pemilik socket LISTEN bisa dibaca pasti
 * dari /proc: cari inode socket untuk port itu di /proc/net/tcp[6], lalu cek
 * apakah inode itu ada di fd proses anak. Tidak bisa dibuktikan ⇒ gagal keras.
 */
function listenInode(port: number): string | null {
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) continue;
      if (cols[3] !== "0A") continue; // 0A = LISTEN
      if (cols[1].split(":")[1] !== hexPort) continue;
      return cols[9]; // inode
    }
  }
  return null;
}

function ownsSocket(pid: number, inode: string): boolean {
  const dir = `/proc/${pid}/fd`;
  let fds: string[];
  try {
    fds = fs.readdirSync(dir);
  } catch {
    return false; // anak sudah hilang
  }
  for (const fd of fds) {
    try {
      if (fs.readlinkSync(`${dir}/${fd}`) === `socket:[${inode}]`) return true;
    } catch {
      /* fd hilang di tengah pembacaan */
    }
  }
  return false;
}

export interface RunningStack {
  stop: () => void;
}

export async function startPostgrest(): Promise<RunningStack | null> {
  const bin = POSTGREST_BIN();
  if (!fs.existsSync(bin)) {
    console.warn(`[harness] PostgREST binary not found at ${bin} — skipping`);
    return null;
  }

  // 1. Sudah jalan? Hanya boleh diadopsi kalau listener di POSTGREST_PORT memang
  // proxy MILIK RUN INI yang menembak upstream port yang kita harapkan (RX2-4
  // R3). Tabrakan PORT_BASE antar worktree (~1/1200) dulu berujung "hijau di DB
  // yang salah"; sekarang gagal keras.
  const existing = await readProxyIdentity();
  if (existing) {
    if (
      existing.runId === RUN_ID &&
      existing.listenPort === POSTGREST_PORT &&
      existing.upstreamPort === POSTGREST_UPSTREAM_PORT
    ) {
      // Milik run ini. Sehat = /rest/v1/ menjawab 200 (proxy hidup, upstream hidup).
      let healthy = false;
      try {
        healthy = (await fetch(`${POSTGREST_URL}/rest/v1/`)).status === 200;
      } catch {
        /* upstream mati / setengah mati */
      }
      if (healthy) return { stop: () => {} };
      // Proxy sisa (upstreamnya sudah mati): jangan diadopsi — matikan lalu start bersih.
      try {
        process.kill(-existing.pid, "SIGTERM");
      } catch {
        /* sudah mati */
      }
      for (let i = 0; i < 25 && (await readProxyIdentity()); i++) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } else {
      throw new Error(
        `port ${POSTGREST_PORT} sudah dipakai listener ASING — identitas yang ` +
          `diiklankan: pid=${existing.pid} runId=${JSON.stringify(existing.runId)} ` +
          `listen=${existing.listenPort} upstream=${existing.upstreamPort}; ` +
          `run ini: runId=${JSON.stringify(RUN_ID)} upstream=${POSTGREST_UPSTREAM_PORT}. ` +
          `Menolak mengadopsi — matikan pemiliknya (\`ss -ltnp | grep :${POSTGREST_PORT}\`) ` +
          `atau jalankan ulang dengan HARNESS_PORT_BASE lain. Lihat docs/w4-rx2-4-verification.txt.`
      );
    }
  }

  const upstreamConfig = tmpPath("postgrest.conf");
  const proxyScript = new URL("./prefix-proxy.mjs", import.meta.url).pathname;
  // RX2-4 follow-up B2: tulis EKSKLUSIF di direktori privat 0700 — `writeFileSync`
  // biasa mengikuti symlink yang di-pre-create orang lain di path /tmp yang
  // predictable (probe verifier: `postgrest.conf -> sentinel` tertimpa).
  writePrivateFile(
    upstreamConfig,
    [
      `db-uri = "${PG_URL}"`,
      `db-schemas = "public"`,
      `db-anon-role = "anon"`,
      `server-port = ${POSTGREST_UPSTREAM_PORT}`,
      `jwt-secret = "${JWT_SECRET}"`,
      "",
    ].join("\n")
  );

  // RX2-4 R2: apa pun yang gagal SESUDAH spawn pertama harus mematikan anak yang
  // sudah hidup (dulu: fake/rusak POSTGREST_BIN => anak yatim + proses pemanggil
  // menggantung karena pipe stderr menahan event loop).
  const children: ChildProcess[] = [];
  const stop = () => {
    for (const child of children) {
      try {
        process.kill(-(child.pid as number), "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    // Jangan cabut pipe stderr SEBELUM SIGTERM: PostgREST duduk di SIGTERM kalau
    // pembaca stderr-nya sudah dicabut lebih dulu (terbukti, §2 dokumen RX2-4).
    // Grace 1,5 s: habis itu SIGKILL yang tersisa + cabut pipe (pipe inilah yang
    // dulu menahan event loop / bikin pemanggil menggantung saat anak yatim).
    setTimeout(() => {
      for (const child of children) {
        if (child.exitCode === null && child.pid) {
          try {
            process.kill(child.pid, "SIGKILL");
          } catch {
            /* sudah mati */
          }
        }
        try {
          child.stderr?.destroy();
        } catch {
          /* sudah tutup */
        }
      }
    }, 1500).unref();
  };
  const start = (
    file: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    tag: string
  ): ChildProcess => {
    const child = spawn(file, args, {
      stdio: ["ignore", "ignore", "pipe"],
      detached: true,
      env,
    });
    child.stderr?.on("data", (d) => process.stderr.write(`[${tag}] ${d}`));
    child.unref();
    children.push(child);
    return child;
  };

  try {
    const upstream = start(bin, [upstreamConfig], process.env, "postgrest");
    await waitForHttp(`http://127.0.0.1:${POSTGREST_UPSTREAM_PORT}/`);
    // Hidup sesudah listen = bind-nya berhasil, jadi listener itu anak kita
    // (PostgREST keluar kalau portnya sudah dipakai).
    if (upstream.exitCode !== null) {
      throw new Error(
        `PostgREST anak kita mati (exit ${upstream.exitCode}) padahal ` +
          `127.0.0.1:${POSTGREST_UPSTREAM_PORT} menjawab — port itu milik proses lain.`
      );
    }
    // RX2-4 follow-up B1: "menjawab HTTP" BUKAN bukti kepemilikan (anak kita bisa
    // belum sempat exit). Buktikan lewat inode socket di /proc; kalau tidak bisa
    // dibuktikan, jangan lanjut — proxy ke listener asing = uji hijau/merah di DB
    // orang lain.
    const upstreamPid = upstream.pid as number;
    const inode = listenInode(POSTGREST_UPSTREAM_PORT);
    if (!inode || !ownsSocket(upstreamPid, inode)) {
      throw new Error(
        `127.0.0.1:${POSTGREST_UPSTREAM_PORT} menjawab HTTP tapi listener-nya BUKAN ` +
          `anak kita (pid anak=${upstreamPid}, inode LISTEN di /proc=${inode ?? "tidak ada"}) ` +
          `— port itu dipegang proses lain. Menolak mengadopsi: proxy akan meneruskan ` +
          `body proses asing. Matikan pemiliknya (\`ss -ltnp | grep :` +
          `${POSTGREST_UPSTREAM_PORT}\`) atau jalankan ulang dengan HARNESS_PORT_BASE lain. ` +
          `Lihat docs/w4-rx2-4-verification.txt §7.`
      );
    }

    const proxy = start(
      process.execPath,
      [proxyScript, String(POSTGREST_PORT), String(POSTGREST_UPSTREAM_PORT), RUN_ID],
      process.env,
      "prefix-proxy"
    );
    await waitForHttp(`${POSTGREST_URL}/rest/v1/`);
    const identity = await readProxyIdentity();
    if (
      !identity ||
      identity.pid !== proxy.pid ||
      identity.runId !== RUN_ID ||
      identity.upstreamPort !== POSTGREST_UPSTREAM_PORT
    ) {
      throw new Error(
        `proxy di ${POSTGREST_PORT} bukan proses yang kita spawn ` +
          `(identitas: ${JSON.stringify(identity)}; anak kita pid=${proxy.pid} ` +
          `runId=${JSON.stringify(RUN_ID)}) — port tabrakan.`
      );
    }
  } catch (err) {
    stop();
    throw err;
  }

  return { stop };
}

export function truncateAll(): void {
  psqlSuper(
    "TRUNCATE webhook_events_inbox, onboarding_snapshots, subscriptions, users, " +
      "promo_redemptions, promo_codes, consent_events, onboarding_progress, " +
      "checkout_claims RESTART IDENTITY CASCADE;"
  );
}

export function countRows(table: string, where = "TRUE"): number {
  const out = psqlSuper(`SELECT count(*) FROM ${table} WHERE ${where};`, { csv: true });
  return Number(out.split("\n").pop());
}

export function query<T = Record<string, unknown>>(sql: string): T[] {
  const out = psqlSuper(sql, { csv: true });
  if (!out) return [];
  return out.split("\n").map((line) => line.split("|") as unknown as T);
}