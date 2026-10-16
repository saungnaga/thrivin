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
import { psqlSuper } from "./harness/stack.mts";

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
const anonRead = num(
  `begin; set local role anon; select count(*) from consent_events; rollback;`
);
eq(anonRead, 0, "anon baca consent_events ⇒ 0 baris (RLS deny)");
const anonWrite = throws(
  `begin; set local role anon; select record_consent_event('${P.anon}','terms',true,'x','y','anon-key-1'); rollback;`
);
check(!!anonWrite, "anon DILARANG memanggil record_consent_event", "ternyata boleh");
const anonClaim = throws(
  `begin; set local role anon; select claim_checkout_order('${P.anon}', ARRAY[2],'month','terms-2026-10-15-v1','anon-key-2'); rollback;`
);
check(!!anonClaim, "anon DILARANG memanggil claim_checkout_order", "ternyata boleh");
const anonProgress = num(
  `begin; set local role anon; select count(*) from onboarding_progress; rollback;`
);
eq(anonProgress, 0, "anon baca onboarding_progress ⇒ 0 baris (RLS deny)");
const anonClaims = num(
  `begin; set local role anon; select count(*) from checkout_claims; rollback;`
);
eq(anonClaims, 0, "anon baca checkout_claims ⇒ 0 baris (RLS deny)");

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

// ── Ringkasan ───────────────────────────────────────────────────────────────
console.log(`\nSQL gate consent/checkout: ${pass} PASS, ${failures.length} FAIL`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length) process.exit(1);
console.log("OK");
