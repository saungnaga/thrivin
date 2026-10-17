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
// Nama DB per-worktree (RX2-2): dua worktree bisa jalan bersamaan.
import { PROMO_DB as DB } from "./harness/isolate.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");
/**
 * Skema yang diuji. Bisa diarahkan ke file lain lewat `PROMO_SCHEMA_PATH` —
 * dipakai untuk UJI KEBALIKAN: jalankan suite ini terhadap skema PRA-FIX
 * (`git show e6dff09:staging/schema-promo-codes.sql`) dan suite ini HARUS gagal,
 * khususnya blok "V-1 r2" (5 checkout paralel satu nomor). Kalau tidak gagal,
 * test-nya tidak menangkap bug.
 */
const PROMO_SCHEMA = process.env.PROMO_SCHEMA_PATH
  ? path.resolve(process.env.PROMO_SCHEMA_PATH)
  : path.join(REPO, "staging", "schema-promo-codes.sql");

/**
 * Supabase's default privileges for new objects in schema `public`, replicated
 * so the draft is judged against the environment it will actually run in
 * (review-promo-2026-10-14, V-2: "tidak saya grant" != "tidak bisa diakses").
 */
const SUPABASE_DEFAULT_PRIVS = `
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`;

const REDEEM_SIGNATURE = "redeem_promo(text,varchar,text,numeric,boolean,text,varchar)";

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
  // Supabase grants anon/authenticated ALL on NEW objects in schema public.
  // Replicated here BEFORE the promo schema runs, so the V-2 "view does not leak
  // to anon" checks are real: without the draft's REVOKE they FAIL.
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-q", "-d", DB, "-c", SUPABASE_DEFAULT_PRIVS]
  );
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
  console.log(`db=${DB} schema=${PROMO_SCHEMA}`);
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
    // Dry-run (tombol "Terapkan") juga menolak selama klaim masih hidup: tidak
    // ada harga kedua yang ditawarkan untuk klaim yang sama.
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000017','quarter',231000,true,NULL,'thrivin')`), "pending_order");
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
  check("per-nomor: klaim kedua DITOLAK (pending_order), tidak dobel kuota", () => {
    const code = seedPromo({ quota: 10 });
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000021','quarter',231000,false,NULL,'thrivin')`), "ok");
    // V-1 ronde 2: dulu klaim kedua memakai ULANG baris yang sama dan tetap
    // 'ok' — itu pintu masuk serangan paralel. Sekarang klaim hidup = penolakan.
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000021','quarter',231000,false,NULL,'thrivin')`), "pending_order");
    assert.equal(
      sql(`SELECT count(*) FROM promo_redemptions r JOIN promo_codes p ON p.id=r.promo_id WHERE p.code='${code}' AND r.status<>'released'`),
      "1"
    );
    assert.equal(sql(`SELECT used_count FROM v_promo_codes WHERE code='${code}'`), "1");
  });

  // ── 4b. V-1 (remediasi): checkout BERURUTAN dari satu nomor ───────────────
  // Sebelum fix: tiap checkout melepas reservasi lama (termasuk yang SUDAH punya
  // order_ref) lalu INSERT baris baru -> satu nomor cuma pernah menempati satu
  // slot -> order berdiskon tak terbatas, dan order yang dibayar tidak pernah
  // jadi 'consumed'. Kuota 2 + 1 nomor = 6x 'ok' berurutan (bukti Sentinel).
  console.log("\n── V-1: kuota=2, satu nomor, 3 checkout BERURUTAN ──");
  {
    const code = seedPromo({ quota: 2 });
    const phone = "628119000001";
    const promoId = `(SELECT id FROM promo_codes WHERE code='${code}')`;
    const redeem = (dry = false) =>
      sql(`SELECT status FROM redeem_promo('${code}','${phone}','quarter',231000,${dry},NULL,'thrivin')`);
    // Checkout yang lolos langsung mencetak order di Scalev -> order_ref terpasang
    // (persis yang dilakukan route setelah Scalev membalas).
    const attach = (n: number) =>
      sql(
        `UPDATE promo_redemptions SET order_ref='ORD_${n}' WHERE phone='${phone}' AND promo_id=${promoId} AND status='reserved'`
      );

    const c1 = redeem();
    attach(1);
    const c2dry = redeem(true); // tombol "Terapkan" pada checkout kedua
    const c2 = redeem();
    const c3 = redeem();
    console.log(`   checkout #1=${c1}  #2(dry)=${c2dry}  #2=${c2}  #3=${c3}`);
    check("V-1: hanya checkout PERTAMA yang mencetak order (kuota=2, 1 nomor)", () => {
      assert.equal(c1, "ok");
      assert.equal(c2dry, "pending_order");
      assert.equal(c2, "pending_order");
      assert.equal(c3, "pending_order");
    });
    check("V-1: satu nomor = satu baris ledger, satu order_ref, used_count tidak dilepas", () => {
      assert.equal(sql(`SELECT count(*) FROM promo_redemptions WHERE promo_id=${promoId}`), "1");
      assert.equal(sql(`SELECT count(order_ref) FROM promo_redemptions WHERE promo_id=${promoId}`), "1");
      assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "1/1");
    });
    check("V-1: release_promo TIDAK melepas reservasi yang sudah punya order_ref", () => {
      // Dicek SELAGI masih 'reserved' (bukan sesudah consumed) supaya yang diuji
      // benar-benar guard order_ref, bukan guard status.
      const rid = sql(`SELECT id FROM promo_redemptions WHERE promo_id=${promoId}`);
      assert.equal(sql(`SELECT release_promo('${rid}')`), "f");
      assert.equal(sql(`SELECT status FROM promo_redemptions WHERE promo_id=${promoId}`), "reserved");
      assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "1/1");
    });
    check("V-1: order yang dibayar tercatat 'consumed' (audit trail utuh)", () => {
      assert.equal(sql("SELECT consume_promo_for_order('ORD_1')"), "1");
      assert.equal(sql(`SELECT status FROM promo_redemptions WHERE promo_id=${promoId}`), "consumed");
    });
    check("V-1: nomor yang sudah dibayar ditolak (already_used), bukan dapat order baru", () => {
      assert.equal(redeem(), "already_used");
      assert.equal(redeem(true), "already_used");
    });
  }

  console.log("\n── V-1: kuota=2, dua nomor, masing-masing 2 checkout berurutan ──");
  {
    const code = seedPromo({ quota: 2 });
    const promoId = `(SELECT id FROM promo_codes WHERE code='${code}')`;
    const redeem = (phone: string) =>
      sql(`SELECT status FROM redeem_promo('${code}','${phone}','quarter',231000,false,NULL,'thrivin')`);
    const attach = (phone: string, ref: string) =>
      sql(
        `UPDATE promo_redemptions SET order_ref='${ref}' WHERE phone='${phone}' AND promo_id=${promoId} AND status='reserved'`
      );

    const a1 = redeem("628119000011");
    attach("628119000011", "ORD_A");
    const a2 = redeem("628119000011");
    const b1 = redeem("628119000012");
    attach("628119000012", "ORD_B");
    const b2 = redeem("628119000012");
    const c1 = redeem("628119000013");
    console.log(`   A#1=${a1} A#2=${a2}  B#1=${b1} B#2=${b2}  C#1=${c1}`);
    check("V-1: tepat 2 order lolos, nomor ketiga exhausted", () => {
      assert.equal([a1, a2].join("/"), "ok/pending_order");
      assert.equal([b1, b2].join("/"), "ok/pending_order");
      assert.equal(c1, "exhausted");
    });
    check("V-1: kuota tercetak penuh (2/0) dan 2 order_ref berbeda di ledger", () => {
      assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "2/0");
      assert.equal(sql(`SELECT count(*) FROM promo_redemptions WHERE promo_id=${promoId}`), "2");
      assert.equal(sql(`SELECT count(*) FROM promo_redemptions WHERE promo_id=${promoId} AND order_ref IS NOT NULL`), "2");
    });
  }

  // ── 4b-2. V-1 ronde 2: checkout PARALEL satu nomor (regresi VETO ronde 2) ─
  // Jalur yang TIDAK diuji suite ronde 1 dan dipakai Sentinel untuk VETO ronde 2:
  // N checkout paralel dari nomor yang sama, semuanya tiba di window antara
  // redeem_promo (baris 'reserved' tanpa order_ref) dan attachPromoOrder.
  // Pra-fix: semuanya dapat 'ok' (pakai ulang baris yang sama) -> N order Scalev
  // tercetak dari kuota 2 (terukur 2/2/4/5 order berbayar, ledger 1 baris).
  console.log("\n── V-1 r2: kuota=2, satu nomor, 5 checkout PARALEL ──");
  {
    const code = seedPromo({ quota: 2 });
    const phone = "628119100001";
    const promoId = `(SELECT id FROM promo_codes WHERE code='${code}')`;
    const statuses = await Promise.all(
      Array.from({ length: 5 }, () =>
        redeemParallel({ code, phone, plan: "quarter", revenue: 231000 })
      )
    );
    const okCount = statuses.filter((s) => s === "ok").length;
    const pending = statuses.filter((s) => s === "pending_order").length;
    console.log(`   redeem_promo x5 paralel → ok=${okCount} pending=${pending} ${JSON.stringify(statuses)}`);
    check("V-1 r2: 5 klaim PARALEL satu nomor -> tepat 1 'ok' (1 order saja)", () => {
      assert.equal(okCount, 1, `statuses=${JSON.stringify(statuses)}`);
    });
    check("V-1 r2: 4 sisanya 'pending_order' (bukan 'exhausted' — bukan kuota yang menahan)", () => {
      assert.equal(pending, 4, `statuses=${JSON.stringify(statuses)}`);
    });
    check("V-1 r2: ledger 1 baris, kuota 1/1 — tidak ada pemakaian hantu", () => {
      assert.equal(sql(`SELECT count(*) FROM promo_redemptions WHERE promo_id=${promoId}`), "1");
      assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "1/1");
    });
  }

  console.log("\n── V-1 r2: kuota=2, DUA nomor, masing-masing 4 checkout PARALEL ──");
  {
    const code = seedPromo({ quota: 2 });
    const promoId = `(SELECT id FROM promo_codes WHERE code='${code}')`;
    const perPhone = (phone: string) =>
      Promise.all(
        Array.from({ length: 4 }, () =>
          redeemParallel({ code, phone, plan: "quarter", revenue: 231000 })
        )
      );
    const [a, b] = await Promise.all([perPhone("628119100011"), perPhone("628119100012")]);
    const aOk = a.filter((s) => s === "ok").length;
    const bOk = b.filter((s) => s === "ok").length;
    console.log(`   A: ok=${aOk}/4  B: ok=${bOk}/4  total ledger=${sql(`SELECT count(*) FROM promo_redemptions WHERE promo_id=${promoId}`)}`);
    check("V-1 r2: tiap nomor tepat 1 klaim, kuota terpakai 2/2", () => {
      assert.equal(aOk, 1, `A=${JSON.stringify(a)}`);
      assert.equal(bOk, 1, `B=${JSON.stringify(b)}`);
      assert.equal(sql(`SELECT count(DISTINCT phone) FROM promo_redemptions WHERE promo_id=${promoId}`), "2");
      assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "2/0");
    });
  }

  // ── 4c. V-2 / C-5: objek turunan & RPC tidak boleh terbuka untuk anon ─────
  console.log("\n── V-2: view & RPC promo vs klien anon ──");
  check("V-2: v_promo_codes jalan sebagai invoker (bukan pemilik view)", () => {
    assert.equal(
      sql("SELECT reloptions::text FROM pg_class WHERE relname='v_promo_codes'"),
      "{security_invoker=on}"
    );
  });
  check("V-2: anon & authenticated TIDAK punya SELECT pada v_promo_codes", () => {
    // Default privilege Supabase sudah dipasang di createDatabase(), jadi hasil
    // ini hanya bisa 'f' karena REVOKE di draft — bukan karena kebetulan.
    assert.equal(sql("SELECT has_table_privilege('anon','public.v_promo_codes','SELECT')"), "f");
    assert.equal(sql("SELECT has_table_privilege('authenticated','public.v_promo_codes','SELECT')"), "f");
  });
  check("V-2: service_role tetap bisa membaca v_promo_codes", () => {
    assert.equal(sql("SELECT has_table_privilege('service_role','public.v_promo_codes','SELECT')"), "t");
  });
  check("C-5: anon & PUBLIC tidak punya EXECUTE pada RPC promo", () => {
    for (const fn of [
      REDEEM_SIGNATURE,
      "consume_promo_for_order(text,varchar)",
      "release_promo(uuid,varchar)",
      "release_stale_promo_reservations(integer,varchar)",
      "cancel_promo_redemption(uuid,varchar)",
      "flag_promo_reconcile(uuid,varchar)",
    ]) {
      assert.equal(
        sql(`SELECT has_function_privilege('anon','public.${fn}','EXECUTE')`),
        "f",
        `${fn} masih EXECUTE untuk anon`
      );
    }
  });
  check("C-5: service_role tetap bisa memanggil RPC promo", () => {
    assert.equal(sql(`SELECT has_function_privilege('service_role','public.${REDEEM_SIGNATURE}','EXECUTE')`), "t");
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
    check("RACE: nomor sama 10 paralel -> tepat 1 'ok', tidak ada reservasi dobel", () => {
      assert.equal(okCount, 1, `okCount=${okCount} statuses=${JSON.stringify(statuses)}`);
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

  // ── 6b. C-4: sweep TIDAK melepas reservasi yang ordernya masih hidup ─────
  // Sentimen Sentinel ronde 2: dulu sweep melepas reservasi ber-order_ref juga,
  // jadi order lama tetap bisa dibayar sementara kursinya sudah kembali ke
  // katalog -> satu nomor bisa membayar DUA order promo.
  console.log("\n── C-4: sweep vs reservasi yang sudah terikat order ──");
  check("C-4: reservasi BER-order_ref yang basi TIDAK dilepas sweep", () => {
    const code = seedPromo({ quota: 1 });
    const promoId = `(SELECT id FROM promo_codes WHERE code='${code}')`;
    sql(`SELECT redeem_promo('${code}','628111000060','quarter',231000,false,NULL,'thrivin')`);
    sql(`UPDATE promo_redemptions SET order_ref='ORD_BOUND_STALE' WHERE promo_id=${promoId}`);
    sql(`UPDATE promo_redemptions SET created_at = now() - interval '25 hours' WHERE promo_id=${promoId}`);
    assert.equal(sql("SELECT release_stale_promo_reservations(24)"), "0");
    assert.equal(sql(`SELECT status FROM promo_redemptions WHERE promo_id=${promoId}`), "reserved");
    // Kursi tetap ditahan: nomor lain masih 'exhausted', bukan dapat kursi hantu.
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000061','quarter',231000,false,NULL,'thrivin')`), "exhausted");
    assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "1/0");
  });
  check("C-4: order dibatalkan EKSPLISIT -> kursi kembali ke kuota", () => {
    const code = seedPromo({ quota: 1 });
    const promoId = `(SELECT id FROM promo_codes WHERE code='${code}')`;
    sql(`SELECT redeem_promo('${code}','628111000062','quarter',231000,false,NULL,'thrivin')`);
    sql(`UPDATE promo_redemptions SET order_ref='ORD_CANCELLED' WHERE promo_id=${promoId}`);
    const rid = sql(`SELECT id FROM promo_redemptions WHERE promo_id=${promoId}`);
    assert.equal(sql(`SELECT cancel_promo_redemption('${rid}')`), "t");
    assert.equal(sql(`SELECT status FROM promo_redemptions WHERE promo_id=${promoId}`), "released");
    assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "0/1");
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000063','quarter',231000,false,NULL,'thrivin')`), "ok");
  });
  check("C-4: kursi yang sudah dibayar tidak bisa dibatalkan (hanya 'reserved')", () => {
    const code = seedPromo({ quota: 2 });
    const promoId = `(SELECT id FROM promo_codes WHERE code='${code}')`;
    sql(`SELECT redeem_promo('${code}','628111000064','quarter',231000,false,NULL,'thrivin')`);
    const rid = sql(`SELECT id FROM promo_redemptions WHERE promo_id=${promoId}`);
    sql(`UPDATE promo_redemptions SET order_ref='ORD_PAID', status='consumed', consumed_at=now() WHERE id='${rid}'`);
    assert.equal(sql(`SELECT cancel_promo_redemption('${rid}')`), "f");
    assert.equal(sql(`SELECT status FROM promo_redemptions WHERE id='${rid}'`), "consumed");
  });

  // ── 6c. C-6: order tercetak tapi attach gagal (order_ref tetap NULL) ──────
  console.log("\n── C-6: order tercetak, reservasi tidak terikat ──");
  check("C-6: kursi DITAHAN (nomor lain tidak bisa menyelundup), sweep tidak melepas", () => {
    const code = seedPromo({ quota: 1 });
    const promoId = `(SELECT id FROM promo_codes WHERE code='${code}')`;
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000070','quarter',231000,false,NULL,'thrivin')`), "ok");
    const rowId = sql(`SELECT id FROM promo_redemptions WHERE promo_id=${promoId}`);
    // Simulasi attachPromoOrder gagal: order ada di Scalev, order_ref tidak tertulis.
    assert.equal(sql(`SELECT flag_promo_reconcile('${rowId}')`), "t");
    assert.equal(sql(`SELECT needs_reconcile FROM promo_redemptions WHERE id='${rowId}'`), "t");
    sql(`UPDATE promo_redemptions SET created_at = now() - interval '25 hours' WHERE id='${rowId}'`);
    assert.equal(sql("SELECT release_stale_promo_reservations(24)"), "0");
    assert.equal(sql(`SELECT status FROM promo_redemptions WHERE id='${rowId}'`), "reserved");
    assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "1/0");
    // Checkout kedua dari nomor yang sama DITOLAK (pra-fix: order kedua tercetak).
    assert.equal(sql(`SELECT status FROM redeem_promo('${code}','628111000070','quarter',231000,false,NULL,'thrivin')`), "pending_order");
    assert.equal(sql(`SELECT count(*) FROM promo_redemptions WHERE promo_id=${promoId}`), "1");
    // Ops menyelesaikannya: order dibatalkan manual -> kursi kembali.
    assert.equal(sql(`SELECT cancel_promo_redemption('${rowId}')`), "t");
    assert.equal(sql(`SELECT used_count||'/'||remaining FROM v_promo_codes WHERE code='${code}'`), "0/1");
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
