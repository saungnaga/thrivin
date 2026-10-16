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
 * Instalasi (crontab OPS, user `ubuntu`, host thrive-prod) — pg_cron ABSENT di
 * staging, jadi jangan bergantung extension itu:
 *
 *   # crontab user `ubuntu` (0,30 = tiap 30 menit; hindari literal slash-bintang
 *   # di komentar ini karena menutup blok komentar):
 *   0,30 * * * * cd /home/ubuntu/thrivin-web && env $(cat /home/ubuntu/.hermes/secrets/thrivin-cancel.env | xargs) \
 *     /usr/bin/node --experimental-strip-types staging/cancel-sweep.mts \
 *     >> /home/ubuntu/logs/cancel-sweep.log 2>&1
 *
 * Alert: baris `[checkout-cancel][ALERT]` + exit 1 setelah DUA kegagalan beruntun
 * (streak disimpan di STATE_DIR). Nol PII: hanya id/status/jumlah.
 */
import fs from "fs";
import path from "path";
import { cancelStaleOrders } from "../src/lib/checkout-cancel.ts";

const STATE_DIR = process.env.CANCEL_SWEEP_STATE_DIR || "/var/lib/thrivin";
const STREAK_FILE = path.join(STATE_DIR, "cancel-sweep-streak");

function readStreak(): number {
  try {
    return Number(fs.readFileSync(STREAK_FILE, "utf-8").trim()) || 0;
  } catch {
    return 0;
  }
}

function writeStreak(value: number): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STREAK_FILE, String(value));
  } catch (err) {
    console.warn("[checkout-cancel] streak tidak bisa disimpan:", (err as Error).name);
  }
}

async function main(): Promise<number> {
  const run = await cancelStaleOrders({});
  console.log(
    `[checkout-cancel] sweep: attempted=${run.attempted} retired=${run.retired} pending=${run.pending} failed=${run.failed} circuitOpen=${run.circuitOpen} unconfigured=${run.unconfigured}`
  );

  const healthy = run.pending === 0 && run.failed === 0 && !run.circuitOpen && !run.unconfigured;
  if (healthy) {
    if (readStreak() !== 0) writeStreak(0);
    return 0;
  }

  const streak = readStreak() + 1;
  writeStreak(streak);
  if (streak >= 2) {
    console.error(
      `[checkout-cancel][ALERT] sweep gagal ${streak}x berturut-turut (pending=${run.pending} failed=${run.failed} circuitOpen=${run.circuitOpen} unconfigured=${run.unconfigured}) — butuh cek ops`
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
