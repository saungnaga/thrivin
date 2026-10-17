/**
 * RX2-5 probe mode B (kartu t_370981ec) — jendela sinkronisasi DETERMINISTIK
 * untuk asersi "dua kunci berbeda paralel" di tests/test-consent-gate-e2e.mts.
 *
 * Kalau probe frekuensi (test-rx25-race-probe.mts) mengukur seberapa sering
 * dua order bisa tercetak, probe ini MEMAKSA jendelanya terbuka dan menanyakan
 * satu hal: apakah INSERT klaim B ditahan index per-nomor?
 *
 * Jendela yang dipaksa (persis akar yang didokumentasikan di komit 7d8389d):
 *   request A: klaim 'in_flight' → Scalev → complete_checkout_claim(A) DITAHAN
 *              terbuka (BEGIN ... pg_sleep ... COMMIT) ⇒ baris A sudah 'created'
 *              tapi belum commit;
 *   request B: kunci BEDA, nomor sama, lewat jalur app yang sebenarnya
 *              (POST /api/scalev/create-order).
 *
 * Di HEAD (index `uq_checkout_claims_live_phone` mencakup 'created' belum-dibayar)
 * B harus TERTAHAN lalu dijawab 409 ORDER_IN_FLIGHT, nol order baru, satu baris
 * klaim hidup. Dengan index pra-fix (`WHERE status='in_flight'`) B lolos ⇒ order
 * kedua tercetak — itu yang direproduksi di sini sebagai bukti mekanisme.
 *
 *   HARNESS_PG_DB=x HARNESS_PORT_BASE=45xxx HARNESS_TMP_PREFIX=/tmp/x \
 *     node --experimental-strip-types tests/test-rx25-window-probe.mts [rounds]
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { POSTGREST_URL, SERVICE_KEY, PG_DB, PORTS, assertMockOwner, startPostgrest, psqlSuper, tmpPath } from "./harness/stack.mts";
import {
  DEFAULT_WA_SESSION_SECRET,
  TERMS_VERSION,
  armCheckout,
  newIdempotencyKey,
  waSessionCookie,
} from "./helpers/checkout-arm.mts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");
const ROUNDS = Number(process.argv[2] || 10);

const APP_PORT = Number(process.env.HARNESS_W4_APP_PORT || PORTS.w4App);
const MOCK_PORT = Number(process.env.MOCK_SCALEV_PORT || PORTS.w4Mock);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
const ORDERS_FILE = process.env.MOCK_SCALEV_ORDERS_FILE || tmpPath("rx25w-orders.json");
const CANCEL_FILE = process.env.MOCK_SCALEV_CANCEL_FILE || tmpPath("rx25w-cancel.json");
const CANCEL_MODE_FILE = process.env.MOCK_SCALEV_CANCEL_MODE_FILE || tmpPath("rx25w-cancel-mode.txt");
const LOG = tmpPath("rx25w-server.log");
const OUT_DIR = process.env.RX25_OUT || "/home/ubuntu/w4rx25-evidence";
const TAG = process.env.RX25_TAG || "window";
const HOLD_MS = Number(process.env.RX25_HOLD_MS || 2500);

function psql(sql: string, csv = true): string {
  return psqlSuper(sql, { csv });
}

function orders(): any[] {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function claimRows(phone: string): string {
  return psql(
    `select id||'|'||status||'|'||coalesce(order_id,'')||'|'||idempotency_key||'|'||coalesce(paid_at::text,'')||'|'||created_at::text from checkout_claims where phone='${phone}' order by created_at`
  );
}

function liveCount(phone: string): number {
  return Number(
    psql(
      `select count(*) from checkout_claims where phone='${phone}' and paid_at is null and status in ('in_flight','created','cancel_pending','cancel_failed')`
    )
  );
}

function activitySnapshot(width = 90): string {
  return psql(
    `select pid||'|'||state||'|'||coalesce(wait_event_type,'-')||'|'||coalesce(wait_event,'-')||'|'||left(regexp_replace(query,'\\s+',' ','g'),${width}) from pg_stat_activity where datname=current_database() order by pid`
  );
}

/**
 * Apakah jendela benar-benar terbuka? Dua pra-syarat, keduanya dari DB:
 *  (a) ada sesi lain yang sedang menahan transaksinya (state aktif, pg_sleep),
 *  (b) baris klaim A TERBACA sebagai 'in_flight' oleh sesi ini — artinya
 *      'created' milik A BELUM commit, jadi langkah 6 B memang tidak melihatnya.
 * Tanpa keduanya, "hijau" bisa datang dari urutan yang kebetulan salah.
 */
function windowOpen(claimId: string): { holding: boolean; visibleStatus: string } {
  const holding = Number(
    psql(
      `select count(*) from pg_stat_activity where datname=current_database() and state='active' and query ilike '%pg_sleep%'`
    )
  );
  const visibleStatus = psql(`select status from checkout_claims where id='${claimId}'`);
  return { holding: holding > 0, visibleStatus };
}

function indexDefinition(): string {
  return psql(
    `select coalesce((select indexdef from pg_indexes where indexname='uq_checkout_claims_live_phone'),'TIDAK ADA')`
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
    await new Promise((r) => setTimeout(r, 250));
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

async function createOrder(phone: string, idempotencyKey: string) {
  const ip = `10.99.${(Date.now() % 200) + 1}.${(Date.now() % 250) + 1}`;
  const res = await fetch(`${APP_URL}/api/scalev/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, cookie: waSessionCookie(phone) },
    body: JSON.stringify({ planId: "quarter", customerPhone: phone, idempotencyKey }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Tahan complete_checkout_claim(A) terbuka di transaksi lain. */
function holdCompleteOpen(claimId: string): ReturnType<typeof spawn> {
  const sql =
    `BEGIN; SELECT complete_checkout_claim('${claimId}','order-hold-A','https://thrivin.myscalev.com/pay/hold-A',219000,'uuid-hold-A'); ` +
    `SELECT pg_sleep(${(HOLD_MS / 1000).toFixed(2)}); COMMIT;`;
  return spawn("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", PG_DB, "-q", "-c", sql], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const observations: any[] = [];

async function main() {
  psqlSuper("TRUNCATE consent_events, onboarding_progress, checkout_claims RESTART IDENTITY CASCADE;");
  console.log(`index per-nomor sekarang: ${indexDefinition()}`);

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

  try {
    for (let round = 1; round <= ROUNDS; round++) {
      const phone = `6281288${String(10000 + round)}`;
      await armCheckout({ base: APP_URL, phone, cookie: waSessionCookie(phone) });
      const keyA = newIdempotencyKey("winA");
      const keyB = newIdempotencyKey("winB");

      // 1. Klaim A langsung lewat RPC (autocommit) — jalur yang sama dengan app.
      const claimA = psql(
        `select claim_checkout_order('${phone}', ARRAY[2,3,4,5,6,7,8], 'quarter', '${TERMS_VERSION}', '${keyA}')::text`
      );
      const claimAJson = JSON.parse(claimA.split("\n").pop() as string);
      if (claimAJson.status !== "granted") {
        console.log(`round ${round}: pra-syarat A gagal (${claimAJson.status}) — dilewati`);
        continue;
      }

      // 2. Tahan complete(A) terbuka + 3. tunggu jendela benar-benar terbuka.
      const holder = holdCompleteOpen(String(claimAJson.claim_id));
      let holderErr = "";
      holder.stderr?.on("data", (d) => (holderErr += String(d)));
      let preconditions = false;
      let visibleStatus = "";
      const waitStart = Date.now();
      while (Date.now() - waitStart < 8000) {
        const win = windowOpen(String(claimAJson.claim_id));
        visibleStatus = win.visibleStatus;
        if (win.holding && win.visibleStatus === "in_flight") {
          preconditions = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      if (!preconditions) {
        console.log(
          `round ${round}: JENDELA TIDAK TERBUKA (holding=false/status=${visibleStatus || "-"}) stderr holder=${holderErr.slice(0, 200)} — putaran tidak sah`
        );
        try { holder.kill(); } catch {}
        observations.push({ round, phone, verdict: "PRA-SYARAT GAGAL", holder_stderr: holderErr.slice(0, 300) });
        continue;
      }

      const before = orders().length;
      // 4. Request B lewat app, sementara A menahan complete-nya.
      const startedB = Date.now();
      const samples: string[] = [];
      const sampler = setInterval(() => {
        try {
          const a = activitySnapshot();
          if (/claim_checkout_order|complete_checkout_claim|pg_sleep/.test(a)) samples.push(a);
        } catch {}
      }, 60);
      const b = await createOrder(phone, keyB);
      const latency = Date.now() - startedB;
      clearInterval(sampler);
      const created = orders().length - before;

      // 5. Tutup jendela, lalu ukur keadaan akhir.
      await new Promise((r) => setTimeout(r, HOLD_MS + 400));
      try { holder.kill(); } catch {}
      const live = liveCount(phone);
      const rows = claimRows(phone);
      const locks = psql(
        `select l.locktype||'|'||l.mode||'|'||l.granted::text||'|'||coalesce(c.relname,'-') from pg_locks l left join pg_class c on c.oid=l.relation where c.relname='checkout_claims' or l.locktype='advisory'`
      );

      const leak = created > 0 || live > 1;
      const obs = {
        round,
        phone,
        precondition_A_holding: preconditions,
        /** 'in_flight' dari sesi lain = 'created' milik A memang belum commit. */
        a_status_visible_to_others: visibleStatus,
        holder_stderr: holderErr.slice(0, 300),
        b_status: b.status,
        b_code: b.body?.code ?? null,
        b_orderId: b.body?.orderId ?? null,
        b_latency_ms: latency,
        orders_created: created,
        live_claims: live,
        verdict: leak ? "KEBOCORAN: order/klaim kedua lahir" : "ditahan",
        blocked_observed: samples.some((s) => /Lock/.test(s)),
        activity_during_B: samples[samples.length - 1] || "",
        locks_after: locks,
        claims: rows,
      };
      observations.push(obs);
      console.log(
        `round ${round}: A menahan=${preconditions} B=${b.status}:${obs.b_code} latensi=${latency}ms order_baru=${created} klaim_hidup=${live} -> ${obs.verdict}`
      );

      if (leak) {
        fs.mkdirSync(`${OUT_DIR}/anomalies`, { recursive: true });
        fs.writeFileSync(
          `${OUT_DIR}/anomalies/${TAG}-window-round-${round}.txt`,
          [
            `# RX2-5 window probe — kebocoran pada putaran ${round} (phone ${phone})`,
            `index: ${indexDefinition()}`,
            `\n## observasi\n${JSON.stringify(obs, null, 2)}`,
            `\n## checkout_claims (id|status|order_id|key|paid_at|created_at)\n${rows}`,
            `\n## pg_locks (locktype|mode|granted|relation)\n${locks}`,
            `\n## pg_stat_activity saat B berjalan\n${obs.activity_during_B}`,
            `\n## mock orders file\n${fs.readFileSync(ORDERS_FILE, "utf-8")}`,
            `\n## app server log (tail)\n${fs.readFileSync(LOG, "utf-8").split("\n").slice(-30).join("\n")}`,
          ].join("\n")
        );
      }
    }
  } finally {
    app.stop();
    postgrest?.stop();
    try { mock.kill("SIGKILL"); } catch {}
  }

  const leaks = observations.filter((o) => o.verdict.startsWith("KEBOCORAN")).length;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    tag: TAG,
    rounds: observations.length,
    leaks,
    index_definition: indexDefinition(),
    db: PG_DB,
    port_base: process.env.HARNESS_PORT_BASE,
    observations,
  };
  fs.writeFileSync(`${OUT_DIR}/window-${TAG}.json`, JSON.stringify(summary, null, 2));
  console.log(`\nRX2-5 window probe (${TAG}): ${leaks} kebocoran dari ${observations.length} putaran`);
  console.log(`ringkasan: ${OUT_DIR}/window-${TAG}.json`);
}

main().catch((err) => {
  console.error("probe gagal:", err);
  process.exit(2);
});
