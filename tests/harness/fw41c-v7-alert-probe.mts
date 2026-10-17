/**
 * Probe V-7 (kartu t_1d1cf77f, review impl `t_9b3fc917` §V-7).
 *
 *   node --experimental-strip-types tests/harness/fw41c-v7-alert-probe.mts
 *
 * Yang dibuktikan: streak yang TIDAK bisa disimpan tidak boleh menelan alarm.
 * Sebelum perbaikan, `writeStreak` menelan error jadi console.warn, streak selalu
 * dibaca 0, `streak >= 2` tidak pernah tercapai, dan sapuan yang gagal terus
 * selamanya keluar dengan exit 0 tanpa satu pun baris `[ALERT]`.
 *
 * Rangkaian: stub HTTP lokal sebagai satu-satunya RPC yang dipanggil sapuan
 * (nominasi) + `SCALEV_CANCEL_API_KEY` sengaja TIDAK di-set ⇒ sapuan menjalankan
 * cabang "unconfigured" yang tidak bersih. STATE_DIR diarahkan ke path yang tidak
 * writable, jadi run PERTAMA harus sudah ber-alert + exit 1.
 *
 * Nol DB, nol Supabase, nol Scalev, nol staging/produksi, nol data pelanggan.
 */
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "../..");
const PORT = Number(process.env.FW41C_V7_PROBE_PORT || 4210);
const TMP_OK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fw41c-v7-"));

/**
 * STATE_DIR yang tidak bisa ditulis: direktori read-only (mode 500).
 * ⚠️ JANGAN pakai `/proc/...` untuk maksud ini: `fs.mkdirSync(p,{recursive:true})`
 * di Node 22 BUSY-LOOP 100% CPU tanpa melempar apa pun kalau induknya `/proc/<pid>`
 * (ditemukan saat menulis probe ini — proses tidak pernah keluar, tanpa output).
 */
const DENIED_DIR =
  process.env.FW41C_V7_STATE_DIR || path.join(TMP_OK_DIR, "ro", "state");
fs.mkdirSync(DENIED_DIR, { recursive: true });
fs.chmodSync(DENIED_DIR, 0o500);

let pass = 0;
const failures: string[] = [];
function check(ok: boolean, name: string, detail = "") {
  if (ok) pass++;
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const stub = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "nominated", nominated: 0, missing_id: 0 }));
  });
});
await new Promise<void>((r) => stub.listen(PORT, "127.0.0.1", () => r()));

async function runSweep(stateDir: string): Promise<{ code: number | null; out: string }> {
  const env: Record<string, string> = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    SUPABASE_URL: `http://127.0.0.1:${PORT}`,
    SUPABASE_SERVICE_KEY: "stub-key",
    THRIVIN_TENANT_ID: "thrivin",
    CANCEL_SWEEP_STATE_DIR: stateDir,
  };
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", path.join(REPO, "staging/cancel-sweep.mts")],
    { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] }
  );
  let out = "";
  child.stdout.on("data", (d) => (out += String(d)));
  child.stderr.on("data", (d) => (out += String(d)));
  const code = await new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
  return { code, out };
}

const denied = await runSweep(DENIED_DIR);
check(denied.code === 1, "STATE_DIR tidak writable ⇒ run pertama GAGAL KERAS (exit 1)", `exit=${denied.code}`);
check(
  denied.out.includes("[checkout-cancel][ALERT]") && denied.out.includes("streak TIDAK tersimpan"),
  "alarm diangkat pada run pertama (streak tak bisa dihitung ⇒ jangan tunggu 2x)",
  denied.out.split("\n").filter((l) => l.includes("ALERT")).join(" | ")
);
check(
  denied.out.includes("unconfigured=true"),
  "konteks kegagalan ikut ter-log (bukan cuma alert kosong)",
  denied.out
);

const ok = await runSweep(TMP_OK_DIR);
check(
  ok.code === 0,
  "kontrol: STATE_DIR writable ⇒ run pertama yang tidak bersih tetap exit 0 (streak=1)",
  `exit=${ok.code}`
);
check(
  !ok.out.includes("streak TIDAK tersimpan"),
  "kontrol: nol alert pada run pertama yang streak-nya bisa disimpan",
  ok.out
);

stub.close();
console.log(`\nV-7 alert probe: ${pass} PASS, ${failures.length} FAIL`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length) process.exit(1);
