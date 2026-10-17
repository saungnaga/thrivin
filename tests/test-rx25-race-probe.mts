/**
 * RX2-5 probe (kartu t_370981ec) — reproduksi TERARAH asersi race jalur uang
 * `tests/test-consent-gate-e2e.mts:464-509` ("dua kunci berbeda paralel").
 *
 * Kenapa probe terpisah, bukan cuma mengulang suite: satu putaran suite hanya
 * memainkan race itu SEKALI. Kartu ini butuh frekuensi, jadi race-nya diulang
 * N kali di dalam satu stack (mock+PostgREST+app) dengan nomor unik per putaran,
 * dan setelah setiap putaran keadaan DB ikut diperiksa:
 *
 *   - mock menerima tepat SATU POST /v3/orders,
 *   - semua jawaban 200 menunjuk order_id yang SAMA,
 *   - DB: tepat SATU baris klaim "hidup" (in_flight|created|cancel_* & unpaid)
 *     untuk nomor itu (invarian `uq_checkout_claims_live_phone`),
 *   - status ∈ {200, 409} dan 409 selalu ORDER_IN_FLIGHT.
 *
 * Setiap anomali langsung di-dump apa adanya: baris klaim, pg_locks, dan
 * pg_stat_activity (tanpa PII: kolomnya hanya id/status/order_id/kunci uji).
 *
 *   HARNESS_PG_DB=x HARNESS_PORT_BASE=44xxx HARNESS_TMP_PREFIX=/tmp/x \
 *     node --experimental-strip-types tests/test-rx25-race-probe.mts [iterations]
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { POSTGREST_URL, SERVICE_KEY, PORTS, assertMockOwner, startPostgrest, psqlSuper, tmpPath } from "./harness/stack.mts";
import {
  DEFAULT_WA_SESSION_SECRET,
  armCheckout,
  newIdempotencyKey,
  waSessionCookie,
} from "./helpers/checkout-arm.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");
const ITER = Number(process.argv[2] || 200);

const APP_PORT = Number(process.env.HARNESS_W4_APP_PORT || PORTS.w4App);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || PORTS.w4Mock);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
const ORDERS_FILE = process.env.MOCK_SCALEV_ORDERS_FILE || tmpPath("rx25-orders.json");
const CANCEL_FILE = process.env.MOCK_SCALEV_CANCEL_FILE || tmpPath("rx25-cancel.json");
const CANCEL_MODE_FILE = process.env.MOCK_SCALEV_CANCEL_MODE_FILE || tmpPath("rx25-cancel-mode.txt");
const LOG = tmpPath("rx25-server.log");
const OUT_DIR = process.env.RX25_OUT || "/home/ubuntu/w4rx25-evidence";

let pass = 0;
const anomalies: any[] = [];

/** Baca file order mock dengan retry: satu-satunya sumber hitungan order nyata. */
function ordersSettled(tries = 4): any[] {
  for (let i = 0; i < tries; i++) {
    try {
      const raw = fs.readFileSync(ORDERS_FILE, "utf-8");
      if (!raw.trim()) throw new Error("empty");
      return JSON.parse(raw);
    } catch {
      /* retry */
    }
  }
  return [];
}

function livePhones(phone: string): any[] {
  const out = psqlSuper(
    `select id::text || '|' || status || '|' || coalesce(order_id,'') || '|' || idempotency_key || '|' || ` +
      `coalesce(paid_at::text,'') || '|' || created_at::text from checkout_claims ` +
      `where phone='${phone}' order by created_at`,
    { csv: true }
  );
  return out ? out.split("\n") : [];
}

function liveCount(phone: string): number {
  return Number(
    psqlSuper(
      `select count(*) from checkout_claims where phone='${phone}' and paid_at is null ` +
        `and status in ('in_flight','created','cancel_pending','cancel_failed')`,
      { csv: true }
    )
  );
}

async function waitFor(url: string, timeoutMs = 60000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
      last = `status ${res.status}`;
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timed out waiting for ${url}: ${last}`);
}

async function startApp(): Promise<{ stop: () => void }> {
  try {
    fs.truncateSync(LOG, 0);
  } catch {}
  const logFd = fs.openSync(LOG, "a");
  const child = spawn("./node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    cwd: REPO,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      SUPABASE_URL: POSTGREST_URL,
      SUPABASE_SERVICE_KEY: SERVICE_KEY,
      THRIVIN_TENANT_ID: "thrivin",
      WA_SESSION_SECRET: DEFAULT_WA_SESSION_SECRET,
      WA_SESSION_EPOCH: "0",
      SCALEV_API_KEY: "mock-scalev-key-not-real",
      SCALEV_CANCEL_API_KEY: "mock-scalev-cancel-key-not-real",
      SCALEV_API_BASE_URL: MOCK_URL,
    } as Record<string, string>,
    stdio: ["ignore", logFd, logFd],
  });
  await waitFor(`http://127.0.0.1:${APP_PORT}/privacy`);
  return { stop: () => { try { child.kill("SIGKILL"); } catch {} } };
}

let ipSeq = 0;
/** IP unik per permintaan: batas laju per-IP (ipLimit 10) tidak boleh jadi
 *  sumber anomali palsu saat 4 permintaan paralel jatuh di milidetik sama. */
function nextIp(): string {
  ipSeq += 1;
  return `10.88.${Math.floor(ipSeq / 250) % 200}.${(ipSeq % 250) + 1}`;
}

async function createOrder(phone: string, idempotencyKey: string) {
  const ip = nextIp();
  const res = await fetch(`${APP_URL}/api/scalev/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, cookie: waSessionCookie(phone) },
    body: JSON.stringify({ planId: "quarter", customerPhone: phone, idempotencyKey }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function dumpAnomaly(iter: number, phone: string, detail: any) {
  const dumps: Record<string, string> = {};
  try {
    dumps.claims = livePhones(phone).join("\n");
  } catch (e) { dumps.claims = `err ${e}`; }
  try {
    dumps.locks = psqlSuper(
      `select pg_get_serial_sequence('checkout_claims','id') is not null; select locktype || '|' || mode || '|' || granted::text || '|' || coalesce(relation::regclass::text,'') from pg_locks where locktype in ('advisory','transactionid','tuple','relation') order by granted desc limit 40`,
      { csv: true }
    );
  } catch (e) { dumps.locks = `err ${e}`; }
  try {
    dumps.activity = psqlSuper(
      `select pid || '|' || state || '|' || coalesce(wait_event_type,'') || '|' || coalesce(left(query,120),'') from pg_stat_activity where datname = current_database()`,
      { csv: true }
    );
  } catch (e) { dumps.activity = `err ${e}`; }
  try {
    dumps.mock_orders = fs.readFileSync(ORDERS_FILE, "utf-8");
  } catch (e) { dumps.mock_orders = `err ${e}`; }
  try {
    dumps.server_log = fs.readFileSync(LOG, "utf-8").split("\n").slice(-40).join("\n");
  } catch (e) { dumps.server_log = `err ${e}`; }

  fs.mkdirSync(`${OUT_DIR}/anomalies`, { recursive: true });
  const file = `${OUT_DIR}/anomalies/iter-${iter}.txt`;
  fs.writeFileSync(
    file,
    [
      `# RX2-5 anomaly at iteration ${iter} (phone ${phone})`,
      `# detail: ${JSON.stringify(detail, null, 2)}`,
      `\n## checkout_claims (id|status|order_id|key|paid_at|created_at)\n${dumps.claims}`,
      `\n## pg_locks\n${dumps.locks}`,
      `\n## pg_stat_activity\n${dumps.activity}`,
      `\n## mock orders file\n${dumps.mock_orders}`,
      `\n## app server log (tail)\n${dumps.server_log}`,
    ].join("\n")
  );
  anomalies.push({ iter, phone, detail, file });
  console.log(`  !! ANOMALI iter ${iter} phone ${phone}: ${JSON.stringify(detail)} -> ${file}`);
}

async function main() {
  // DB: dipakai sebagaimana dipilih pemanggil (HARNESS_PG_DB); seed dibuat di luar.
  // RX25_KEEP=1 melewati TRUNCATE kalau mau mengukur pengaruh tabel yang sudah
  // besar (baris lama, bloat) terhadap lebar jendela.
  if (process.env.RX25_KEEP !== "1") {
    psqlSuper("TRUNCATE consent_events, onboarding_progress, checkout_claims RESTART IDENTITY CASCADE;");
  }

  const mock = spawn(process.execPath, [path.join(HERE, "mock-scalev.mjs"), String(MOCK_PORT)], {
    env: {
      ...process.env,
      MOCK_SCALEV_PORT: String(MOCK_PORT),
      MOCK_SCALEV_ORDERS_FILE: ORDERS_FILE,
      MOCK_SCALEV_CANCEL_FILE: CANCEL_FILE,
      MOCK_SCALEV_CANCEL_MODE_FILE: CANCEL_MODE_FILE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  mock.stderr.on("data", (d) => process.stderr.write(`[mock-scalev] ${d}`));
  await assertMockOwner(MOCK_PORT, mock.pid);
  await waitFor(`http://127.0.0.1:${MOCK_PORT}/v3/orders?x=1`).catch(() => {});
  const postgrest = await startPostgrest();
  const app = await startApp();

  const started = Date.now();
  try {
    for (let iter = 1; iter <= ITER; iter++) {
      const phone = `6281299${String(10000 + iter)}`; // 6281299 + 5 digit = 12 digit, dummy
      await armCheckout({ base: APP_URL, phone, cookie: waSessionCookie(phone) });
      const keys = [newIdempotencyKey("order"), newIdempotencyKey("other1"), newIdempotencyKey("other2"), newIdempotencyKey("other3")];
      const before = ordersSettled().length;
      // RX25_STAGGER_MS > 0: permintaan kunci baru diberangkatkan TERLAMBAT
      // (jitter) supaya klaimnya bisa jatuh tepat di sekitar commit `complete`
      // milik pemegang kunci pertama — jendela yang di produksi dibuka oleh
      // jitter penjadwalan. 0 = perilaku asli (4 paralel sekaligus).
      const stagger = Number(process.env.RX25_STAGGER_MS || 0);
      const results = stagger > 0
        ? await (async () => {
            const first = await createOrder(phone, keys[0]);
            await new Promise((r) => setTimeout(r, Math.floor(Math.random() * stagger)));
            const rest = await Promise.all(keys.slice(1).map((k) => createOrder(phone, k)));
            return [first, ...rest];
          })()
        : await Promise.all(keys.map((k) => createOrder(phone, k)));
      const after = ordersSettled().length;

      const created = after - before;
      const ok200 = results.filter((r) => r.status === 200);
      const distinctIds = new Set(ok200.map((r) => r.body?.orderId));
      const badStatus = results.filter((r) => r.status !== 200 && r.status !== 409);
      const badCode = results.filter((r) => r.status === 409 && r.body?.code !== "ORDER_IN_FLIGHT");
      const live = liveCount(phone);

      const problems: string[] = [];
      if (created !== 1) problems.push(`order_tercetak=${created} (harus 1)`);
      if (ok200.length < 1) problems.push(`nol jawaban 200`);
      if (distinctIds.size !== 1) problems.push(`order_id_berbeda=${distinctIds.size} -> ${JSON.stringify([...distinctIds])}`);
      if (badStatus.length) problems.push(`status_aneh=${JSON.stringify(badStatus.map((r) => r.status))}`);
      if (badCode.length) problems.push(`409_bukan_inflight=${JSON.stringify(badCode.map((r) => r.body?.code))}`);
      if (live !== 1) problems.push(`klaim_hidup_db=${live} (harus 1)`);

      if (problems.length) {
        dumpAnomaly(iter, phone, {
          problems,
          statuses: results.map((r) => `${r.status}:${r.body?.code ?? r.body?.orderId ?? ""}`),
          created,
          distinct_ids: [...distinctIds],
          live,
        });
      } else {
        pass++;
      }
      if (iter % 25 === 0) {
        const rate = ((Date.now() - started) / iter / 1000).toFixed(2);
        console.log(`iter ${iter}/${ITER} — bersih ${pass}, anomali ${anomalies.length} (${rate}s/iter)`);
      }
    }
  } finally {
    app.stop();
    postgrest?.stop();
    try { mock.kill("SIGKILL"); } catch {}
  }

  const summary = {
    iterations: ITER,
    clean: pass,
    anomalies: anomalies.length,
    seconds: Math.round((Date.now() - started) / 1000),
    orders_file: ORDERS_FILE,
    db: process.env.HARNESS_PG_DB,
    port_base: process.env.HARNESS_PORT_BASE,
    anomaly_files: anomalies.map((a) => a.file),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const name = process.env.RX25_TAG || "probe";
  fs.writeFileSync(`${OUT_DIR}/probe-${name}.json`, JSON.stringify(summary, null, 2));
  console.log(`\nRX2-5 probe (${name}): ${pass}/${ITER} bersih, ${anomalies.length} anomali`);
  console.log(`ringkasan: ${OUT_DIR}/probe-${name}.json`);
  process.exit(anomalies.length ? 1 : 0);
}

main().catch((err) => {
  console.error("probe gagal:", err);
  process.exit(2);
});
