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
 *
 * Detail bukti: docs/w4-rx2-4-verification.txt
 */
import fs from "fs";
import http from "http";
import path from "path";
import { spawn } from "child_process";
import {
  PORTS,
  POSTGREST_URL,
  RUN_ID,
  assertMockOwner,
  startPostgrest,
  tmpPath,
} from "./harness/stack.mts";

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
