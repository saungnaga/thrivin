/**
 * Harness hygiene checks (RX2-4 R1/R2/R3) — tanpa DB, tanpa app, tanpa PostgREST nyata.
 *
 *   node --experimental-strip-types tests/test-harness-isolation.mts
 *
 * Yang dijaga di sini (semuanya pernah lolos diam-diam sebelum RX2-4):
 *   R1  mock Scalev tanpa argumen port TIDAK boleh diam-diam pakai port bersama.
 *   R2  startPostgrest() yang gagal start tidak boleh meninggalkan anak yatim dan
 *       tidak boleh menggantung pemanggil (pipe stderr menahan event loop).
 *   R3  port PostgREST / port mock yang dipegang listener ASING harus gagal keras,
 *       bukan diadopsi (dulu: hijau/merah di DB atau file orders milik run lain).
 *   B1  (follow-up RX2-4) upstream PostgREST yang dipegang listener asing harus
 *       ditolak — "HTTP menjawab" bukan bukti kepemilikan; buktinya inode socket
 *       di /proc milik anak yang kita spawn.
 *   B2  (follow-up RX2-4) artefak /tmp: direktori privat 0700 milik uid ini, dan
 *       file (mis. postgrest.conf) dibuat eksklusif tanpa mengikuti symlink.
 *
 * Detail bukti: docs/w4-rx2-4-verification.txt §7
 */
import fs from "fs";
import http from "http";
import path from "path";
import { spawn } from "child_process";
import {
  PORTS,
  POSTGREST_URL,
  RUN_ID,
  TMP_PREFIX,
  assertMockOwner,
  startPostgrest,
  tmpPath,
} from "./harness/stack.mts";
import {
  ensurePrivateDir,
  writePrivateFile,
} from "./harness/private-fs.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const MOCK = path.join(HERE, "mock-scalev.mjs");
const STACK = path.join(HERE, "harness", "stack.mts");

let pass = 0;
const failures: string[] = [];
function check(ok: boolean, name: string, detail = "") {
  if (ok) pass++;
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const alive = (pid: number) => fs.existsSync(`/proc/${pid}`);

/** HTTP listener yang menjawab semua path — berdiri sebagai "proses asing". */
function foreignListener(port: number): Promise<http.Server> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ foreign: true, pid: process.pid }));
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}
const close = (server: http.Server) => new Promise<void>((r) => server.close(() => r()));

// ── R1: mock Scalev wajib port eksplisit ────────────────────────────────────
{
  const child = spawn(process.execPath, [MOCK], {
    env: { ...process.env, MOCK_SCALEV_PORT: "" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  const code: number | null = await new Promise((resolve) =>
    child.on("exit", (c) => resolve(c))
  );
  check(code === 2, "mock-scalev tanpa argumen ⇒ exit 2", `exit ${code}`);
  check(err.includes("usage:"), "mock-scalev tanpa argumen ⇒ usage", err.trim());
  let shared = false;
  try {
    await fetch("http://127.0.0.1:4111/v3/stores/x/products");
    shared = true;
  } catch {
    /* ECONNREFUSED = tidak ada default bersama */
  }
  check(!shared, "port bersama 4111 tidak lagi dipakai sebagai default");
}

// ── R3a: port proxy dipegang listener asing ⇒ gagal keras ───────────────────
{
  const server = await foreignListener(PORTS.postgrest);
  let message = "";
  try {
    await startPostgrest();
    message = "TIDAK melempar (mengadopsi listener asing)";
  } catch (err: any) {
    message = err.message;
  }
  check(message.includes("ASING"), "PostgREST: listener asing di port proxy ⇒ throw", message.slice(0, 160));
  check(message.includes(RUN_ID), "pesan galat menyebut identitas run ini", message.slice(0, 160));
  await close(server);
}

// ── R3b: port mock dipegang listener asing ⇒ gagal keras ────────────────────
{
  const port = PORTS.webhookMock;
  const server = await foreignListener(port);
  const child = spawn(process.execPath, [MOCK, String(port)], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  await sleep(600); // biar mock anak mati EADDRINUSE lebih dulu
  let message = "";
  try {
    await assertMockOwner(port, child.pid, 3000);
    message = "TIDAK melempar (mengadopsi mock asing)";
  } catch (err: any) {
    message = err.message;
  }
  check(message.includes("proses lain"), "mock Scalev: port dipegang proses lain ⇒ throw", message.slice(0, 160));
  check(child.exitCode !== 0, "mock anak mati (exit != 0) saat portnya direbut", `exit ${child.exitCode}`);
  try {
    child.kill("SIGKILL");
  } catch {
    /* sudah mati */
  }
  await close(server);
}

// ── R3c: identitas mock menyebut pid DAN artefak, dan assertMockOwner hijau ──
// Kontrol positif untuk R3a/R3b: kalau mock kita sendiri yang memegang port,
// pemeriksaannya harus LULUS (kalau tidak, "gagal keras" di atas cuma artefak).
{
  const port = PORTS.promoMock;
  const ordersFile = tmpPath("identity-orders.json");
  const child = spawn(process.execPath, [MOCK, String(port)], {
    env: { ...process.env, MOCK_SCALEV_ORDERS_FILE: ordersFile },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let message = "";
  try {
    await assertMockOwner(port, child.pid, 5000);
  } catch (err: any) {
    message = err.message;
  }
  check(message === "", "mock Scalev milik kita ⇒ assertMockOwner lulus", message);
  const id = await (await fetch(`http://127.0.0.1:${port}/__mock-identity`)).json();
  check(id.pid === child.pid, "identitas mock menyebut pid proses kita", JSON.stringify(id));
  check(id.ordersFile === ordersFile, "identitas mock menyebut artefak orders-nya", JSON.stringify(id));
  try {
    child.kill("SIGTERM");
  } catch {
    /* sudah mati */
  }
}

// ── B1 (RX2-4 follow-up): upstream PostgREST dipegang listener asing ────────
// Dulu `waitForHttp()` dijawab listener asing SEBELUM anak kita sempat exit
// (`upstream.exitCode` masih null) ⇒ handle tetap dikembalikan dan proxy
// meneruskan body proses asing. Sekarang kepemilikan listener dibuktikan lewat
// inode socket di /proc, jadi "HTTP menjawab" tidak lagi dianggap bukti.
{
  const fake = tmpPath("fake-upstream-postgrest.sh");
  const pidFile = tmpPath("fake-upstream.pid");
  writePrivateFile(fake, `#!/bin/bash\necho $$ > "${pidFile}"\nexec sleep 300\n`);
  fs.chmodSync(fake, 0o755);
  const server = await foreignListener(PORTS.postgrestUpstream);
  const prevBin = process.env.POSTGREST_BIN;
  const prevWait = process.env.HARNESS_HTTP_WAIT_MS;
  process.env.POSTGREST_BIN = fake;
  process.env.HARNESS_HTTP_WAIT_MS = "1500";
  let message = "";
  let adopted = false;
  let handle: { stop: () => void } | null = null;
  try {
    handle = await startPostgrest();
    adopted = handle !== null;
  } catch (err: any) {
    message = err.message;
  }
  handle?.stop();
  if (prevBin === undefined) delete process.env.POSTGREST_BIN;
  else process.env.POSTGREST_BIN = prevBin;
  if (prevWait === undefined) delete process.env.HARNESS_HTTP_WAIT_MS;
  else process.env.HARNESS_HTTP_WAIT_MS = prevWait;
  check(!adopted, "upstream dipegang listener asing ⇒ startPostgrest TIDAK mengadopsi");
  check(
    message.includes("BUKAN anak kita"),
    "pesan galat menyebut listener bukan anak kita",
    message.slice(0, 200)
  );
  await close(server);
  const fakePid = Number(fs.readFileSync(pidFile, "utf-8").trim());
  let fakeGone = false;
  for (let i = 0; i < 40 && !fakeGone; i++) {
    fakeGone = !alive(fakePid);
    if (!fakeGone) await sleep(250);
  }
  check(fakeGone, "anak postgrest palsu dimatikan (nol proses tersisa)", `pid ${fakePid}`);
  let leftover = false;
  try {
    await fetch(`http://127.0.0.1:${PORTS.postgrestUpstream}/`);
    leftover = true;
  } catch {
    /* bersih */
  }
  check(!leftover, "nol listener tersisa di port upstream sesudah probe");
}

// ── B2: config PostgREST tidak boleh ditulis lewat symlink ─────────────────
// Dulu `fs.writeFileSync(tmpPath("postgrest.conf"))` mengikuti symlink yang
// di-pre-create (probe verifier: sentinel di luar harness tertimpa).
{
  const sentinel = tmpPath("sentinel-target.txt");
  writePrivateFile(sentinel, "SENTINEL\n");
  const conf = tmpPath("postgrest.conf");
  fs.rmSync(conf, { force: true });
  fs.symlinkSync(sentinel, conf);
  const fake = tmpPath("fake-slow-postgrest.sh");
  writePrivateFile(fake, "#!/bin/bash\nexec sleep 300\n");
  fs.chmodSync(fake, 0o755);
  const prevBin = process.env.POSTGREST_BIN;
  const prevWait = process.env.HARNESS_HTTP_WAIT_MS;
  process.env.POSTGREST_BIN = fake;
  process.env.HARNESS_HTTP_WAIT_MS = "800";
  try {
    (await startPostgrest())?.stop();
  } catch {
    /* timeout: yang diuji isi file, bukan hasil start */
  }
  if (prevBin === undefined) delete process.env.POSTGREST_BIN;
  else process.env.POSTGREST_BIN = prevBin;
  if (prevWait === undefined) delete process.env.HARNESS_HTTP_WAIT_MS;
  else process.env.HARNESS_HTTP_WAIT_MS = prevWait;
  check(
    fs.readFileSync(sentinel, "utf-8") === "SENTINEL\n",
    "symlink postgrest.conf tidak menimpa targetnya"
  );
  check(
    !fs.lstatSync(conf).isSymbolicLink(),
    "postgrest.conf ditulis sebagai file biasa (link lama dibuang, bukan diikuti)"
  );
}

// ── B2: direktori artefak privat (0700, milik uid ini) ─────────────────────
{
  const st = fs.lstatSync(TMP_PREFIX);
  check(
    !st.isSymbolicLink() && st.isDirectory(),
    "TMP_PREFIX = direktori, bukan symlink",
    JSON.stringify({ symlink: st.isSymbolicLink(), dir: st.isDirectory() })
  );
  check(
    (st.mode & 0o777) === 0o700,
    "TMP_PREFIX mode 0700",
    `mode ${(st.mode & 0o777).toString(8)}`
  );
  check(st.uid === process.getuid(), "TMP_PREFIX milik uid ini", `uid ${st.uid}`);

  const loose = tmpPath("loose-dir");
  fs.mkdirSync(loose, { recursive: true, mode: 0o777 });
  fs.chmodSync(loose, 0o777);
  ensurePrivateDir(loose);
  check(
    (fs.lstatSync(loose).mode & 0o777) === 0o700,
    "dir longgar (0777) dirapatkan jadi 0700"
  );

  const link = tmpPath("dir-link");
  fs.rmSync(link, { force: true });
  fs.symlinkSync(loose, link);
  let msg = "";
  try {
    ensurePrivateDir(link);
  } catch (err: any) {
    msg = err.message;
  }
  check(msg.includes("symlink"), "dir symlink ⇒ gagal keras", msg.slice(0, 140));
}

// ── R2: gagal start ⇒ nol anak yatim, nol gantung ───────────────────────────
{
  const fake = tmpPath("fake-postgrest.sh");
  const pidFile = tmpPath("fake-postgrest.pid");
  fs.writeFileSync(fake, `#!/bin/bash\necho $$ > "${pidFile}"\nexec sleep 300\n`);
  fs.chmodSync(fake, 0o755);
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* belum ada */
  }

  // Dijalankan di proses anak: yang diperiksa adalah apakah pemanggilnya KELUAR
  // sendiri sesudah startPostgrest() gagal (dulu menggantung selamanya).
  const src = `
    const { startPostgrest } = await import(process.env.HARNESS_STACK);
    try {
      await startPostgrest();
      console.log("NO_THROW");
    } catch (err) {
      console.log("THREW " + err.message);
    }
  `;
  const runner = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", src], {
    env: {
      ...process.env,
      HARNESS_STACK: STACK,
      POSTGREST_BIN: fake,
      HARNESS_HTTP_WAIT_MS: "1200",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  runner.stdout.on("data", (d) => (out += d));
  runner.stderr.on("data", (d) => (out += d));
  const started = Date.now();
  let timer: NodeJS.Timeout;
  const timeout = new Promise<"timeout">((r) => {
    timer = setTimeout(() => r("timeout"), 20000);
  });
  const code: number | null | "timeout" = await Promise.race([
    new Promise<number | null>((r) => runner.on("exit", (c) => r(c))),
    timeout,
  ]);
  clearTimeout(timer!); // timer sisa akan menahan event loop 20 s kalau tidak dibatalkan
  const elapsed = Date.now() - started;
  if (code === "timeout") {
    try {
      runner.kill("SIGKILL");
    } catch {
      /* sudah mati */
    }
  }
  check(code !== "timeout", "startPostgrest() gagal ⇒ pemanggil keluar sendiri (tanpa gantung)", `masih hidup setelah ${elapsed}ms`);
  check(out.includes("THREW"), "startPostgrest() dengan binari mati-rasa ⇒ throw", out.trim().slice(0, 160));

  const fakePid = Number(fs.readFileSync(pidFile, "utf-8").trim());
  let gone = false;
  for (let i = 0; i < 40 && !gone; i++) {
    gone = !alive(fakePid);
    if (!gone) await sleep(250);
  }
  check(gone, "anak postgrest palsu tidak jadi yatim", `pid ${fakePid} masih hidup`);
  let listening = false;
  try {
    await fetch(`http://127.0.0.1:${PORTS.postgrestUpstream}/`);
    listening = true;
  } catch {
    /* bersih */
  }
  check(!listening, "nol listener tersisa di port upstream");
  try {
    process.kill(fakePid, "SIGKILL");
  } catch {
    /* sudah mati */
  }
}

// ── Ringkasan ───────────────────────────────────────────────────────────────
console.log(`\nharness isolation: ${pass} PASS, ${failures.length} FAIL`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length) process.exit(1);
console.log("OK");
