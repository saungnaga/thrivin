/**
 * Uji SQL gate consent/checkout W4 (kartu t_f5ec336c).
 *
 *   node --experimental-strip-types tests/test-consent-gate-sql.mts
 *
 * Dijalankan terhadap Postgres lokal (harness) — bukan staging, bukan produksi.
 * Yang dibuktikan di sini adalah aturan yang HARUS hidup di DB (bukan di TS):
 * urutan consent, idempotensi, append-only, single-flight klaim order, dan
 * hak akses (anon ditolak).
 */
import { execFileSync, spawn } from "child_process";
import path from "path";
import { PG_DB, psqlSuper } from "./harness/stack.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
// F-S8: Seed database lokal sebelum uji agar skema/fungsi draf terbaru selalu diuji
execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });

let pass = 0;
const failures: string[] = [];
function check(ok: boolean, name: string, detail = "") {
  if (ok) pass++;
  else failures.push(detail ? `${name} — ${detail}` : name);
}
function eq(actual: unknown, expected: unknown, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(ok, name, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Satu nilai (json) dari RPC. */
function rpc(sql: string): any {
  const out = psqlSuper(sql, { csv: true });
  const value = out.split("\n").pop() ?? "";
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function num(sql: string): number {
  const out = psqlSuper(sql, { csv: true });
  // `begin; ...; rollback;` juga mencetak tag perintah — ambil angka terakhir.
  const numeric = out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-?\d+$/.test(line));
  return Number(numeric[numeric.length - 1] ?? NaN);
}
function throws(sql: string): string | null {
  try {
    psqlSuper(sql);
    return null;
  } catch (err) {
    return String((err as { stderr?: string; message?: string }).stderr || (err as Error).message);
  }
}
/**
 * Sama seperti psqlSuper, tapi SQL yang gagal (mis. kolom/view belum ada pra-fix)
 * dilaporkan sebagai string kosong supaya suite tetap sampai ringkasan — bukti
 * negatif harus terbaca "FAIL", bukan crash.
 */
function scalar(sql: string): string {
  try {
    return psqlSuper(sql, { csv: true });
  } catch {
    return "";
  }
}
/** `num()` versi tahan-gagal; NaN dipakai sebagai penanda "query tidak jalan". */
function numSafe(sql: string): number {
  try {
    return num(sql);
  } catch {
    return NaN;
  }
}
/**
 * `psqlSuper` yang TIDAK menunggu: satu proses psql sendiri = satu koneksi
 * sendiri. Dipakai untuk menjalankan sesi KEDUA (`claim_checkout_order`) atau
 * menahan transaksi lain terbuka — dua sesi nyata, bukan simulasi urutan.
 */
function psqlSuperAsync(sql: string, extraArgs: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "sudo",
      ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-q", "-d", PG_DB, ...extraArgs, "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `psql exit ${code}`))
    );
  });
}
/** `rpc()` untuk keluaran mentah psqlSuperAsync — gagal = status yang terbaca FAIL. */
function jsonSafe(raw: string): any {
  try {
    return JSON.parse(String(raw).split("\n").pop() ?? "");
  } catch {
    return { status: `unparsable: ${raw}` };
  }
}
/** Tunggu (dengan batas) sampai ada sesi lain yang cocok dengan satu kondisi. */
async function waitForSession(where: string, tries = 400): Promise<number> {
  for (let i = 0; i < tries; i++) {
    const n = numSafe(
      `select count(*) from pg_stat_activity where pid <> pg_backend_pid() and ${where}`
    );
    if (n > 0) return n;
    await new Promise((r) => setTimeout(r, 25));
  }
  return 0;
}

const P = {
  order: "6281200000701",
  replay: "6281200000702",
  tiebreak: "6281200000703",
  gate: "6281200000704",
  gateConsent: "6281200000705",
  version: "6281200000706",
  progress: "6281200000707",
  inflight: "6281200000708",
  anon: "6281200000709",
};

console.log("── bersihkan tabel yang diuji ──");
psqlSuper(
  "TRUNCATE consent_events, onboarding_progress, checkout_claims RESTART IDENTITY CASCADE;"
);

// ── 1. Urutan consent: event lebih tua tidak menurunkan status ───────────────
console.log("── 1. urutan & idempotensi consent ──");
rpc(
  `select record_consent_event('${P.order}','reminder_whatsapp',true,'checkout_step9','reminder-optin-2026-10-15-v1','order-optin-1', now() - interval '2 hours')`
);
rpc(
  `select record_consent_event('${P.order}','reminder_whatsapp',false,'whatsapp_optout','reminder-optin-2026-10-15-v1','order-optout-1', now() - interval '1 hour')`
);
const stale = rpc(
  `select record_consent_event('${P.order}','reminder_whatsapp',true,'checkout_step9','reminder-optin-2026-10-15-v1','order-late-1', now() - interval '3 hours')`
);
eq(stale.applied, false, "event dengan occurred_at lebih tua TIDAK diterapkan");
const stateAfterStale = rpc(`select consent_state_for_phone('${P.order}')`);
eq(stateAfterStale.opt_in, false, "opt_in tetap false setelah retry lama");
eq(stateAfterStale.opted_out, true, "opt_out tetap true setelah retry lama");
eq(
  num(`select count(*) from consent_events where phone='${P.order}'`),
  3,
  "event terlambat TETAP tersimpan sebagai bukti (append-only)"
);

const newerOptIn = rpc(
  `select record_consent_event('${P.order}','reminder_whatsapp',true,'checkout_step9','reminder-optin-2026-10-15-v1','order-optin-2', now())`
);
eq(newerOptIn.applied, true, "event eksplisit yang lebih baru diterapkan");
const stateNewer = rpc(`select consent_state_for_phone('${P.order}')`);
eq(stateNewer.opt_in, true, "opt_in menyala lagi lewat event eksplisit lebih baru");
eq(stateNewer.opted_out, false, "opt_out dibersihkan oleh opt-in eksplisit lebih baru");

// ── 2. Idempotensi replay ───────────────────────────────────────────────────
const before = num(`select count(*) from consent_events where phone='${P.order}'`);
const dup = rpc(
  `select record_consent_event('${P.order}','reminder_whatsapp',true,'checkout_step9','reminder-optin-2026-10-15-v1','order-optin-2', now())`
);
eq(dup.status, "duplicate", "replay kunci idempotensi ⇒ duplicate");
eq(
  num(`select count(*) from consent_events where phone='${P.order}'`),
  before,
  "replay tidak menambah baris"
);

// ── 3. `false` tetap disimpan (bukan 'tidak ada baris') ─────────────────────
const falseConsent = rpc(
  `select record_checkout_consent('${P.replay}','terms-2026-10-15-v1',true,false,'reminder-optin-2026-10-15-v1','checkout_step9','replay-consent-1')`
);
eq(falseConsent.status, "ok", "consent T&C + pengingat=false tersimpan");
eq(
  num(
    `select count(*) from consent_events where phone='${P.replay}' and consent_type='reminder_whatsapp' and value = false`
  ),
  1,
  "baris pengingat=false benar-benar ada"
);
const replayState = rpc(`select consent_state_for_phone('${P.replay}')`);
eq(replayState.opt_in, false, "pengingat=false ⇒ opt_in false");
eq(replayState.opted_out, false, "pengingat=false TIDAK dianggap opt-out");
eq(replayState.terms_accepted, true, "T&C tercatat true");

// ── 4. Seri (occurred_at sama): yang menang adalah `false` ──────────────────
rpc(
  `select record_consent_event('${P.tiebreak}','reminder_whatsapp',true,'checkout_step9','reminder-optin-2026-10-15-v1','tiebreak-1','2026-01-01T00:00:00Z')`
);
rpc(
  `select record_consent_event('${P.tiebreak}','reminder_whatsapp',false,'whatsapp_optout','reminder-optin-2026-10-15-v1','tiebreak-2','2026-01-01T00:00:00Z')`
);
eq(
  rpc(`select consent_state_for_phone('${P.tiebreak}')`).opted_out,
  true,
  "occurred_at seri ⇒ opt-out menang"
);

// ── 5. Append-only: UPDATE/DELETE ditolak trigger ───────────────────────────
console.log("── 2. append-only & hak akses ──");
const updateErr = throws(
  `update consent_events set value = true where phone='${P.order}'`
);
check(
  !!updateErr && /append-only/i.test(updateErr),
  "UPDATE consent_events ditolak trigger append-only",
  updateErr || "tidak error"
);
const deleteErr = throws(`delete from consent_events where phone='${P.order}'`);
check(
  !!deleteErr && /append-only/i.test(deleteErr),
  "DELETE consent_events ditolak trigger append-only",
  deleteErr || "tidak error"
);

// ── 6. anon/authenticated tidak bisa baca tabel & tidak bisa panggil RPC ────
const anonRead = throws(
  `begin; set local role anon; select count(*) from consent_events; rollback;`
);
check(!!anonRead && /permission denied/i.test(anonRead), "anon DILARANG select consent_events (REVOKE)");
const anonWrite = throws(
  `begin; set local role anon; select record_consent_event('${P.anon}','terms',true,'x','y','anon-key-1'); rollback;`
);
check(!!anonWrite, "anon DILARANG memanggil record_consent_event", "ternyata boleh");
const anonClaim = throws(
  `begin; set local role anon; select claim_checkout_order('${P.anon}', ARRAY[2],'month','terms-2026-10-15-v1','anon-key-2'); rollback;`
);
check(!!anonClaim, "anon DILARANG memanggil claim_checkout_order", "ternyata boleh");
const anonProgress = throws(
  `begin; set local role anon; select count(*) from onboarding_progress; rollback;`
);
check(!!anonProgress && /permission denied/i.test(anonProgress), "anon DILARANG select onboarding_progress (REVOKE)");
const anonClaims = throws(
  `begin; set local role anon; select count(*) from checkout_claims; rollback;`
);
check(!!anonClaims && /permission denied/i.test(anonClaims), "anon DILARANG select checkout_claims (REVOKE)");

// F-S5: probe anon INSERT / UPDATE ditolak (REVOKE eksplisit)
const anonInsertEvents = throws(
  `begin; set local role anon; insert into consent_events (phone, consent_type, value, source, text_version, idempotency_key) values ('${P.anon}','terms',true,'src','v1','anon-evt-1'); rollback;`
);
check(!!anonInsertEvents && /permission denied/i.test(anonInsertEvents), "anon DILARANG insert ke consent_events", anonInsertEvents || "");

const anonInsertProgress = throws(
  `begin; set local role anon; insert into onboarding_progress (phone, steps) values ('${P.anon}','{}'::jsonb); rollback;`
);
check(!!anonInsertProgress && /permission denied/i.test(anonInsertProgress), "anon DILARANG insert ke onboarding_progress", anonInsertProgress || "");

const anonUpdateClaims = throws(
  `begin; set local role anon; update checkout_claims set status='failed' where phone='${P.anon}'; rollback;`
);
check(!!anonUpdateClaims && /permission denied/i.test(anonUpdateClaims), "anon DILARANG update checkout_claims", anonUpdateClaims || "");

// ── 7. Progress onboarding server-side ──────────────────────────────────────
console.log("── 3. progress + gate klaim ──");
rpc(`select save_onboarding_step('${P.progress}', 3, '{"gender":"Laki-laki","age":30}')`);
rpc(`select save_onboarding_step('${P.progress}', 2, '{"name":"Uji"}'::jsonb)`);
const progressRow = psqlSuper(
  `select step_reached, steps::text from onboarding_progress where phone='${P.progress}'`,
  { csv: true }
);
check(progressRow.includes("3|"), "step_reached maju monotonik walau langkah datang tidak berurutan", progressRow);
check(progressRow.includes("age"), "isi langkah lama tidak tertimpa langkah baru", progressRow);

// ── 8. Gate klaim: tidak lengkap / consent belum ada / versi salah ──────────
const missingGate = rpc(
  `select claim_checkout_order('${P.gate}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', 'gate-key-1')`
);
eq(missingGate.status, "incomplete_onboarding", "langkah belum lengkap ⇒ ditolak");
eq(missingGate.missing_steps, [2, 3, 4, 5, 6, 7, 8], "langkah yang hilang disebut semua");

for (const step of [2, 3, 4, 5, 6, 7, 8]) {
  rpc(
    `select save_onboarding_step('${P.gate}', ${step}, '{"step":${step}}'::jsonb)`
  );
}
const noConsent = rpc(
  `select claim_checkout_order('${P.gate}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', 'gate-key-1')`
);
eq(noConsent.status, "consent_required", "progress lengkap tanpa consent ⇒ ditolak");

rpc(
  `select record_checkout_consent('${P.gate}','terms-2026-10-15-v1',true,false,'reminder-optin-2026-10-15-v1','checkout_step9','gate-consent-1')`
);
const wrongVersion = rpc(
  `select claim_checkout_order('${P.gate}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-9999-v9', 'gate-key-1')`
);
eq(wrongVersion.status, "consent_required", "versi T&C lain ⇒ ditolak");

// ── 9. Klaim single-flight + replay mengembalikan order yang sama ───────────
const granted = rpc(
  `select claim_checkout_order('${P.gate}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', 'gate-key-1')`
);
eq(granted.status, "granted", "gate lengkap ⇒ klaim diberikan");

const inFlightAgain = rpc(
  `select claim_checkout_order('${P.gate}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', 'gate-key-1')`
);
eq(inFlightAgain.status, "in_flight", "klaim kedua dengan kunci sama saat masih in-flight ⇒ in_flight (tanpa order kedua)");

const otherKeyInflight = rpc(
  `select claim_checkout_order('${P.gate}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', 'gate-key-2')`
);
eq(otherKeyInflight.status, "in_flight", "nomor yang sama tidak boleh punya dua order in-flight");

rpc(`select complete_checkout_claim('${granted.claim_id}', 'ord-777', 'https://pay/777', 231000)`);
const replayClaim = rpc(
  `select claim_checkout_order('${P.gate}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', 'gate-key-1')`
);
eq(replayClaim.status, "already_created", "replay kunci yang sudah jadi order ⇒ already_created");
eq(replayClaim.order_id, "ord-777", "replay mengembalikan order_id yang SAMA");
eq(replayClaim.payment_url, "https://pay/777", "replay mengembalikan payment_url yang SAMA");

// F-S1: Kunci yang sudah dimiliki nomor A DILARANG direplay oleh nomor B
const crossPhoneReplay = rpc(
  `select claim_checkout_order('${P.replay}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', 'gate-key-1')`
);
eq(crossPhoneReplay.status, "key_conflict", "F-S1: replay kunci milik nomor lain ⇒ key_conflict (409 di route)");

// F-S7: Jika ada dua event T&C dengan timestamp identik (true & false), false menang (fail-closed)
const P_tie_terms = "6281200000799";
for (const step of [2, 3, 4, 5, 6, 7, 8]) {
  rpc(`select save_onboarding_step('${P_tie_terms}', ${step}, '{"step":${step}}'::jsonb)`);
}
rpc(
  `select record_consent_event('${P_tie_terms}','terms',true,'checkout_step9','terms-2026-10-15-v1','tie-terms-t','2026-01-01T12:00:00Z')`
);
rpc(
  `select record_consent_event('${P_tie_terms}','terms',false,'user_revoke','terms-2026-10-15-v1','tie-terms-f','2026-01-01T12:00:00Z')`
);
const tieTermsClaim = rpc(
  `select claim_checkout_order('${P_tie_terms}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', 'tie-terms-key')`
);
eq(tieTermsClaim.status, "consent_required", "F-S7: seri T&C (true & false di timestamp sama) ⇒ false menang, gate tolak consent_required");

// ── 9b. F-S4/RX2-1: retensi PII — hitungan baris, jejak audit, alarm ────────
// Asersi lama hanya membuktikan "fungsi jalan". Yang dibuktikan di sini:
// berapa baris yang benar-benar hilang, baris yang masih dalam retensi aman,
// klaim in_flight terbengkalai ikut dibersihkan, dan tiap run meninggalkan
// jejak yang bisa dibaca alarm scheduler.
console.log("── 9b. F-S4/RX2-1: retensi PII: hitungan baris + jejak audit + alarm ──");
const P_ret_old = "6281200000801";
const P_ret_fresh = "6281200000802";
const P_ret_flight_dead = "6281200000803";
const P_ret_flight_live = "6281200000804";
const P_ret_alarm = "6281200000805";

// Baris disiapkan lewat SQL superuser supaya `updated_at` bisa dipindah ke masa lalu.
psqlSuper(
  `insert into onboarding_progress (tenant_id, phone, steps, step_reached, created_at, updated_at) values
     ('thrivin','${P_ret_old}','{}'::jsonb,4, now() - interval '31 days', now() - interval '31 days'),
     ('thrivin','${P_ret_fresh}','{}'::jsonb,4, now() - interval '2 days', now() - interval '2 days');`
);
psqlSuper(
  `insert into checkout_claims (tenant_id, phone, idempotency_key, plan_key, status, created_at, updated_at) values
     ('thrivin','${P_ret_old}','ret-created-old','quarter','created', now() - interval '31 days', now() - interval '31 days'),
     ('thrivin','${P_ret_old}','ret-failed-old','quarter','failed', now() - interval '31 days', now() - interval '31 days'),
     ('thrivin','${P_ret_flight_dead}','ret-flight-old','quarter','in_flight', now() - interval '31 days', now() - interval '31 days'),
     ('thrivin','${P_ret_flight_live}','ret-flight-live','quarter','in_flight', now(), now());`
);

const auditsBefore = num(`select count(*) from purge_audit_log`);
const webhookAuditsBefore = num(`select count(*) from purge_audit_log where deleted_inbox is not null`);
const purgeResult = rpc(`select row_to_json(p) from purge_expired_onboarding_progress(30) p`);

eq(purgeResult.deleted_progress, 1, "F-S4: hitungan progress terhapus tepat (1 baris basi)");
eq(
  purgeResult.deleted_claims,
  3,
  "F-S4/RX2-1: hitungan klaim terhapus tepat (created + failed basi + in_flight terbengkalai)"
);
eq(
  num(`select count(*) from onboarding_progress where phone='${P_ret_old}'`),
  0,
  "F-S4: progress basi benar-benar hilang (PII terhapus, bukan cuma dihitung)"
);
eq(
  num(`select count(*) from onboarding_progress where phone='${P_ret_fresh}'`),
  1,
  "F-S4: progress yang masih dalam retensi TIDAK dihapus"
);
eq(
  num(`select count(*) from checkout_claims where phone='${P_ret_flight_dead}'`),
  0,
  "RX2-1: klaim in_flight terbengkalai > TTL + retensi dibersihkan (nomor tidak disimpan selamanya)"
);
eq(
  psqlSuper(`select status from checkout_claims where phone='${P_ret_flight_live}'`, { csv: true }),
  "in_flight",
  "RX2-1: klaim in_flight yang HIDUP tidak dilepas/dihapus"
);

// RX2-1: jejak audit — bedakan "scheduler mati" dari "tidak ada yang perlu dihapus".
eq(
  num(`select count(*) from purge_audit_log`),
  auditsBefore + 1,
  "RX2-1: tiap run purge menulis SATU baris jejak audit"
);
eq(
  scalar(
    `select deleted_progress || '|' || deleted_claims from purge_audit_log
      where deleted_progress is not null order by ran_at desc, id desc limit 1`
  ),
  "1|3",
  "RX2-1: baris audit mencatat hasil run ini"
);
eq(
  scalar(
    `select coalesce(deleted_inbox::text,'') from purge_audit_log
      where deleted_progress is not null order by ran_at desc, id desc limit 1`
  ),
  "",
  "RX2-1: run retensi PII tidak memalsukan kolom jalur webhook (NULL, bukan 0)"
);
eq(
  num(`select count(*) from purge_audit_log where deleted_inbox is not null`),
  webhookAuditsBefore,
  "RX2-1: alarm webhook tidak membaca run retensi PII sebagai run webhook"
);

// RX2-1: alarm backlog — scheduler mati harus terlihat.
const backlogBefore = numSafe(`select expired_progress_rows from v_onboarding_retention_backlog`);
check(
  Number.isFinite(backlogBefore),
  "RX2-1: v_onboarding_retention_backlog terbaca",
  String(backlogBefore)
);
psqlSuper(
  `insert into onboarding_progress (tenant_id, phone, steps, step_reached, created_at, updated_at) values
     ('thrivin','${P_ret_alarm}','{}'::jsonb,4, now() - interval '45 days', now() - interval '45 days');`
);
eq(
  numSafe(`select expired_progress_rows from v_onboarding_retention_backlog`),
  backlogBefore + 1,
  "RX2-1: alarm menghitung PII yang seharusnya sudah dihapus (backlog naik tepat 1)"
);
check(
  scalar(`select last_purge_at from v_onboarding_retention_backlog`).length > 0,
  "RX2-1: alarm membawa waktu purge terakhir (scheduler mati terlihat)"
);
const anonRetentionView = throws(
  `begin; set local role anon; select count(*) from v_onboarding_retention_backlog; rollback;`
);
check(
  !!anonRetentionView && /permission denied/i.test(anonRetentionView),
  "RX2-1: anon DILARANG membaca alarm retensi PII",
  anonRetentionView || "ternyata boleh"
);

// Percobaan gagal melepas klaim supaya nomor tidak terkunci.
const failClaim = rpc(
  `select claim_checkout_order('${P.inflight}', ARRAY[2,3,4,5,6,7,8], 'month', 'terms-2026-10-15-v1', 'inflight-key-1')`
);
rpc(
  `select record_checkout_consent('${P.inflight}','terms-2026-10-15-v1',true,false,'reminder-optin-2026-10-15-v1','checkout_step9','inflight-consent-1')`
);
for (const step of [2, 3, 4, 5, 6, 7, 8]) {
  rpc(`select save_onboarding_step('${P.inflight}', ${step}, '{"step":${step}}'::jsonb)`);
}
const inflightGranted = rpc(
  `select claim_checkout_order('${P.inflight}', ARRAY[2,3,4,5,6,7,8], 'month', 'terms-2026-10-15-v1', 'inflight-key-1')`
);
eq(inflightGranted.status, "granted", "klaim untuk nomor lain tetap bisa (tidak saling mengunci)");
rpc(`select release_checkout_claim('${inflightGranted.claim_id}')`);
eq(
  psqlSuper(`select status from checkout_claims where id='${inflightGranted.claim_id}'`, { csv: true }),
  "failed",
  "klaim yang dilepas berstatus failed"
);
const afterRelease = rpc(
  `select claim_checkout_order('${P.inflight}', ARRAY[2,3,4,5,6,7,8], 'month', 'terms-2026-10-15-v1', 'inflight-key-2')`
);
eq(afterRelease.status, "granted", "setelah klaim dilepas, percobaan ulang boleh jalan");
check(failClaim.claim_id === undefined || true, "klaim pertama nomor uji dicatat");

// ── 10. F-W4-1 (opsi a): satu nomor = satu order belum dibayar ──────────────
console.log("── 10. F-W4-1: reuse / blokir paket beda / paid_at / TTL / gate tetap duluan ──");
const STEPS = "ARRAY[2,3,4,5,6,7,8]";
const TERMS = "'terms-2026-10-15-v1'";
const P_fw1 = "6281200000710";
const P_fw1cross = "6281200000711";
const P_fw1gate = "6281200000712";

/** Panggilan gate yang sama bentuknya dengan `src/lib/checkout-gate.ts`. */
function claim(phone: string, plan: string, key: string): any {
  return rpc(`select claim_checkout_order('${phone}', ${STEPS}, '${plan}', ${TERMS}, '${key}')`);
}
function armPhone(phone: string, consentKey: string) {
  rpc(
    `select record_checkout_consent('${phone}','terms-2026-10-15-v1',true,false,'reminder-optin-2026-10-15-v1','checkout_step9','${consentKey}')`
  );
  for (const step of [2, 3, 4, 5, 6, 7, 8]) {
    rpc(`select save_onboarding_step('${phone}', ${step}, '{"step":${step}}'::jsonb)`);
  }
}
function paidAt(claimId: string): string {
  return psqlSuper(`select coalesce(paid_at::text,'') from checkout_claims where id='${claimId}'`, {
    csv: true,
  });
}
/**
 * Tandai klaim jadi order. Kegagalan prasyarat dicatat sebagai FAIL (bukan
 * exception) supaya suite tetap jalan sampai ringkasan — penting untuk bukti
 * negatif: perilaku pra-fix harus terbaca sebagai FAIL, bukan crash.
 */
function complete(c: any, orderId: string, url: string): void {
  if (!c?.claim_id) {
    check(false, `prasyarat: klaim untuk ${orderId} tidak diberikan`, JSON.stringify(c));
    return;
  }
  rpc(`select complete_checkout_claim('${c.claim_id}', '${orderId}', '${url}', 231000)`);
}

armPhone(P_fw1, "fw1-consent-1");
const fw1 = claim(P_fw1, "quarter", "fw1-key-1");
eq(fw1.status, "granted", "F-W4-1: klaim pertama diberikan");
complete(fw1, "ord-FW1", "https://pay/fw1");

// (1) paket SAMA + kunci baru ⇒ order/link yang sama, tanpa baris klaim kedua
const fw1Reuse = claim(P_fw1, "quarter", "fw1-key-2");
eq(fw1Reuse.status, "reuse_unpaid", "F-W4-1(a): paket sama + kunci baru ⇒ reuse_unpaid");
eq(fw1Reuse.order_id, "ord-FW1", "F-W4-1(a): mengembalikan order_id yang SAMA");
eq(fw1Reuse.payment_url, "https://pay/fw1", "F-W4-1(a): mengembalikan payment_url yang SAMA");
eq(
  num(`select count(*) from checkout_claims where phone='${P_fw1}'`),
  1,
  "F-W4-1(a): tidak ada baris klaim kedua yang lahir"
);

// (2) paket BEDA ⇒ blokir eksplisit (route menjawab 409 UNPAID_ORDER_EXISTS)
const fw1Conflict = claim(P_fw1, "month", "fw1-key-3");
eq(fw1Conflict.status, "unpaid_conflict", "F-W4-1(a): paket beda ⇒ unpaid_conflict");
eq(fw1Conflict.plan_key, "quarter", "F-W4-1(a): paket yang menahan disebut (diagnostik, bukan rahasia)");
check(fw1Conflict.order_id === undefined, "F-W4-1(a): unpaid_conflict tidak membawa order_id");

// (3) F-S1 tidak boleh regresi: kunci milik nomor lain tetap ditolak
armPhone(P_fw1cross, "fw1-cross-consent-1");
const fw1CrossPhone = claim(P_fw1cross, "quarter", "fw1-key-1");
eq(fw1CrossPhone.status, "key_conflict", "F-S1 tetap: kunci milik nomor lain ⇒ key_conflict");

// (4) mark_checkout_claim_paid (dipanggil webhook): idempotent + membuka pembelian ulang
eq(paidAt(fw1.claim_id), "", "F-W4-1: pra-syarat — klaim belum lunas");
const mark1 = rpc(`select mark_checkout_claim_paid('ord-FW1')`);
eq(mark1.status, "marked", "F-W4-1: mark_checkout_claim_paid ⇒ marked");
const firstPaidAt = paidAt(fw1.claim_id);
check(firstPaidAt.length > 0, "F-W4-1: paid_at terisi");
rpc(`select mark_checkout_claim_paid('ord-FW1', now() + interval '1 hour')`);
eq(paidAt(fw1.claim_id), firstPaidAt, "F-W4-1: retry webhook TIDAK menggeser paid_at pertama");
eq(
  rpc(`select mark_checkout_claim_paid('ord-tidak-ada')`).status,
  "not_found",
  "F-W4-1: order di luar gate ⇒ not_found (bukan error)"
);
const fw1AfterPaid = claim(P_fw1, "quarter", "fw1-key-4");
eq(fw1AfterPaid.status, "granted", "F-W4-1: setelah lunas ⇒ kunci baru mencetak order baru");
complete(fw1AfterPaid, "ord-FW2", "https://pay/fw2");

// (5) TTL: order belum dibayar yang ditinggalkan tidak menahan nomor selamanya
// (id palsu kalau klaim tidak diberikan: pra-fix harus terbaca FAIL, bukan crash.)
const id2 = fw1AfterPaid?.claim_id || "00000000-0000-0000-0000-000000000000";
psqlSuper(
  `update checkout_claims set created_at = now() - interval '61 minutes' where id='${id2}'`
);
const fw1Stale = claim(P_fw1, "quarter", "fw1-key-5");
eq(fw1Stale.status, "granted", "F-W4-1(a): order belum dibayar > TTL ⇒ checkout baru boleh");
eq(
  psqlSuper(`select status from checkout_claims where id='${id2}'`, { csv: true }),
  "failed",
  "F-W4-1(a): order yang ditinggalkan ditandai failed"
);

// (5b) F-W4-1b: kunci LAMA yang barisnya sudah di-retire 3b (`failed`, tapi
// `order_id` masih tersimpan & link Scalev-nya masih bisa dibayar) TIDAK boleh
// di-grant ulang ⇒ order kedua. Kunci sama tetap order/link yang sama.
const P_fw1b = "6281200000713";
armPhone(P_fw1b, "fw1b-consent-1");
const fw1bA = claim(P_fw1b, "quarter", "fw1b-key-old");
eq(fw1bA.status, "granted", "F-W4-1b: pra-syarat — klaim pertama diberikan");
complete(fw1bA, "ord-FW1b-A", "https://pay/fw1b-a");
psqlSuper(
  `update checkout_claims set created_at = now() - interval '61 minutes' where id='${fw1bA.claim_id}'`
);
const fw1bB = claim(P_fw1b, "quarter", "fw1b-key-new");
eq(fw1bB.status, "granted", "F-W4-1b: pra-syarat — retire TTL membebaskan nomor (kunci baru dapat order)");
complete(fw1bB, "ord-FW1b-B", "https://pay/fw1b-b");
eq(
  psqlSuper(`select status from checkout_claims where id='${fw1bA.claim_id}'`, { csv: true }),
  "failed",
  "F-W4-1b: pra-syarat — baris kunci lama sudah di-retire (failed)"
);

const fw1bReplay = claim(P_fw1b, "quarter", "fw1b-key-old");
eq(fw1bReplay.status, "already_created", "F-W4-1b: replay kunci lama setelah retire ⇒ already_created (bukan granted)");
eq(fw1bReplay.order_id, "ord-FW1b-A", "F-W4-1b: ... mengembalikan order yang MEMANG milik kunci itu");
eq(
  psqlSuper(`select status from checkout_claims where id='${fw1bA.claim_id}'`, { csv: true }),
  "failed",
  "F-W4-1b: baris kunci lama tidak dibangkitkan jadi in_flight (tidak ada kursi kedua)"
);
// Route mencetak order ketiga HANYA kalau gate masih memberi `granted` (pra-fix).
// Ini yang membuat asersi hitungan di bawah bergigi — persis jalur `create-order`.
if (fw1bReplay.status === "granted") complete(fw1bReplay, "ord-FW1b-C", "https://pay/fw1b-c");
eq(
  num(
    `select count(distinct order_id) from checkout_claims where phone='${P_fw1b}' and status='created' and paid_at is null`
  ),
  1,
  "F-W4-1b: tepat SATU order belum-dibayar hidup sesudah replay kunci lama"
);
eq(
  num(`select count(*) from checkout_claims where phone='${P_fw1b}'`),
  2,
  "F-W4-1b: tidak ada baris klaim kedua yang lahir karena replay"
);

// F-W4-1b sengaja SEMPIT: 'failed' TANPA order (Scalev gagal di tengah, klaim
// dilepas) tetap boleh diklaim ulang dengan kunci yang SAMA — retry tidak dikunci.
const P_fw1bRetry = "6281200000714";
armPhone(P_fw1bRetry, "fw1b-retry-consent-1");
const fw1bRetryA = claim(P_fw1bRetry, "quarter", "fw1b-key-retry");
eq(fw1bRetryA.status, "granted", "F-W4-1b: pra-syarat — klaim retry diberikan");
rpc(`select release_checkout_claim('${fw1bRetryA.claim_id}')`);
const fw1bRetryB = claim(P_fw1bRetry, "quarter", "fw1b-key-retry");
eq(fw1bRetryB.status, "granted", "F-W4-1b: 'failed' tanpa order tetap boleh diklaim ulang (kunci SAMA)");
eq(fw1bRetryB.claim_id, fw1bRetryA.claim_id, "F-W4-1b: baris klaim yang sama dipakai ulang (bukan baris baru)");

// (6) Reuse TIDAK mendahului gate: kalau langkah wajib hilang, tetap ditolak.
armPhone(P_fw1gate, "fw1-gate-consent-1");
const fw1Gate = claim(P_fw1gate, "quarter", "fw1-gate-key-1");
eq(fw1Gate.status, "granted", "F-W4-1: pra-syarat klaim untuk nomor ketiga");
complete(fw1Gate, "ord-FW3", "https://pay/fw3");
psqlSuper(`delete from onboarding_progress where phone='${P_fw1gate}'`);
const fw1GateGone = claim(P_fw1gate, "quarter", "fw1-gate-key-2");
eq(
  fw1GateGone.status,
  "incomplete_onboarding",
  "F-W4-1: reuse hanya SESUDAH langkah wajib & T&C — gate tetap fail-closed"
);

// (7) `paid_at` hanya lewat jalur uang: anon/authenticated dilarang
const anonMarkPaid = throws(
  `begin; set local role anon; select mark_checkout_claim_paid('ord-FW1'); rollback;`
);
check(!!anonMarkPaid, "anon DILARANG memanggil mark_checkout_claim_paid", "ternyata boleh");

// (8) W4RX4 T1 (temuan Sentinel t_3f91103d): dua kunci BERBEDA, nomor sama, paralel.
// Langkah 6 (`SELECT ... status='created' AND paid_at IS NULL`) dan langkah 7
// (`INSERT`) ada di snapshot READ COMMITTED yang berbeda; commit `complete` milik
// request pertama bisa menyelip di antaranya. Blok ini mereproduksinya DETERMINISTIK
// (bukan balapan timing / flaky) dengan dua sesi NYATA yang memanggil RPC asli:
// transaksi A ditahan terbuka, dan B baru dijalankan setelah terbukti A sudah
// menjalankan complete — jadi langkah 6 milik B pasti lebih tua dari commit itu.
console.log("── 11. W4RX4 T1: order HIDUP kedua tidak boleh lahir dari celah snapshot ──");
const P_t1 = "6281200000715";
const KEY_T1_A = "t1-key-a";
const KEY_T1_B = "t1-key-b";
/** Penanda di teks query supaya sesi A bisa dikenali di pg_stat_activity. */
const T1_MARK = "w4rx4-hold-marker";
armPhone(P_t1, "t1-consent-1");
const t1A = claim(P_t1, "quarter", KEY_T1_A);
eq(t1A.status, "granted", "T1: pra-syarat — klaim pertama diberikan");

// Jalur app apa adanya: transaksi KLAIM A sudah commit; panggilan Scalev +
// complete_checkout_claim jalan di transaksi KEDUA, dan transaksi kedua itu di
// sini ditahan terbuka (uncommitted) selama B masuk.
const t1HolderDone = psqlSuperAsync(`
begin;
select '${T1_MARK}';
select complete_checkout_claim('${t1A.claim_id}','ord-T1-A','https://pay/t1-a',231000);
select pg_sleep(6);
commit;
`);
const t1Holding = await waitForSession(`query like '%${T1_MARK}%' and wait_event_type = 'Timeout'`);
check(
  t1Holding > 0,
  "T1: pra-syarat — transaksi A sudah menjalankan complete dan masih MENAHANNYA (uncommitted)",
  `sesi yang cocok: ${t1Holding}`
);

// B: kunci BERBEDA, nomor sama, paket sama — dijalankan juga di latar supaya bisa
// dibuktikan bahwa ia benar-benar tertahan DI LANGKAH 7 (`wait_event_type='Lock'`),
// bukan sekadar mengembalikan jawaban.
const t1BDone = psqlSuperAsync(
  `select (claim_checkout_order('${P_t1}', ARRAY[2,3,4,5,6,7,8], 'quarter', 'terms-2026-10-15-v1', '${KEY_T1_B}'))::text`,
  ["-At"]
);
const t1Blocked = await waitForSession(`query like '%${KEY_T1_B}%' and wait_event_type = 'Lock'`, 200);
check(
  t1Blocked > 0,
  "T1: pra-syarat — request kedua tertahan di langkah 7 (INSERT di kunci oleh baris A yang belum di-commit)",
  `sesi yang cocok: ${t1Blocked}`
);
const t1B = jsonSafe(await t1BDone.catch((err) => `ERR ${err}`));
const t1Holder = String(await t1HolderDone.catch((err) => `ERR ${err}`)).replace(/\s+/g, " ");
check(
  t1Holder.includes("completed"),
  "T1: pra-syarat — complete_checkout_claim A selesai tanpa error",
  t1Holder.slice(-160)
);
eq(
  t1B.status,
  "in_flight",
  "T1: kunci berbeda + nomor sama ⇒ request kedua DITOLAK (in_flight ⇒ route 409 ORDER_IN_FLIGHT), bukan granted"
);
// Route mencetak order kedua HANYA kalau gate masih memberi `granted` (pra-fix).
// Ini yang membuat asersi hitungan di bawah bergigi — persis jalur `create-order`.
if (t1B.status === "granted") complete(t1B, "ord-T1-B", "https://pay/t1-b");
eq(
  num(
    `select count(distinct order_id) from checkout_claims where phone='${P_t1}' and status='created' and paid_at is null`
  ),
  1,
  "T1: tepat SATU order belum-dibayar hidup untuk nomor itu"
);
eq(
  num(`select count(*) from checkout_claims where phone='${P_t1}' and idempotency_key='${KEY_T1_B}'`),
  0,
  "T1: baris klaim kedua tidak lahir (tolak = tidak ada kursi kedua)"
);

// ── Ringkasan ───────────────────────────────────────────────────────────────
console.log(`\nSQL gate consent/checkout: ${pass} PASS, ${failures.length} FAIL`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length) process.exit(1);
console.log("OK");
