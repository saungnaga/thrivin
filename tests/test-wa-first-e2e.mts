/**
 * End-to-end tests untuk slice WA-first (kartu W3 t_86bf9739).
 *
 *   node --experimental-strip-types tests/test-wa-first-e2e.mts
 *
 * Stack: Next.js (production build) -> HTTP -> PostgREST -> Postgres lokal,
 * dengan provider OTP MOCK (tidak ada outbound WhatsApp). Tidak ada staging,
 * tidak ada produksi, tidak ada data customer.
 *
 * Bukti per item:
 *   privasi nomor telanjang -> jawaban langkah pertama IDENTIK untuk nomor yang
 *                              ada dan yang tidak ada; tanpa nama/status/tanggal
 *   OTP abuse               -> kode salah, batas percobaan, kedaluwarsa, kode
 *                              diganti permintaan baru, 3 percobaan paralel = 1 lolos
 *   resend/cooldown         -> ditegakkan di RPC (bukan di TS); kuota per jam
 *                              diuji lewat /api/wa/session/request dengan nilai
 *                              DEFAULT app (F-1)
 *   format nomor tersimpan  -> `users.phone` `+62…`/`0812…`/berspasi tetap
 *                              terbaca (F-4)
 *   session swap            -> phone/amount/user_id dari client diabaikan; kode
 *                              nomor A tidak bisa dipakai untuk nomor B
 *   sesi terpisah           -> cookie admin TIDAK diterima di endpoint pelanggan;
 *                              token dipalsukan / epoch lain / kedaluwarsa -> 401
 *   batas aktif/nonaktif    -> aktif: sisa masa aktif + CTA; kedaluwarsa 8 hari:
 *                              kandidat; TEPAT 7 hari: TIDAK eligible
 *   promo                   -> kandidat dibaca dari tabel promo (sumber yang ada);
 *                              tidak ada aktivasi/klaim (0 baris redemption)
 *   admin bypass            -> nomor allowlist admin tanpa langganan tetap 'none'
 *   gagal-tertutup          -> DB mati / provider OTP tidak dikonfigurasi -> 503
 *                              generik TANPA field state (bukan "nomor baru");
 *                              mock DITOLAK saat NODE_ENV=production (F-2)
 *   RPC sempit              -> anon/authenticated DITOLAK; jalur baca tidak menulis
 *   UI                      -> markup keyboard/mobile (label, inputmode, aria-live)
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn, execFileSync } from "child_process";
import {
  ANON_KEY,
  SERVICE_KEY,
  POSTGREST_URL,
  startPostgrest,
  psqlSuper,
} from "./harness/stack.mts";
import {
  catalogPlans,
  REACTIVATION_CANDIDATE_CODE,
} from "../src/lib/renewal.ts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const APP_PORT = Number(process.env.HARNESS_WA_APP_PORT || 3986);
const BROKEN_APP_PORT = Number(process.env.HARNESS_WA_BROKEN_APP_PORT || 3987);
const NOPROVIDER_APP_PORT = Number(process.env.HARNESS_WA_NOPROVIDER_PORT || 3985);
/** Instance dengan KUOTA DEFAULT app (WA_OTP_MAX_PER_HOUR tidak di-set → 5). */
const QUOTA_APP_PORT = Number(process.env.HARNESS_WA_QUOTA_PORT || 3988);
/** Instance produksi + provider mock TANPA pintu darurat (harus gagal-tertutup). */
const MOCKPROD_APP_PORT = Number(process.env.HARNESS_WA_MOCKPROD_PORT || 3989);
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const BROKEN_URL = `http://127.0.0.1:${BROKEN_APP_PORT}`;
const NOPROVIDER_URL = `http://127.0.0.1:${NOPROVIDER_APP_PORT}`;
const QUOTA_URL = `http://127.0.0.1:${QUOTA_APP_PORT}`;
const MOCKPROD_URL = `http://127.0.0.1:${MOCKPROD_APP_PORT}`;

const WA_SESSION_SECRET = "wa-first-e2e-session-secret-0123456789-abc";
const WA_OTP_SECRET = "wa-first-e2e-otp-secret-0123456789-abcdef-Z";
const ADMIN_USER = "promo-admin";
const ADMIN_PASS = "promo-admin-pass-1234";
const ADMIN_SECRET = "promo-session-secret-at-least-32-chars-long";

const SINK = "/tmp/thrivin-wa-first-otp-sink.jsonl";
/** Sink terpisah: instance kuota default (F-1) dan instance mock-di-produksi. */
const QUOTA_SINK = "/tmp/thrivin-wa-first-quota-sink.jsonl";
const MOCKPROD_SINK = "/tmp/thrivin-wa-first-mockprod-sink.jsonl";
const LOG_FILE = "/tmp/thrivin-wa-first-server.log";
const BROKEN_LOG = "/tmp/thrivin-wa-first-broken.log";
const NOPROVIDER_LOG = "/tmp/thrivin-wa-first-noprovider.log";
const QUOTA_LOG = "/tmp/thrivin-wa-first-quota.log";
const MOCKPROD_LOG = "/tmp/thrivin-wa-first-mockprod.log";
/** Port yang tidak ada apa-apa: mensimulasikan Supabase/upstream mati. */
const DEAD_SUPABASE = "http://127.0.0.1:59997";

const results: Array<[string, string]> = [];
function record(ok: boolean, name: string, detail = "") {
  results.push([ok ? "PASS" : "FAIL", detail ? `${name} — ${detail}` : name]);
}
function assertOk(cond: boolean, name: string, detail = "") {
  record(Boolean(cond), name, cond ? "" : detail);
}
function assertEq(actual: unknown, expected: unknown, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  record(ok, name, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertNotEq(actual: unknown, forbidden: unknown, name: string) {
  const ok = JSON.stringify(actual) !== JSON.stringify(forbidden);
  record(ok, name, ok ? "" : `nilai terlarang: ${JSON.stringify(actual)}`);
}
function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ── nomor dummy (bukan data siapa pun) ──────────────────────────────────────
const P = {
  none: "6281200000001",
  active: "6281200000002",
  expired8d: "6281200000003",
  exact7d: "6281200000004",
  over7d: "6281200000005",
  adminOnly: "6281200000006",
  staleActive: "6281200000007",
  /** Nomor aktif terpisah: satu nomor dibatasi 3 permintaan kode per menit. */
  active2: "6281200000008",
  /** Nomor khusus uji batas laju. */
  rateLimited: "6281200000009",
};

const CANONICAL_PLANS = catalogPlans();

async function waitFor(url: string, timeoutMs = 60000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return res;
      last = `status ${res.status}`;
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}: ${last}`);
}

interface Stack {
  stop: () => void;
}

async function startApp(
  env: Record<string, string | undefined> = {},
  port: number = APP_PORT,
  logFile: string = LOG_FILE
): Promise<Stack> {
  try {
    fs.truncateSync(logFile, 0);
  } catch {}
  const logFd = fs.openSync(logFile, "a");
  // `undefined` = benar-benar TIDAK di-set (bukan string "undefined"): dipakai
  // untuk menguji nilai default app dan jalur gagal-tertutup.
  const merged: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    SUPABASE_URL: POSTGREST_URL,
    SUPABASE_SERVICE_KEY: SERVICE_KEY,
    THRIVIN_TENANT_ID: "thrivin",
    WA_SESSION_SECRET,
    WA_SESSION_EPOCH: "0",
    WA_OTP_SECRET,
    WA_OTP_PROVIDER: "mock",
    WA_OTP_MOCK_SINK: SINK,
    // Build produksi + provider mock = pintu darurat eksplisit (F-2).
    WA_OTP_MOCK_ALLOW_IN_PRODUCTION: "1",
    WA_OTP_MIN_INTERVAL_SECONDS: "0",
    WA_OTP_MAX_PER_HOUR: "3",
    ADMIN_USERNAME: ADMIN_USER,
    ADMIN_PASSWORD: ADMIN_PASS,
    ADMIN_SESSION_SECRET: ADMIN_SECRET,
    NINA_ADMIN_PHONES: P.adminOnly,
    ...env,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  const child = spawn("./node_modules/.bin/next", ["start", "-p", String(port)], {
    cwd: REPO,
    env: merged as Record<string, string>,
    stdio: ["ignore", logFd, logFd],
  });
  await waitFor(`http://127.0.0.1:${port}/companion/nina/status`);
  return {
    stop: () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    },
  };
}

interface Client {
  call: (pathname: string, init?: RequestInit) => Promise<{ status: number; body: any; raw: string }>;
  cookie: () => string;
  setCookie: (value: string) => void;
}

function makeClient(base = BASE_URL): Client {
  let cookie = "";
  return {
    async call(pathname, init = {}) {
      const extra = (init.headers as Record<string, string>) || {};
      const res = await fetch(`${base}${pathname}`, {
        ...init,
        headers: {
          ...extra,
          ...(cookie ? { cookie } : {}),
          "X-Forwarded-For": `10.99.${(Date.now() % 200) + 1}.${(Date.now() % 250) + 1}`,
        },
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie && !extra["X-Keep-Cookie"]) cookie = setCookie.split(";")[0];
      const raw = await res.text();
      let body: any = null;
      try {
        body = JSON.parse(raw);
      } catch {}
      return { status: res.status, body, raw };
    },
    cookie: () => cookie,
    setCookie: (value: string) => {
      cookie = value;
    },
  };
}

function sign(name: string) {
  return crypto.createHmac("sha256", WA_SESSION_SECRET).update(name).digest("base64url");
}

/** Token sesi yang valid secara HMAC dengan isi yang kita tentukan. */
function craftToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = WA_SESSION_SECRET;
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function sinkEntries(file: string = SINK): Array<{ phone: string; code: string }> {
  try {
    return fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function lastCodeFor(phone: string): string | null {
  const match = sinkEntries().filter((e) => e.phone === phone).slice(-1)[0];
  return match?.code ?? null;
}

function countRows(table: string, where = "TRUE"): number {
  return Number(psqlSuper(`SELECT count(*) FROM ${table} WHERE ${where};`, { csv: true }));
}

function insertUser(phone: string, name: string): string {
  return psqlSuper(
    `INSERT INTO users (phone, name) VALUES ('${phone}', '${name}') RETURNING id;`,
    { csv: true }
  )
    .split("\n")[0]
    .trim();
}

function insertSubscription(userId: string, status: string, expiresExpr: string, planId = 2): void {
  psqlSuper(
    `INSERT INTO subscriptions (user_id, plan_id, status, started_at, expires_at, token_limit)
     VALUES ('${userId}', ${planId}, '${status}', now() - interval '90 days', ${expiresExpr}, 500000);`
  );
}

async function loginAdmin(): Promise<Client> {
  const admin = makeClient();
  const res = await admin.call("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  return res.status === 200 ? admin : (null as unknown as Client);
}

/** Daftar field yang BOLEH keluar dari endpoint status. */
const ALLOWED_STATUS_FIELDS = [
  "ok",
  "state",
  "expiresAt",
  "remainingMs",
  "lastPlanKey",
  "maskedPhone",
  "renewal",
  "renewalActivationEnabled",
];

async function main() {
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  for (const file of [SINK, QUOTA_SINK, MOCKPROD_SINK]) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }

  const postgrest = await startPostgrest();
  if (!postgrest) {
    console.error("PostgREST binary missing — cannot run the WA-first e2e suite.");
    process.exit(1);
  }
  let app: Stack | null = null;
  let broken: Stack | null = null;
  let noprovider: Stack | null = null;
  let quota: Stack | null = null;
  let mockprod: Stack | null = null;

  try {
    // ── data dummy ─────────────────────────────────────────────────────────
    psqlSuper("TRUNCATE wa_otp_challenges, subscriptions, users RESTART IDENTITY CASCADE;");
    psqlSuper("DELETE FROM promo_redemptions;");
    psqlSuper(
      `INSERT INTO promo_codes (tenant_id, code, discount_type, amount, plan_keys, is_active)
       VALUES ('thrivin', '${REACTIVATION_CANDIDATE_CODE}', 'percentage', 20,
               ARRAY['quarter','half','year'], true)
       ON CONFLICT (tenant_id, code) DO UPDATE SET amount = 20, is_active = true;`
    );

    const idNone = insertUser(P.none, "Dummy None");
    const idActive = insertUser(P.active, "Dummy Active");
    const idExpired = insertUser(P.expired8d, "Dummy Expired");
    const idExact7 = insertUser(P.exact7d, "Dummy Exact7");
    const idOver7 = insertUser(P.over7d, "Dummy Over7");
    const idAdmin = insertUser(P.adminOnly, "Dummy Admin");
    const idStale = insertUser(P.staleActive, "Dummy Stale");
    void idNone;

    const idActive2 = insertUser(P.active2, "Dummy Active 2");
    insertSubscription(idActive2, "active", "now() + interval '5 days'");
    insertUser(P.rateLimited, "Dummy Rate");

    insertSubscription(idActive, "active", "now() + interval '20 days'");
    insertSubscription(idExpired, "expired", "now() - interval '8 days'");
    // Tepat 7×24 jam (dengan margin 30 detik ke sisi "belum lewat").
    insertSubscription(idExact7, "expired", "now() - interval '168 hours' + interval '30 seconds'");
    insertSubscription(idOver7, "expired", "now() - interval '168 hours' - interval '30 seconds'");
    insertSubscription(idAdmin, "expired", "now() - interval '30 days'");
    // status masih 'active' tapi sudah lewat -> untuk bukti jalur baca tidak menulis
    insertSubscription(idStale, "active", "now() - interval '2 days'");

    app = await startApp();

    // ══ 1. Privasi nomor telanjang ═════════════════════════════════════════
    section("Privasi nomor telanjang (langkah pertama)");
    const anon = makeClient();
    const reqNone = await anon.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "0812-0000-00001" }),
    });
    const reqKnown = await anon.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "081200000002" }),
    });
    assertEq(reqNone.status, 200, "privasi: nomor tanpa langganan -> 200 generik");
    assertEq(reqKnown.status, 200, "privasi: nomor dengan langganan aktif -> 200 generik");
    assertEq(
      reqKnown.body,
      reqNone.body,
      "privasi: bentuk body IDENTIK untuk nomor ada vs tidak ada"
    );
    assertEq(Object.keys(reqNone.body).sort(), ["message", "ok"], "privasi: body hanya {ok,message}");
    const leakFields = ["state", "expires", "plan", "name", "token", "remaining"];
    for (const field of leakFields) {
      assertOk(
        !reqNone.raw.toLowerCase().includes(field),
        `privasi: jawaban tidak memuat "${field}"`
      );
    }
    assertOk(
      sinkEntries().length === 2,
      "privasi: provider mock menerima 2 kiriman (satu per permintaan)",
      `sink=${sinkEntries().length}`
    );
    assertOk(
      sinkEntries().every((e) => e.phone.startsWith("62")),
      "privasi: nomor yang dikirim sudah ternormalisasi 62…"
    );
    assertOk(
      !reqKnown.raw.includes(lastCodeFor(P.active) || "***"),
      "privasi: kode OTP tidak pernah ikut di jawaban HTTP"
    );

    const invalid = await anon.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "123" }),
    });
    assertEq(invalid.status, 400, "privasi: nomor tidak valid -> 400 (bukan disubstitusi)");

    const limited = await anon.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: P.none }),
    });
    assertEq(limited.status, 200, "privasi: permintaan kedua untuk nomor sama masih 200");

    // Batas laju per nomor: 3 permintaan/menit -> yang ke-4 ditolak.
    let rateStatus = 0;
    for (let i = 0; i < 3; i += 1) {
      rateStatus = (
        await anon.call("/api/wa/session/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: P.rateLimited }),
        })
      ).status;
      if (i < 2) {
        assertEq(rateStatus, 200, `privasi: permintaan kode #${i + 1} -> 200`);
      }
    }
    assertOk(rateStatus === 200 || rateStatus === 429, "privasi: 3 permintaan pertama dijawab");
    const rateLimited4 = await anon.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: P.rateLimited }),
    });
    assertEq(
      rateLimited4.status,
      429,
      "privasi: permintaan ke-4 dalam satu menit -> 429 (batas per nomor)"
    );

    // ══ 2. Race permintaan paralel: satu challenge hidup ═══════════════════
    section("Race permintaan paralel");
    const racePhone = "6281200000100";
    const parallelReqs = await Promise.all(
      [0, 1, 2].map(() =>
        fetch(`${BASE_URL}/api/wa/session/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.77.7.7" },
          body: JSON.stringify({ phone: racePhone }),
        })
      )
    );
    assertOk(
      parallelReqs.every((r) => r.status === 200),
      "race: 3 permintaan paralel semuanya jawaban generik 200"
    );
    assertEq(
      countRows(
        "wa_otp_challenges",
        `phone = '${racePhone}' AND consumed_at IS NULL`
      ),
      1,
      "race: hanya SATU challenge hidup untuk nomor itu"
    );

    // ══ 3. OTP abuse ═══════════════════════════════════════════════════════
    section("OTP abuse");
    const abusePhone = "6281200000101";
    const abuse = makeClient();
    await abuse.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: abusePhone }),
    });
    const goodCode = lastCodeFor(abusePhone);
    assertOk(Boolean(goodCode) && /^[0-9]{6}$/.test(goodCode as string), "otp: kode 6 digit terkirim");

    const wrong = await abuse.call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: abusePhone, code: "000000" === goodCode ? "111111" : "000000" }),
    });
    assertEq(wrong.status, 401, "otp: kode salah -> 401");
    assertEq(
      Object.keys(wrong.body).sort(),
      ["error", "ok"],
      "otp: jawaban gagal TIDAK membocorkan sisa percobaan"
    );

    const shortCode = await abuse.call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: abusePhone, code: "12" }),
    });
    assertEq(shortCode.status, 401, "otp: bentuk kode ngawur -> 401 (bukan oracle bentuk)");

    // Buang sisa percobaan (max 5).
    let lastAbuse: { status: number } = { status: 0 };
    for (let i = 0; i < 5; i += 1) {
      lastAbuse = await abuse.call("/api/wa/session/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: abusePhone, code: "999999" === goodCode ? "999998" : "999999" }),
      });
    }
    assertEq(lastAbuse.status, 429, "otp: percobaan habis -> 429 (bukan percobaan tanpa batas)");

    const afterExhaust = await abuse.call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: abusePhone, code: goodCode }),
    });
    assertEq(afterExhaust.status, 401, "otp: kode BENAR tetap ditolak setelah batas percobaan");

    // Kode dibuat ulang -> kode lama mati (single-use + rotasi).
    const rotatePhone = "6281200000102";
    const rot = makeClient();
    await rot.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: rotatePhone }),
    });
    const firstCode = lastCodeFor(rotatePhone);
    await rot.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: rotatePhone }),
    });
    const secondCode = lastCodeFor(rotatePhone);
    assertNotEq(secondCode, firstCode, "otp: permintaan baru menerbitkan kode baru");
    const stale = await rot.call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: rotatePhone, code: firstCode }),
    });
    assertEq(stale.status, 401, "otp: kode LAMA mati setelah permintaan baru");

    const okVerify = await rot.call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: rotatePhone, code: secondCode }),
    });
    assertEq(okVerify.status, 200, "otp: kode terbaru -> 200 + sesi");
    assertOk(okVerify.body?.verified === true, "otp: jawaban sukses menandai verified");
    assertOk(
      (rot.cookie() || "").includes("thrivin_wa_session="),
      "otp: cookie sesi pelanggan di-set"
    );

    const replay = await rot.call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: rotatePhone, code: secondCode }),
    });
    assertEq(replay.status, 401, "otp: kode yang sama TIDAK bisa dipakai dua kali (single-use)");

    // Tiga verifikasi PARALEL dengan kode yang sama -> tepat satu lolos.
    const raceVerifyPhone = "6281200000103";
    const rv = makeClient();
    await rv.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: raceVerifyPhone }),
    });
    const raceCode = lastCodeFor(raceVerifyPhone);
    const parallelVerifies = await Promise.all(
      [0, 1, 2].map(() =>
        fetch(`${BASE_URL}/api/wa/session/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.66.6.6" },
          body: JSON.stringify({ phone: raceVerifyPhone, code: raceCode }),
        })
      )
    );
    assertEq(
      parallelVerifies.filter((r) => r.status === 200).length,
      1,
      "otp: 3 verifikasi paralel = tepat 1 x 200 (single-use atomik)"
    );

    // Kedaluwarsa: challenge mati ditolak (dan ditandai terpakai).
    const expiredPhone = "6281200000104";
    psqlSuper(
      `INSERT INTO wa_otp_challenges (tenant_id, phone, code_hash, expires_at)
       VALUES ('thrivin', '${expiredPhone}', 'deadbeef', now() - interval '1 minute');`
    );
    const expiredTry = await anon.call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: expiredPhone, code: "123456" }),
    });
    assertEq(expiredTry.status, 401, "otp: challenge kedaluwarsa -> 401");
    assertEq(
      countRows("wa_otp_challenges", `phone = '${expiredPhone}' AND consumed_at IS NULL`),
      0,
      "otp: challenge kedaluwarsa ditandai terpakai (tidak menyisakan jalur hidup)"
    );

    // ══ 4. Batas resend/cooldown ditegakkan SERVER-side (RPC) ══════════════
    section("Batas resend server-side");
    const rpcHeaders = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    };
    const cooldownPhone = "6281200000110";
    const issueRpc = (phone: string, minInterval: number, maxPerHour: number, hash: string) =>
      fetch(`${POSTGREST_URL}/rest/v1/rpc/create_wa_otp_challenge`, {
        method: "POST",
        headers: rpcHeaders,
        body: JSON.stringify({
          p_phone: phone,
          p_code_hash: hash,
          p_ttl_seconds: 300,
          p_min_interval_seconds: minInterval,
          p_max_per_hour: maxPerHour,
          p_ip_hash: null,
          p_tenant_id: "thrivin",
        }),
      }).then((r) => r.json());

    assertEq(
      (await issueRpc(cooldownPhone, 0, 5, "aaaa"))?.status,
      "created",
      "resend: permintaan pertama -> created"
    );
    const cooldown = await issueRpc(cooldownPhone, 3600, 5, "aaaa");
    assertEq(cooldown?.status, "cooldown", "resend: permintaan dalam interval -> cooldown (server)");
    assertOk(
      Number(cooldown?.retry_after_seconds) > 0,
      "resend: cooldown memberi retry_after_seconds"
    );

    const resendLimit = await issueRpc(racePhone, 0, 1, "bbbb");
    assertEq(resendLimit?.status, "resend_limit", "resend: kuota per jam habis -> resend_limit");

    // ══ 5. Sesi: binding, swap, pemalsuan, pemisahan dari admin ════════════
    section("Sesi: binding & pemisahan dari admin");
    const sessionA = makeClient();
    const reqA = await sessionA.call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: P.active }),
    });
    assertEq(reqA.status, 200, "sesi: minta kode untuk nomor aktif -> 200 generik");
    const codeA = lastCodeFor(P.active);
    const verifyA = await sessionA.call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: P.active, code: codeA }),
    });
    assertEq(verifyA.status, 200, "sesi: verifikasi kode -> 200");

    const statusA = await sessionA.call("/api/wa/subscription");
    assertEq(statusA.status, 200, "sesi: status langganan dengan sesi -> 200");
    assertEq(statusA.body?.state, "active", "sesi: nomor aktif -> state 'active'");
    assertOk(
      (statusA.body?.maskedPhone || "").endsWith(P.active.slice(-4)),
      "sesi: nomor dijawab dalam bentuk ter-mask"
    );

    const swapAttempt = await sessionA.call(
      `/api/wa/subscription?phone=${P.none}&user_id=${idExpired}&amount=1&plan_key=year`
    );
    assertEq(swapAttempt.status, 200, "swap: permintaan dengan phone/user_id palsu tetap 200");
    assertEq(
      swapAttempt.body?.state,
      "active",
      "swap: data yang dikembalikan tetap milik nomor SESI (query diabaikan)"
    );
    assertEq(
      swapAttempt.body?.maskedPhone,
      statusA.body?.maskedPhone,
      "swap: nomor yang dilaporkan tidak bisa ditukar lewat query"
    );

    const crossVerify = await makeClient().call("/api/wa/session/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: P.none, code: codeA }),
    });
    assertEq(crossVerify.status, 401, "swap: kode milik nomor lain tidak bisa ditukar nomor");

    const fresh = makeClient();
    const noSession = await fresh.call("/api/wa/subscription");
    assertEq(noSession.status, 401, "sesi: tanpa cookie -> 401");

    fresh.setCookie("thrivin_wa_session=payload.signature");
    const forged = await fresh.call("/api/wa/subscription");
    assertEq(forged.status, 401, "sesi: token dipalsukan -> 401");

    fresh.setCookie(`thrivin_wa_session=${sign("bukan-token")}`);
    assertEq(
      (await fresh.call("/api/wa/subscription")).status,
      401,
      "sesi: cookie acak ber-HMAC -> 401"
    );

    const expiredToken = craftToken({
      phone: P.active,
      iat: Date.now() - 7200_000,
      exp: Date.now() - 60_000,
      epoch: "0",
    });
    fresh.setCookie(`thrivin_wa_session=${expiredToken}`);
    assertEq((await fresh.call("/api/wa/subscription")).status, 401, "sesi: token kedaluwarsa -> 401");

    const wrongEpochToken = craftToken({
      phone: P.active,
      iat: Date.now(),
      exp: Date.now() + 600_000,
      epoch: "99",
    });
    fresh.setCookie(`thrivin_wa_session=${wrongEpochToken}`);
    assertEq(
      (await fresh.call("/api/wa/subscription")).status,
      401,
      "sesi: token dari epoch lain ditolak (WA_SESSION_EPOCH mencabut semua sesi)"
    );

    const admin = await loginAdmin();
    assertOk(Boolean(admin), "sesi: login admin berhasil (untuk uji pemisahan cookie)");
    if (admin) {
      const adminStatus = await admin.call("/api/wa/subscription");
      assertEq(
        adminStatus.status,
        401,
        "sesi: cookie ADMIN tidak diterima di endpoint pelanggan (secret & cookie terpisah)"
      );
    }

    const logout = await sessionA.call("/api/wa/session", { method: "DELETE" });
    assertEq(logout.status, 200, "sesi: logout -> 200");
    const afterLogout = await sessionA.call("/api/wa/subscription");
    assertEq(afterLogout.status, 401, "sesi: setelah logout -> 401");

    // ══ 6. Batas aktif / nonaktif / eligibility promo ══════════════════════
    section("Batas aktif / nonaktif / kandidat promo");
    async function statusForPhone(phone: string) {
      const client = makeClient();
      await client.call("/api/wa/session/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const code = lastCodeFor(phone);
      const v = await client.call("/api/wa/session/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      assertEq(v.status, 200, `boundary: verifikasi sesi untuk ${phone.slice(-4)}`);
      return client.call("/api/wa/subscription");
    }

    const active = await statusForPhone(P.active);
    assertEq(active.body?.state, "active", "boundary: aktif -> active");
    assertOk(
      Number(active.body?.remainingMs) > 0,
      "boundary: aktif menampilkan sisa masa aktif > 0",
      `remainingMs=${active.body?.remainingMs}`
    );
    assertEq(active.body?.renewal?.eligible, false, "boundary: yang masih aktif bukan kandidat");
    assertEq(
      active.body?.renewal?.plans?.map((p: any) => p.price),
      CANONICAL_PLANS.map((p) => p.price),
      "boundary: harga paket = katalog server (bukan angka client)"
    );

    const eightDays = await statusForPhone(P.expired8d);
    assertEq(eightDays.body?.state, "expired", "boundary: kedaluwarsa 8 hari -> expired");
    assertEq(eightDays.body?.remainingMs, null, "boundary: nonaktif tidak punya sisa masa aktif");
    assertEq(eightDays.body?.renewal?.eligible, true, "boundary: 8 hari nonaktif -> kandidat");
    assertEq(
      eightDays.body?.renewal?.candidate?.code,
      REACTIVATION_CANDIDATE_CODE,
      "boundary: kandidat = kode promo dari tabel promo_codes"
    );
    assertEq(eightDays.body?.renewal?.candidate?.amount, 20, "boundary: kandidat 20% (dari tabel)");

    const exact7 = await statusForPhone(P.exact7d);
    assertEq(exact7.body?.state, "expired", "boundary: tepat 7 hari -> tetap expired");
    assertEq(
      exact7.body?.renewal?.eligible,
      false,
      "boundary: TEPAT 7 hari = TIDAK eligible (batas spec)"
    );
    assertEq(exact7.body?.renewal?.candidate, null, "boundary: tidak eligible -> tanpa kandidat");

    const over7 = await statusForPhone(P.over7d);
    assertEq(over7.body?.renewal?.eligible, true, "boundary: 7 hari + 30 detik -> eligible");

    const none = await statusForPhone(P.none);
    assertEq(none.body?.state, "none", "boundary: tanpa langganan -> none");
    assertEq(none.body?.renewal?.eligible, false, "boundary: nomor baru bukan kandidat reaktivasi");
    assertEq(none.body?.renewal?.candidate, null, "boundary: nomor baru tanpa kandidat");

    // Kandidat hilang kalau baris promonya dinonaktifkan (fail closed).
    psqlSuper(
      `UPDATE promo_codes SET is_active = false WHERE code = '${REACTIVATION_CANDIDATE_CODE}';`
    );
    const inactive = await statusForPhone(P.over7d);
    assertEq(
      inactive.body?.renewal?.candidate,
      null,
      "boundary: baris promo non-aktif -> kandidat null (tidak mengarang angka)"
    );
    psqlSuper(
      `UPDATE promo_codes SET is_active = true WHERE code = '${REACTIVATION_CANDIDATE_CODE}';`
    );

    assertEq(
      Object.keys(eightDays.body).sort(),
      [...ALLOWED_STATUS_FIELDS].sort(),
      "boundary: field yang keluar = daftar minimal (tanpa nama/token/user_id)"
    );

    // ══ 6b. Format nomor tersimpan bisa beda dari `62…` (F-4) ═══════════════
    // Query READ-ONLY staging 2026-10-15: `users.phone` tersimpan `+62…` (5/5
    // baris). RPC lama membandingkan literal `phone = p_phone` → pelanggan lama
    // terbaca `none` (layar bilang "Belum ada langganan" padahal aktif).
    section("Format nomor di users: +62 / 62 / 0812 (F-4)");
    const fmtPlus = "+6281200000130";
    const idFmtPlus = insertUser(fmtPlus, "Dummy Plus62");
    insertSubscription(idFmtPlus, "active", "now() + interval '9 days'");
    const plusStatus = await statusForPhone("6281200000130");
    assertEq(
      plusStatus.body?.state,
      "active",
      "format: baris `+62…` tetap terbaca active lewat sesi `62…`"
    );

    const fmtZero = "081200000131";
    const idFmtZero = insertUser(fmtZero, "Dummy NolDepan");
    insertSubscription(idFmtZero, "active", "now() + interval '9 days'");
    const zeroStatus = await statusForPhone("6281200000131");
    assertEq(
      zeroStatus.body?.state,
      "active",
      "format: baris `0812…` tetap terbaca active lewat sesi `62…`"
    );

    const fmtSpaced = "+62 812-0000-0132";
    const idFmtSpaced = insertUser(fmtSpaced, "Dummy Spasi");
    insertSubscription(idFmtSpaced, "active", "now() + interval '9 days'");
    const spacedStatus = await statusForPhone("6281200000132");
    assertEq(
      spacedStatus.body?.state,
      "active",
      "format: baris berspasi/berdash tetap terbaca active (hanya digit yang dibandingkan)"
    );
    assertEq(
      countRows("users", "phone = '+6281200000130'"),
      1,
      "format: baris uji tersimpan apa adanya (tidak ada tulisan ke tabel users)"
    );

    // ══ 7. Promo: tidak ada aktivasi/klaim dari slice ini ══════════════════
    section("Promo: tamper & tanpa aktivasi");
    const tamper = await makeClient().call(
      `/api/wa/subscription?amount=1&user_id=x&promo_code=TEMENANLAGI`,
      { headers: { "X-Keep-Cookie": "1" } }
    );
    assertEq(tamper.status, 401, "promo: tanpa sesi tetap 401 walau query diberi promo/amount");
    assertEq(
      countRows("promo_redemptions"),
      0,
      "promo: NOL baris redemption — slice ini tidak mengklaim/mengaktifkan promo"
    );
    const activeTamper = await statusForPhone(P.active2);
    assertEq(
      activeTamper.body?.renewalActivationEnabled,
      false,
      "promo: aktivasi reaktivasi ditahan (t_7bcb4487) — dinyatakan eksplisit"
    );
    assertEq(
      activeTamper.body?.renewal?.plans?.map((p: any) => p.price),
      CANONICAL_PLANS.map((p) => p.price),
      "promo: harga tetap katalog server walau client mengirim amount/promo_code"
    );

    // ══ 8. Admin bypass vs non-admin ═══════════════════════════════════════
    section("Admin allowlist tidak mem-bypass status pelanggan");
    const adminPhoneStatus = await statusForPhone(P.adminOnly);
    assertEq(
      adminPhoneStatus.body?.state,
      "expired",
      "admin: nomor di NINA_ADMIN_PHONES tetap dievaluasi normal (tanpa bypass)"
    );
    assertEq(
      adminPhoneStatus.body?.renewal?.eligible,
      true,
      "admin: eligibilitas dihitung dari expires_at, bukan dari allowlist"
    );
    const nonAdmin = await statusForPhone(P.expired8d);
    assertEq(nonAdmin.body?.state, "expired", "non-admin: nomor non-admin dievaluasi sama");

    // ══ 9. RPC sempit: least privilege + jalur baca tidak menulis ══════════
    section("RPC sempit: anon ditolak, jalur baca tidak menulis");
    const anonRpc = await fetch(`${POSTGREST_URL}/rest/v1/rpc/subscription_status_for_owner`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_phone: P.active }),
    });
    assertOk(
      anonRpc.status === 401 || anonRpc.status === 403,
      "rpc: anon DITOLAK (401/403), bukan 200 berisi data",
      `status=${anonRpc.status}`
    );
    const anonRpcBody = await anonRpc.text();
    assertOk(!anonRpcBody.includes(P.active), "rpc: jawaban anon tidak memuat apa pun");

    const anonChallenges = await fetch(`${POSTGREST_URL}/rest/v1/wa_otp_challenges?select=phone`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    const anonChallengeBody = await anonChallenges.text();
    assertOk(
      anonChallenges.status === 401 || anonChallenges.status === 403 || anonChallengeBody === "[]",
      "rpc: anon tidak bisa membaca tabel challenge",
      `status=${anonChallenges.status} body=${anonChallengeBody.slice(0, 40)}`
    );

    const svcChallenges = await fetch(`${POSTGREST_URL}/rest/v1/wa_otp_challenges?select=phone`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    assertEq(svcChallenges.status, 200, "rpc: service_role tetap bisa membaca challenge");

    const staleStatus = await fetch(
      `${POSTGREST_URL}/rest/v1/rpc/subscription_status_for_owner`,
      {
        method: "POST",
        headers: rpcHeaders,
        body: JSON.stringify({ p_phone: P.staleActive }),
      }
    ).then((r) => r.json());
    assertEq(staleStatus?.state, "expired", "rpc: status 'active' yang lewat -> 'expired'");
    assertEq(
      psqlSuper(`SELECT status FROM subscriptions WHERE user_id = '${idStale}';`, { csv: true }),
      "active",
      "rpc: jalur BACA tidak mengubah status di DB (beda dari check_subscription)"
    );
    assertEq(
      Object.keys(staleStatus).sort(),
      ["expires_at", "last_plan_key", "state"],
      "rpc: jawaban hanya 3 field ({state,expires_at,last_plan_key})"
    );

    // ══ 10. Gagal-tertutup ═════════════════════════════════════════════════
    section("Gagal-tertutup (upstream mati / provider tidak dikonfigurasi)");
    broken = await startApp(
      { SUPABASE_URL: DEAD_SUPABASE, WA_OTP_PROVIDER: "mock" },
      BROKEN_APP_PORT,
      BROKEN_LOG
    );
    const brokenClient = makeClient(BROKEN_URL);
    brokenClient.setCookie(
      `thrivin_wa_session=${craftToken({
        phone: P.active,
        iat: Date.now(),
        exp: Date.now() + 600_000,
        epoch: "0",
      })}`
    );
    const brokenStatus = await brokenClient.call("/api/wa/subscription");
    assertEq(brokenStatus.status, 503, "fail-closed: DB mati -> 503 (bukan 200)");
    assertOk(
      !("state" in (brokenStatus.body || {})),
      "fail-closed: jawaban tanpa field state — tidak pernah terbaca sebagai \"nomor baru\""
    );
    const brokenRequest = await makeClient(BROKEN_URL).call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: P.active }),
    });
    assertEq(brokenRequest.status, 503, "fail-closed: permintaan kode saat DB mati -> 503 generik");
    assertNotEq(brokenRequest.body?.ok, true, "fail-closed: bukan 200 yang menjanjikan kode");
    broken.stop();
    broken = null;

    noprovider = await startApp(
      { WA_OTP_PROVIDER: undefined },
      NOPROVIDER_APP_PORT,
      NOPROVIDER_LOG
    );
    const noProviderRequest = await makeClient(NOPROVIDER_URL).call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: P.active }),
    });
    assertEq(
      noProviderRequest.status,
      503,
      "fail-closed: transport OTP tidak diotorisasi -> 503 generik"
    );
    assertEq(
      noProviderRequest.body,
      brokenRequest.body,
      "fail-closed: bentuk jawaban sama untuk mode gagal DB dan mode gagal transport"
    );
    noprovider.stop();
    noprovider = null;

    // F-2: mock DITOLAK saat NODE_ENV=production (tanpa pintu darurat eksplisit).
    mockprod = await startApp(
      {
        WA_OTP_MOCK_ALLOW_IN_PRODUCTION: undefined,
        WA_OTP_MOCK_SINK: MOCKPROD_SINK,
      },
      MOCKPROD_APP_PORT,
      MOCKPROD_LOG
    );
    const mockProdPhone = "6281200000140";
    const mockProdRequest = await makeClient(MOCKPROD_URL).call("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: mockProdPhone }),
    });
    assertEq(
      mockProdRequest.status,
      503,
      "fail-closed: WA_OTP_PROVIDER=mock saat NODE_ENV=production -> 503 (tidak menjanjikan kode)"
    );
    assertEq(
      mockProdRequest.body,
      brokenRequest.body,
      "fail-closed: jawaban mock-di-produksi sama generiknya"
    );
    assertOk(
      !fs.existsSync(MOCKPROD_SINK),
      "fail-closed: file sink mock TIDAK dibuat — nol kode OTP/nomor mentah ke disk"
    );
    assertEq(
      countRows("wa_otp_challenges", `phone = '${mockProdPhone}'`),
      0,
      "fail-closed: nol challenge diterbitkan untuk mock-di-produksi"
    );
    mockprod.stop();
    mockprod = null;

    // ══ 10b. Kuota per jam lewat JALUR HTTP dengan default app (F-1) ═══════
    // Ditempatkan SETELAH batas waktu-sensitif (fixture "tepat 7 hari" punya
    // margin 30 detik): blok ini memang menunggu 61 detik jendela batas laju.
    // Audit W3 F-1: uji lama memanggil RPC LANGSUNG dengan p_max_per_hour=1, jadi
    // jalur HTTP dengan default app (5) tidak teruji — padahal di sana kontrolnya
    // mati (UPSERT membuat hitungan "baris hidup" selalu 1 → kuota maksimum 1/jam).
    // Instance ini sengaja TIDAK mengeset WA_OTP_MAX_PER_HOUR: yang diuji = nilai
    // default app, lewat endpoint yang dipakai pengguna.
    section("Kuota per jam lewat jalur HTTP (default app = 5)");
    quota = await startApp(
      {
        WA_OTP_MAX_PER_HOUR: undefined,
        WA_OTP_MOCK_SINK: QUOTA_SINK,
        WA_OTP_MIN_INTERVAL_SECONDS: "0",
      },
      QUOTA_APP_PORT,
      QUOTA_LOG
    );
    const quotaPhone = "6281200000120";
    const quotaClient = makeClient(QUOTA_URL);
    const quotaRequest = (phone: string) =>
      quotaClient.call("/api/wa/session/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

    let quotaStatus = 0;
    for (let i = 0; i < 3; i += 1) quotaStatus = (await quotaRequest(quotaPhone)).status;
    assertEq(quotaStatus, 200, "kuota-http: 3 permintaan pertama (batas laju route) -> 200");
    assertEq(
      sinkEntries(QUOTA_SINK).filter((e) => e.phone === quotaPhone).length,
      3,
      "kuota-http: 3 permintaan pertama = 3 kode terkirim"
    );

    // Batas laju route = 3 permintaan/menit/nomor, kuota = 5/jam: butuh jendela
    // kedua untuk benar-benar menyentuh batas per jam.
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    for (let i = 0; i < 3; i += 1) quotaStatus = (await quotaRequest(quotaPhone)).status;

    const quotaCodes = sinkEntries(QUOTA_SINK).filter((e) => e.phone === quotaPhone);
    assertEq(
      quotaStatus,
      200,
      "kuota-http: permintaan melewati kuota tetap 200 generik (tidak membocorkan batas)"
    );
    assertEq(
      quotaCodes.length,
      5,
      "kuota-http: HANYA 5 kode dalam satu jam (default app), bukan 6 — dan bukan 60"
    );
    assertEq(
      new Set(quotaCodes.map((e) => e.code)).size,
      5,
      "kuota-http: setiap kode terkirim berbeda (tidak ada kode dipakai ulang)"
    );
    assertEq(
      countRows(
        "wa_otp_challenges",
        `phone = '${quotaPhone}' AND created_at > now() - interval '1 hour'`
      ),
      5,
      "kuota-http: 5 baris tercatat — hitungan dari baris tercatat, bukan baris hidup"
    );
    assertEq(
      countRows("wa_otp_challenges", `phone = '${quotaPhone}' AND consumed_at IS NULL`),
      1,
      "kuota-http: tetap hanya SATU challenge hidup per nomor"
    );
    quota.stop();
    quota = null;

    // ══ 11. UI: markup keyboard & mobile ══════════════════════════════════
    section("UI: markup keyboard & mobile");
    const page = await fetch(`${BASE_URL}/companion/nina/status`);
    const html = await page.text();
    assertEq(page.status, 200, "ui: halaman status -> 200");
    assertOk(
      html.includes('for="wa-phone"') && html.includes('id="wa-phone"'),
      "ui: input nomor punya <label for> eksplisit"
    );
    assertOk(html.includes('type="tel"'), "ui: input nomor type=tel (keyboard angka di HP)");
    // React menuliskan atribut ini camelCase di HTML SSR; HTML tidak
    // case-sensitive, jadi diperiksa tanpa peduli besar-kecil huruf.
    assertOk(
      /inputmode="numeric"/i.test(html),
      "ui: inputmode=numeric (keyboard angka, tanpa harus zoom)"
    );
    assertOk(/autocomplete="tel"/i.test(html), "ui: autocomplete=tel");
    assertOk(
      /autocomplete="one-time-code"|inputmode="numeric"/i.test(html),
      "ui: input kode siap untuk keyboard/mobile"
    );
    assertOk(html.includes('aria-live="polite"'), "ui: wilayah aria-live untuk status/error");
    assertOk(
      html.includes('aria-describedby="wa-phone-hint"') && html.includes('id="wa-phone-hint"'),
      "ui: input ditautkan ke teks bantuan"
    );
    assertOk(html.includes('type="submit"'), "ui: tombol form type=submit (Enter mengirim)");
    assertOk(html.includes("min-h-11"), "ui: target sentuh minimal 44px");
    assertOk(
      html.includes('href="/companion/nina/onboarding"') === false,
      "ui: CTA checkout baru muncul setelah status dimuat (tidak ada sebelum verifikasi)"
    );

    // ══ 12. Log & redaksi ═════════════════════════════════════════════════
    section("Log: tidak ada kode OTP / nomor mentah");
    const serverLog = fs.readFileSync(LOG_FILE, "utf-8");
    const leakedCodes = sinkEntries().filter((e) => serverLog.includes(e.code));
    assertEq(leakedCodes.length, 0, "log: tidak ada kode OTP yang tercetak di log server");
    const rawPhones = Object.values(P).filter((phone) => serverLog.includes(phone));
    assertEq(rawPhones, [], "log: tidak ada nomor mentah di log (hanya bentuk ***1234)");
  } finally {
    app?.stop();
    broken?.stop();
    noprovider?.stop();
    quota?.stop();
    mockprod?.stop();
    postgrest.stop();
  }

  const failed = results.filter(([status]) => status === "FAIL");
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(
    `\n${results.length - failed.length}/${results.length} WA-first e2e checks passed` +
      (failed.length ? " — FAILED" : "")
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
