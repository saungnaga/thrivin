/**
 * F-W4-1c — sweep cancel order basi (H-3: lazy di checkout + sweep tiap 30 menit).
 *
 *   node --experimental-strip-types staging/cancel-sweep.mts
 *
 * Kenapa perlu: retire bersifat LAZY — hanya terjadi saat pelanggan checkout lagi.
 * Order terlantar tanpa kunjungan ulang menyimpan link bayar hidup, jadi harus
 * ada sapuan terjadwal. Sweep memakai WORKER + STATE TRANSITION yang sama dengan
 * jalur checkout (`cancelStaleOrders`) supaya tidak ada dua semantik cancel.
 *
 * Instalasi (crontab OPS, user `ubuntu`, host yang menjalankan web Thrivin) — pg_cron
 * ABSENT di staging, jadi jangan bergantung extension itu. Contoh entri di bawah
 * WAJIB diverifikasi di host tujuan SEBELUM dipasang (repo, node, file env, dan
 * direktori log harus benar-benar ada): `crontab -l` di box kantor = "no crontab
 * for ubuntu", jadi entri ini belum terpasang di mana pun.
 *
 *   # crontab user `ubuntu` (0,30 = tiap 30 menit; hindari literal slash-bintang
 *   # di komentar ini karena menutup blok komentar):
 *   0,30 * * * * cd /home/ubuntu/thrivin-web && set -a && . /home/ubuntu/.hermes/secrets/thrivin-cancel.env && set +a && \
 *     /usr/bin/node --experimental-strip-types staging/cancel-sweep.mts \
 *     >> /home/ubuntu/logs/cancel-sweep.log 2>&1
 *
 * Alert: baris `[checkout-cancel][ALERT]` + exit 1 setelah DUA kegagalan beruntun
 * (streak disimpan di STATE_DIR). Kalau STATE_DIR tidak writable, sweep langsung
 * ber-alert pada run pertama yang tidak bersih — streak yang tidak bisa ditulis
 * tidak boleh membuat alarm mati diam-diam (V-7). Nol PII: hanya id/status/jumlah.
 */
import fs from "fs";
import path from "path";
import { cancelStaleOrders } from "../src/lib/checkout-cancel.ts";
import { nominateStaleCancels } from "../src/lib/checkout-gate.ts";

const STATE_DIR = process.env.CANCEL_SWEEP_STATE_DIR || "/var/lib/thrivin";
const STREAK_FILE = path.join(STATE_DIR, "cancel-sweep-streak");

function readStreak(): number {
  try {
    return Number(fs.readFileSync(STREAK_FILE, "utf-8").trim()) || 0;
  } catch {
    return 0;
  }
}

function writeStreak(value: number): boolean {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STREAK_FILE, String(value));
    return true;
  } catch (err) {
    console.warn("[checkout-cancel] streak tidak bisa disimpan:", (err as Error).name);
    return false;
  }
}

async function main(): Promise<number> {
  // V-1: sapuan harus MENEMUKAN order terlantar, bukan cuma mengulang baris yang
  // sudah masuk antrean. Retire di jalur checkout bersifat lazy (hanya kalau
  // pelanggan checkout lagi), jadi nominasi tenant-wide dijalankan lebih dulu.
  const nom = await nominateStaleCancels();
  console.log(
    `[checkout-cancel] sweep nominasi: nominated=${nom.nominated} missing_id=${nom.missingId}`
  );

  const run = await cancelStaleOrders({});
  console.log(
    `[checkout-cancel] sweep: attempted=${run.attempted} retired=${run.retired} pending=${run.pending} failed=${run.failed} latePayment=${run.latePayment} circuitOpen=${run.circuitOpen} unconfigured=${run.unconfigured}`
  );

  const healthy = run.pending === 0 && run.failed === 0 && !run.circuitOpen && !run.unconfigured;
  if (healthy) {
    if (readStreak() !== 0) writeStreak(0);
    return 0;
  }

  const streak = readStreak() + 1;
  const persisted = writeStreak(streak);
  if (streak >= 2 || !persisted) {
    console.error(
      `[checkout-cancel][ALERT] sweep gagal ${streak}x berturut-turut (pending=${run.pending} failed=${run.failed} circuitOpen=${run.circuitOpen} unconfigured=${run.unconfigured}${persisted ? "" : " · streak TIDAK tersimpan"}) — butuh cek ops`
    );
    return 1;
  }
  console.warn(`[checkout-cancel] sweep belum bersih (streak=${streak}) — ulangi 30 menit lagi`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const streak = readStreak() + 1;
    writeStreak(streak);
    console.error(
      `[checkout-cancel][ALERT] sweep error (streak=${streak}): ${(err as Error).name}: ${(err as Error).message}`
    );
    process.exit(1);
  });
