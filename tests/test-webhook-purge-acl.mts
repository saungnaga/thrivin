/**
 * ACL objek yang lahir dari DDL `DROP`+`CREATE` — temuan C-6, kartu t_f05112a7.
 *
 *   node --experimental-strip-types tests/test-webhook-purge-acl.mts
 *
 * `purge_expired_webhook_data()` (staging/schema-webhook-onboarding.sql) menghapus
 * baris (`webhook_events_inbox`, `onboarding_snapshots`) dan dibuat dengan
 * `DROP FUNCTION IF EXISTS …; CREATE OR REPLACE FUNCTION …` tanpa GRANT/REVOKE
 * eksplisit. ACL-nya karena itu milik default privileges role yang meng-apply —
 * di Supabase: `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO anon,
 * authenticated`, persis yang dimodelkan harness di
 * `tests/harness/migrations/003-harness-grants.sql`. Fungsi baru Postgres pun
 * sudah EXECUTE untuk PUBLIC, jadi jalur bocornya DUA:
 *
 *   apply pertama  → proacl NULL  → anon ikut PUBLIC (has_function_privilege = t)
 *   apply ulang    → default privileges menambah `anon=X/…`, `authenticated=X/…`
 *
 * Suite ini karena itu menjalankan `seed.sh` DUA kali (`--fresh`, lalu tanpa flag)
 * dan meng-assert ACL di kedua keadaan — pakai `has_function_privilege` **plus**
 * teks `pg_proc.proacl` mentah (probe HTTP status tidak diskriminatif: fungsi ini
 * tidak diekspos PostgREST ke anon, jadi status HTTP sama saja lewat/tidak).
 *
 * Harness lokal saja: nol staging/produksi, nol data pelanggan.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { psqlSuper } from "./harness/stack.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");
const SCHEMA = path.join(REPO, "staging", "schema-webhook-onboarding.sql");
const FN = "public.purge_expired_webhook_data()";

let pass = 0;
const failures: string[] = [];
function check(fn: () => void, name: string) {
  try {
    fn();
    pass++;
  } catch (err) {
    failures.push(`${name} — ${(err as Error).message}`);
  }
}

function scalar(sql: string): string {
  return psqlSuper(sql, { csv: true });
}
/** ACL mentah; proacl NULL = default (untuk fungsi: EXECUTE ke PUBLIC). */
function proacl(): string {
  return scalar(`SELECT coalesce(proacl::text, '<NULL>') FROM pg_proc WHERE oid = '${FN}'::regprocedure`);
}
function aclEntries(): string[] {
  const acl = proacl();
  return acl === "<NULL>" ? [] : acl.replace(/^\{|\}$/g, "").split(",");
}

function applyFresh() {
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh"), "--fresh"], { stdio: "ignore" });
}
function applyAgain() {
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "ignore" });
}

/** Asersi yang harus benar di SETIAP keadaan apply. */
function assertPinned(where: string) {
  check(() => {
    assert.equal(
      scalar(`SELECT has_function_privilege('anon', '${FN}', 'EXECUTE')`),
      "f",
      "anon masih boleh EXECUTE"
    );
    assert.equal(
      scalar(`SELECT has_function_privilege('authenticated', '${FN}', 'EXECUTE')`),
      "f",
      "authenticated masih boleh EXECUTE"
    );
  }, `${where}: anon/authenticated tidak punya EXECUTE`);

  check(() => {
    const entries = aclEntries();
    assert.notEqual(proacl(), "<NULL>", "proacl NULL = masih mewarisi default (PUBLIC)");
    const publicEntries = entries.filter((e) => e.startsWith("="));
    const clientEntries = entries.filter((e) => /^(anon|authenticated)=/.test(e));
    assert.deepEqual(publicEntries, [], `ACL masih memuat baris PUBLIC: ${publicEntries.join(", ")}`);
    assert.deepEqual(clientEntries, [], `ACL masih memuat klien anon: ${clientEntries.join(", ")}`);
    assert.ok(
      entries.some((e) => /^service_role=X/.test(e)),
      `ACL tidak memuat service_role=X: ${proacl()}`
    );
  }, `${where}: ACL mentah dipaku (nol PUBLIC/anon/authenticated, service_role=X)`);

  check(() => {
    assert.equal(
      scalar(`SELECT has_function_privilege('service_role', '${FN}', 'EXECUTE')`),
      "t",
      "service_role kehilangan EXECUTE (cron ops/purge jadi rusak)"
    );
  }, `${where}: service_role tetap bisa EXECUTE`);
}

console.log("── C-6: ACL purge_expired_webhook_data() vs apply skema ──");

// Berkas skema: tiap fungsi yang lahir di situ harus punya pin eksplisit. Penjaga
// ini yang menangkap fungsi berikutnya yang ditambah tanpa REVOKE/GRANT.
check(() => {
  const sql = fs.readFileSync(SCHEMA, "utf-8");
  const created = [...sql.matchAll(/CREATE OR REPLACE FUNCTION\s+([a-z_][a-z0-9_]*)\s*\(/gi)].map(
    (m) => m[1]
  );
  assert.ok(created.length > 0, `nol fungsi terbaca dari ${SCHEMA}`);
  const unpinned = created.filter(
    (name) =>
      !new RegExp(`REVOKE ALL ON FUNCTION ${name}\\s*\\(`, "i").test(sql) ||
      !new RegExp(`GRANT EXECUTE ON FUNCTION ${name}\\s*\\(`, "i").test(sql)
  );
  assert.deepEqual(unpinned, [], `fungsi tanpa REVOKE+GRANT eksplisit: ${unpinned.join(", ")}`);
}, "berkas skema: tiap fungsi punya REVOKE + GRANT eksplisit");

console.log("   apply 1/2: seed.sh --fresh");
applyFresh();
console.log(`   proacl: ${proacl()}`);
assertPinned("apply #1 (fresh)");

console.log("   apply 2/2: seed.sh (re-apply, default privileges aktif)");
applyAgain();
console.log(`   proacl: ${proacl()}`);
assertPinned("apply #2 (re-apply)");

// Sanity: yang di-REVOKE bukan fungsinya sendiri — pemilik (dan cron) tetap bisa
// memanggil, dan audit log tetap ditulis.
check(() => {
  assert.equal(scalar("SELECT count(*) FROM purge_expired_webhook_data()"), "1", "purge gagal dipanggil owner");
  assert.equal(
    scalar("SELECT count(*) FROM purge_audit_log WHERE deleted_inbox IS NOT NULL"),
    "1",
    "tiap run purge harus meninggalkan 1 baris purge_audit_log"
  );
}, "purge tetap jalan sebagai owner + tetap menulis purge_audit_log");

console.log(`\nACL C-6: ${pass} PASS / ${failures.length} FAIL`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
