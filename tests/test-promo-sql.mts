/**
 * Promo quota/expiry/race tests at the DATABASE layer.
 *
 *   node --experimental-strip-types tests/test-promo-sql.mts
 *
 * Kenapa di layer SQL: klaim kuota HARUS atomik. Test ini menembakkan redeem
 * paralel ke Postgres lokal lewat koneksi psql terpisah (benar-benar bersamaan),
 * bukan lewat satu proses Node yang men-serialisasi promise.
 *
 * Tidak menyentuh staging/produksi — DB throwaway + data dummy.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");
const DB = process.env.HARNESS_PROMO_DB || "thrivin_promo_test";
const PROMO_SCHEMA = path.join(REPO, "staging", "schema-promo-codes.sql");

const results: Array<[string, string]> = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (err: any) {
    results.push(["FAIL", `${name} — ${err?.message ?? err}`]);
  }
}

function pgSuper(args: string[], input?: string): string {
  return execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", DB, ...args], {
    encoding: "utf-8",
    input,
  }).trim();
}

function sql(query: string): string {
  return pgSuper(["-At", "-F", "|", "-c", query]);
}

/** One psql per call => one real connection => real concurrency. */
function redeemParallel(args: {
  code: string;
  phone: string;
  plan: string;
  revenue: number;
  dryRun?: boolean;
}): Promise<string> {
  const fn = `SELECT status FROM redeem_promo('${args.code}','${args.phone}','${args.plan}',${args.revenue},${
    args.dryRun ? "true" : "false"
  },NULL,'thrivin');`;
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", [
      "-u",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-d",
      DB,
      "-c",
      fn,
    ]);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err || `psql exit ${code}`));
      else resolve(out.trim());
    });
  });
}

function createDatabase() {
  // Drop + recreate every run: the seed assertions below check the STATE A
  // migrated database starts in, and a leftover DB from a previous run would
  // (correctly) no longer contain the seeded codes.
  execFileSync("sudo", [
    "-u",
    "postgres",
    "psql",
    "-q",
    "-c",
    `DROP DATABASE IF EXISTS ${DB} WITH (FORCE);`,
  ]);
  execFileSync("sudo", ["-u", "postgres", "psql", "-q", "-c", `CREATE DATABASE ${DB} OWNER postgres;`]);
  // postgres cannot traverse /home/ubuntu -> stream the file over stdin.
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", DB, "-q", "-f", "-"],
    { input: fs.readFileSync(PROMO_SCHEMA), stdio: ["pipe", "pipe", "inherit"] }
  );
}

/** Seed a fresh, quota-controlled promo and return its code. */
let seedCounter = 0;
function seedPromo(opts: {
  quota: number | null;
  expiresAt?: string | null;
  active?: boolean;
  type?: string;
  amount?: number;
  planKeys?: string[];
}): string {
  const code = `RACETEST${++seedCounter}${Date.now().toString(36).toUpperCase()}`;
  const quota = opts.quota === null ? "NULL" : String(opts.quota);
  const expires = opts.expiresAt ? `'${opts.expiresAt}'` : "NULL";
  const active = opts.active === false ? "false" : "true";
  const planKeys = opts.planKeys ? `ARRAY[${opts.planKeys.map((p) => `'${p}'`).join(",")}]` : "'{}'";
  sql(
    `INSERT INTO promo_codes (code, discount_type, amount, plan_keys, max_redemptions, expires_at, is_active, created_by) ` +
      `VALUES ('${code}','${opts.type ?? "percentage"}',${opts.amount ?? 20},${planKeys},${quota},${expires},${active},'test')`
  );
  return code;
}

async function main() {
  createDatabase();

  // ── 0. Seed migration bikin kode lama tetap jalan ────────────────────────
  // Dicek SEBELUM truncate: seed-nya bagian dari migrasi, jadi harus ada di DB
  // yang baru dimigrasikan.
  check("seed: TEMANBARU + TEMANBAIKHATI ada setelah migrasi", () => {
    assert.equal(sql("SELECT count(*) FROM promo_codes WHERE code IN ('TEMANBARU','TEMANBAIKHATI')"), "2");
  });
  check("seed: TEMANBARU = 20% paket >1 bulan, tanpa kuota", () => {
    const row = sql("SELECT discount_type, amount, plan_keys, max_redemptions FROM promo_codes WHERE code='TEMANBARU'");
    assert.equal(row, "percentage|20.00|{quarter,half,year}|");
  });
  check("seed: TEMANBAIKHATI = harga jadi Rp10.000 di paket quarter", () => {
    assert.equal(
      sql("SELECT discount_type, amount, plan_keys FROM promo_codes WHERE code='TEMANBAIKHATI'"),
      "flat_price|10000.00|{quarter}"
    );
  });

  sql("TRUNCATE promo_redemptions, promo_codes CASCADE;");

  // ── 1. Jalur sukses ──────────────────────────────────────────────────────
  check("redeem: percentage 20% -> harga jadi 184800 dari 231000", () => {
    const code = seedPromo({ quota: 5 });
    assert.equal(sql(`SELECT status||'|'||discount||'|'||final_price FROM redeem_promo('${code}','628111000001','quarter',231000,false,NULL,'thrivin')`),
      "ok|46200.00|184800.00");
  });
  check("redeem: flat_price 10000 -> 231000 jadi 10000", () => {
    const code = seedPromo({ quota: 5, type: "flat_price", amount: 10000 });
    assert.equal(sql(`SELECT status||'|'||final_price FROM redeem_promo('${code}','628111000002','quarter',231000,false,NULL,'thrivin')`),
      "ok|10000.00");
  });
  check("redeem: fixed 25000 -> potongan tidak melebihi harga", () => {
    const code = seedPromo({ quota: 5, type: "fixed", amount: 25000 });
    assert.equal(sql(`SELECT status||'|'||final_price FROM redeem_promo('${code}','628111000003','quarter',231000,false,NULL,'thrivin')`),
      "ok|206000.00");
    const small = seedPromo({ quota: 5, type: "fixed", amount: 999999 });
    assert.equal(sql(`SELECT status||'|'||final_price FROM redeem_promo('${small}','628111000004','month',99000,false,NULL,'thrivin')`),
      "ok|0.00");
  });
  check("redeem: dry_run valid TIDAK memakai kuota", () => {
    const code = seedPromo({ quota: 1 });
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000005','quarter',231000,true,NULL,'thrivin')`), "ok");
    assert.equal(sql(`SELECT count(*) FROM promo_redemptions r JOIN promo_codes p ON p.id=r.promo_id WHERE p.code='${code}'`), "0");
    assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "0/1");
  });

  // ── 2. Penolakan ─────────────────────────────────────────────────────────
  check("redeem: kode tidak dikenal -> unknown_code", () => {
    assert.equal(sql("SELECT status FROM redeem_promo('NOPE99','628111000006','quarter',231000,false,NULL,'thrivin')"), "unknown_code");
  });
  check("redeem: non-aktif -> inactive", () => {
    const code = seedPromo({ quota: 5, active: false });
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000007','quarter',231000,false,NULL,'thrivin')`), "inactive");
  });
  check("redeem: kedaluwarsa -> expired (bukan diam-diam harga penuh)", () => {
    const code = seedPromo({ quota: 5, expiresAt: new Date(Date.now() - 3600_000).toISOString() });
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000008','quarter',231000,false,NULL,'thrivin')`), "expired");
  });
  check("redeem: belum kedaluwarsa -> ok", () => {
    const code = seedPromo({ quota: 5, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000009','quarter',231000,true,NULL,'thrivin')`), "ok");
  });
  check("redeem: paket tidak termasuk plan_keys -> plan_not_eligible", () => {
    const code = seedPromo({ quota: 5, planKeys: ["quarter"] });
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000010','month',99000,false,NULL,'thrivin')`), "plan_not_eligible");
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000010','quarter',231000,true,NULL,'thrivin')`), "ok");
  });

  // ── 3. Kuota global habis ────────────────────────────────────────────────
  check("kuota: habis setelah dipakai, sisa 0 di view dashboard", () => {
    const code = seedPromo({ quota: 2 });
    sql(`SELECT redeem_promo('${code}','628111000011','quarter',231000,false,NULL,'thrivin')`);
    assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "1/1");
    sql(`SELECT redeem_promo('${code}','628111000012','quarter',231000,false,NULL,'thrivin')`);
    assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "2/0");
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000013','quarter',231000,false,NULL,'thrivin')`), "exhausted");
  });
  check("kuota: released tidak dihitung (refund mengembalikan slot)", () => {
    const code = seedPromo({ quota: 1 });
    sql(`SELECT redeem_promo('${code}','628111000014','quarter',231000,false,NULL,'thrivin')`);
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000015','quarter',231000,false,NULL,'thrivin')`), "exhausted");
    sql(
      `SELECT release_promo(id) FROM promo_redemptions WHERE phone='628111000014' AND promo_id=(SELECT id FROM promo_codes WHERE code='${code}')`
    );
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000015','quarter',231000,false,NULL,'thrivin')`), "ok");
  });
  check("kuota: NULL = tanpa kuota, redeem tetap jalan", () => {
    const code = seedPromo({ quota: null });
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000016','quarter',231000,false,NULL,'thrivin')`), "ok");
    assert.equal(sql(`SELECT remaining IS NULL FROM v_promo_codes WHERE code='${code}'`), "t");
  });

  // ── 4. 1x per nomor ──────────────────────────────────────────────────────
  check("per-nomor: setelah consumed, nomor yang sama ditolak", () => {
    const code = seedPromo({ quota: 10 });
    sql(`SELECT redeem_promo('${code}','628111000017','quarter',231000,false,NULL,'thrivin')`);
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000017','quarter',231000,true,NULL,'thrivin')`), "ok");
    sql(
      `UPDATE promo_redemptions SET status='consumed', consumed_at=now() WHERE phone='628111000017' AND promo_id=(SELECT id FROM promo_codes WHERE code='${code}')`
    );
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000017','quarter',231000,false,NULL,'thrivin')`), "already_used");
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000018','quarter',231000,false,NULL,'thrivin')`), "ok");
  });
  check("per-nomor: nomor kedua masih dapat kuota (bukan per-nomor global)", () => {
    const code = seedPromo({ quota: 10 });
    sql(`SELECT redeem_promo('${code}','628111000019','quarter',231000,false,NULL,'thrivin')`);
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000020','quarter',231000,false,NULL,'thrivin')`), "ok");
  });
  check("per-nomor: retry sebelum bayar melepas reservasi lama, tidak dobel kuota", () => {
    const code = seedPromo({ quota: 10 });
    sql(`SELECT redeem_promo('${code}','628111000021','quarter',231000,false,NULL,'thrivin')`);
    sql(`SELECT redeem_promo('${code}','628111000021','quarter',231000,false,NULL,'thrivin')`);
    assert.equal(
      sql(`SELECT count(*) FROM promo_redemptions r JOIN promo_codes p ON p.id=r.promo_id WHERE p.code='${code}' AND r.status<>'released'`),
      "1"
    );
    assert.equal(sql(`SELECT used_count FROM v_promo_codes WHERE code='${code}'`), "1");
  });

  // ── 5. RACE ──────────────────────────────────────────────────────────────
  console.log("\n── RACE: kuota sisa 1, dua checkout paralel ──");
  {
    const code = seedPromo({ quota: 1 });
    const [a, b] = await Promise.all([
      redeemParallel({ code, phone: "628111000030", plan: "quarter", revenue: 231000 }),
      redeemParallel({ code, phone: "628111000031", plan: "quarter", revenue: 231000 }),
    ]);
    const tally = [a, b].filter((s) => s === "ok").length;
    console.log(`   redeem_promo x2 → ${JSON.stringify([a, b])}`);
    check("RACE: tepat satu dari dua klaim paralel lolos", () => {
      assert.equal(tally, 1, `expected exactly 1 ok, got ${tally} (${a}, ${b})`);
    });
    check("RACE: ledger punya tepat 1 baris non-released", () => {
      assert.equal(
        sql(`SELECT count(*) FROM promo_redemptions r JOIN promo_codes p ON p.id=r.promo_id WHERE p.code='${code}' AND r.status<>'released'`),
        "1"
      );
    });
    check("RACE: view dashboard konsisten (used=1, remaining=0)", () => {
      assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "1/0");
    });
  }

  console.log("\n── RACE: 10 paralel, kuota 3, nomor berbeda ──");
  {
    const code = seedPromo({ quota: 3 });
    const statuses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        redeemParallel({ code, phone: `62811110003${i}`, plan: "quarter", revenue: 231000 })
      )
    );
    const okCount = statuses.filter((s) => s === "ok").length;
    const exhausted = statuses.filter((s) => s === "exhausted").length;
    console.log(`   redeem_promo x10 → ok=${okCount} exhausted=${exhausted}`);
    check("RACE: 10 paralel kuota 3 -> tepat 3 lolos", () => {
      assert.equal(okCount, 3, `statuses=${JSON.stringify(statuses)}`);
      assert.equal(exhausted, 7, `statuses=${JSON.stringify(statuses)}`);
    });
  }

  console.log("\n── RACE: 10 paralel, nomor SAMA, kuota 10 ──");
  {
    const code = seedPromo({ quota: 10 });
    const statuses = await Promise.all(
      Array.from({ length: 10 }, () =>
        redeemParallel({ code, phone: "628111000040", plan: "quarter", revenue: 231000 })
      )
    );
    const okCount = statuses.filter((s) => s === "ok").length;
    console.log(`   redeem_promo x10 same phone → ok=${okCount}`);
    check("RACE: nomor sama 10 paralel -> tidak ada reservasi dobel", () => {
      assert.equal(
        sql(`SELECT count(*) FROM promo_redemptions r JOIN promo_codes p ON p.id=r.promo_id WHERE p.code='${code}' AND r.status<>'released'`),
        "1",
        `okCount=${okCount} statuses=${JSON.stringify(statuses)}`
      );
    });
  }

  // ── 6. Reservasi basi ────────────────────────────────────────────────────
  check("stale: reservasi >24 jam dilepas, kuota kembali", () => {
    const code = seedPromo({ quota: 1 });
    sql(`SELECT redeem_promo('${code}','628111000050','quarter',231000,false,NULL,'thrivin')`);
    sql(
      `UPDATE promo_redemptions SET created_at = now() - interval '25 hours' WHERE promo_id=(SELECT id FROM promo_codes WHERE code='${code}')`
    );
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000051','quarter',231000,false,NULL,'thrivin')`), "exhausted");
    const released = sql("SELECT release_stale_promo_reservations(24)");
    assert.equal(released, "1");
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000051','quarter',231000,false,NULL,'thrivin')`), "ok");
  });

  // ── report ───────────────────────────────────────────────────────────────
  console.log("\n==============================================================");
  let failed = 0;
  for (const [status, name] of results) {
    console.log(`${status}  ${name}`);
    if (status === "FAIL") failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} promo SQL checks passed`);
  if (failed) process.exit(1);
  console.log("ALL PROMO SQL CHECKS PASSED");
}

main().catch((err) => {
  console.error("promo SQL test harness error:", err);
  process.exit(1);
});
