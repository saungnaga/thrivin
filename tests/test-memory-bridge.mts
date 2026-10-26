/**
 * Tes jembatan onboarding -> `memories` (BUG: data onboarding tidak sampai ke
 * memori Nina).
 *
 *   node --experimental-strip-types tests/test-memory-bridge.mts
 *
 * Stack: Postgres + PostgREST lokal (harness) + Next.js lokal. Nol koneksi ke
 * staging/produksi Scalev, nol data customer.
 *
 * Bukti per item:
 *   HASH   paritas normalisasi/hash SQL vs Python store.py  -> identik (WAJIB)
 *   GRANT  service_role/anon tidak bisa baca tabel/RPC      -> ditolak
 *   RPC    nomor tidak dikenal / onboarding kosong          -> 0 baris
 *   RPC    panggil 2x                                       -> jumlah baris tetap
 *   RPC    isolasi tenant                                   -> tenant lain tak tersentuh
 *   AKTIV  RPC memori mati                                  -> aktivasi tetap sukses
 *   E2E    webhook paid                                     -> baris `memories` ada
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn, execFileSync } from "child_process";
import {
  SERVICE_KEY,
  ANON_KEY,
  POSTGREST_URL,
  startPostgrest,
  psqlSuper,
} from "./harness/stack.mts";
// Best-effort client under test (imported directly, no mocking).
import { seedNinaMemory } from "../src/lib/memory-bridge.ts";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");

const NINA_STORE_PY =
  process.env.NINA_STORE_PY ||
  path.join(process.env.HOME || "", "workspaces/thrivin/staging/h1-memory/plugins/nina-memory/store.py");

const WEBHOOK_SECRET = "test_scalev_secret_12345";
const APP_PORT = Number(process.env.HARNESS_MEMORY_APP_PORT || 3988);
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const DISK_DIR = "/tmp/thrivin-memory-bridge-onboarding";
const LOG_FILE = "/tmp/thrivin-memory-bridge-server.log";

const TENANT_A = "+6281111100001";
const TENANT_B = "+6281111100002";
const ORDER_A = "ORD-MEM-A";
const ORDER_B = "ORD-MEM-B";

const results: Array<[string, string]> = [];
let failures = 0;
function record(ok: boolean, name: string, detail = "") {
  if (!ok) failures++;
  results.push([ok ? "PASS" : "FAIL", detail ? `${name} — ${detail}` : name]);
}
function assertEq(actual: unknown, expected: unknown, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  record(ok, name, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertOk(cond: boolean, name: string, detail = "") {
  record(cond, name, cond ? "" : detail);
}

/** Nomor versi DB -> digit telanjang (kanal WA mengirim tanpa '+'). */
const bare = (tenant: string) => tenant.replace(/^\+/, "");

function sign(rawBody: string, secret = WEBHOOK_SECRET): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
}

function memCount(tenant: string): number {
  return Number(
    psqlSuper(`SELECT count(*) FROM memories WHERE user_wa = '${tenant}';`, { csv: true })
      .split("\n")
      .pop()
  );
}

function memContents(tenant: string): string[] {
  const out = psqlSuper(
    `SELECT content FROM memories WHERE user_wa = '${tenant}' ORDER BY content;`,
    { csv: true }
  );
  return out ? out.split("\n") : [];
}

/** RPC lewat PostgREST — jalur yang persis dipakai webhook. */
async function callRpc(pPhone: string, key = SERVICE_KEY): Promise<{ status: number; body: any }> {
  const res = await fetch(`${POSTGREST_URL}/rest/v1/rpc/seed_nina_memory_from_onboarding`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_phone: pPhone }),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no/opaque body */
  }
  return { status: res.status, body };
}

function seedUser(phone: string, name: string | null, onboarding: Record<string, unknown>) {
  psqlSuper(
    `INSERT INTO users (phone, name, onboarding_data) VALUES ('${phone}', ` +
      `${name === null ? "NULL" : `'${name}'`}, $json$${JSON.stringify(onboarding)}$json$) ` +
      `ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, onboarding_data = EXCLUDED.onboarding_data;`
  );
}

function truncate(): void {
  psqlSuper(
    "TRUNCATE memories, webhook_events_inbox, onboarding_snapshots, subscriptions, users RESTART IDENTITY CASCADE;"
  );
}

function serverLog(): string {
  try {
    return fs.readFileSync(LOG_FILE, "utf-8");
  } catch {
    return "";
  }
}

async function waitFor(url: string, timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return res;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const profile = {
  gender: "Laki-laki",
  age: 26,
  weight: 70,
  height: 175,
  activityLevel: "Moderat",
  workoutLocation: "Di Gym",
  programFocus: ["Workout & Strength", "Fat Loss"],
  biggestChallenge: "Konsistensi jadwal",
  communicationStyle: "Tegas & Terarah",
};
/** 9 field + nama = 10 fakta. */
const EXPECTED_FACTS = 10;

function paymentEvent(eventId: string, orderId: string, phone: string, name: string) {
  return {
    event: "payment.received",
    unique_id: eventId,
    timestamp: new Date().toISOString(),
    data: {
      order_id: orderId,
      payment_status: "paid",
      gross_revenue: "219000.00",
      customer: { name, phone },
      destination_address: { name, phone, email: "dummy@example.com" },
      customer_phone: phone,
      customer_name: name,
    },
  };
}

function insertSnapshot(tenant: string, orderId: string) {
  psqlSuper(
    `INSERT INTO onboarding_snapshots (tenant_id, phone, order_id, snapshot) ` +
      `VALUES ('thrivin', '${tenant}', '${orderId}', $json$${JSON.stringify(
        { ...profile, plan_key: "quarter" }
      )}$json$) ` +
      `ON CONFLICT (tenant_id, order_id) DO UPDATE SET snapshot = EXCLUDED.snapshot;`
  );
  // t_5783e59e: entitlement requires the order to be RECORDED (claim with an
  // amount) — a paid event for an order we never printed grants nothing.
  psqlSuper(
    `INSERT INTO checkout_claims (tenant_id, phone, idempotency_key, plan_key, status, ` +
      `order_id, scalev_order_uuid, payment_url, amount) VALUES ` +
      `('thrivin','${tenant}','mem-${orderId}','quarter','created',` +
      `'${orderId}','uuid_${orderId}','https://pay.test/${orderId}',219000) ` +
      `ON CONFLICT DO NOTHING;`
  );
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  fs.rmSync(DISK_DIR, { recursive: true, force: true });
  execFileSync("bash", [path.join(HERE, "harness", "seed.sh")], { stdio: "inherit" });
  const postgrest = await startPostgrest();
  if (!postgrest) {
    console.error("PostgREST binary missing — cannot run the memory bridge suite.");
    process.exit(1);
  }

  const logFd = fs.openSync(LOG_FILE, "a");
  let app: ReturnType<typeof spawn> | null = null;
  let appStopped = false;
  const stopApp = () => {
    if (appStopped) return;
    appStopped = true;
    try {
      app?.kill("SIGKILL");
    } catch {
      /* gone */
    }
    fs.closeSync(logFd);
  };

  try {
    // ── HASH: paritas SQL vs Python (paling penting) ───────────────────────────
  console.log("\n── HASH: normalisasi + sha256 SQL == Python store.py ──");
  const samples = [
    "Nama: Raihan", // huruf besar
    "berat badan:   64 kg", // spasi ganda
    "goal: lebih berotot (bulking / nambah massa otot).", // tanda baca ujung
    "preferensi latihan: gym & push up！", // tanda baca ujung full-width
    "  Tinggi: 174 cm  ", // spasi depan-belakang
    "umur: 21 tahun、、", // tanda baca berulang
    "berat badan:\u00a064 kg", // non-breaking space
    "fokus\tprogram:\n Workout", // tab + newline
    "preferensi makanan: suka tempe dan telur rebus untuk protein;",
  ];
  assertOk(
    samples.every((s) => !s.includes("$p$")),
    "HASH  sampel tidak memuat delimiter SQL",
    "delimiter bentrok"
  );

  if (!fs.existsSync(NINA_STORE_PY)) {
    record(false, "HASH  store.py ditemukan", `tidak ada di ${NINA_STORE_PY}`);
  } else {
    const py = execFileSync(
      "python3",
      [
        "-c",
        [
          "import sys, json, importlib.util",
          "spec = importlib.util.spec_from_file_location('nina_store', sys.argv[1])",
          "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
          "inp = json.load(sys.stdin)",
          "print(json.dumps([{'norm': m.normalize_content(s), 'hash': m.content_hash(s)} for s in inp]))",
        ].join("\n"),
        NINA_STORE_PY,
      ],
      { input: JSON.stringify(samples), encoding: "utf-8" }
    );
    const expected: Array<{ norm: string; hash: string }> = JSON.parse(py.trim());

    const sqlRows = psqlSuper(
      "SELECT public.nina_normalize_content(raw) || '|' || public.nina_content_hash(raw) FROM unnest(ARRAY[" +
        samples.map((s) => `$p$${s}$p$`).join(", ") +
        "]) AS t(raw);",
      { csv: true }
    ).split("\n");

    samples.forEach((sample, i) => {
      const [sqlNorm, sqlHash] = sqlRows[i].split("|");
      assertEq(
        { norm: sqlNorm, hash: sqlHash },
        { norm: expected[i].norm, hash: expected[i].hash },
        `HASH  paritas #${i + 1} (${JSON.stringify(sample)})`
      );
    });
    if (failures > 0) {
      console.error(
        "\nSTOP: hash SQL != hash Python. Dedup ON CONFLICT tidak akan pernah cocok\n" +
          "dan memori menumpuk dobel. Perbaiki normalisasi, JANGAN longgarkan dedup.\n"
      );
    }
  }

  // ── GRANT: jalur tulis hanya lewat RPC ─────────────────────────────────────
  console.log("\n── GRANT: service_role/anon tidak boleh menyentuh `memories` ──");
  const directRead = await fetch(`${POSTGREST_URL}/rest/v1/memories?select=id&limit=1`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  assertOk(
    directRead.status >= 400 || directRead.status === 404,
    "GRANT  service_role tidak bisa SELECT `memories` langsung",
    `status ${directRead.status} — kalau ini 200, grant produksi (migration-002) hilang`
  );

  truncate();
  const anonRpc = await callRpc(TENANT_A, ANON_KEY);
  assertOk(
    anonRpc.status >= 400,
    "GRANT  anon tidak bisa EXECUTE RPC seed",
    `status ${anonRpc.status}`
  );

  // ── RPC: perilaku + idempotensi + isolasi tenant ───────────────────────────
  console.log("\n── RPC: idempotensi, nomor tak dikenal, isolasi tenant ──");
  seedUser(TENANT_A, "Budi Santoso", profile);
  seedUser(TENANT_B, "Siti Aminah", { gender: "Perempuan", age: 30 });

  const first = await callRpc(bare(TENANT_A));
  assertEq(first.status, 200, "RPC   panggilan pertama sukses");
  assertEq(first.body, EXPECTED_FACTS, `RPC  mengembalikan jumlah fakta (${EXPECTED_FACTS})`);
  assertEq(memCount(TENANT_A), EXPECTED_FACTS, "RPC   baris `memories` tertulis");

  const second = await callRpc(bare(TENANT_A));
  assertEq(second.status, 200, "RPC   panggilan kedua sukses (idempotent)");
  assertEq(memCount(TENANT_A), EXPECTED_FACTS, "RPC  jumlah baris tidak bertambah (IDEMPOTENT)");

  const unknown = await callRpc("+6289999999999");
  assertEq(unknown.status, 200, "RPC   nomor tak dikenal tidak error");
  assertEq(unknown.body, 0, "RPC   nomor tak dikenal -> 0");
  assertEq(memCount("+6289999999999"), 0, "RPC   nomor tak dikenal -> nol baris");

  seedUser("+6281111100003", null, {});
  const emptyOnboarding = await callRpc("+6281111100003");
  assertEq(emptyOnboarding.body, 0, "RPC   onboarding kosong + tanpa nama -> 0");
  assertEq(memCount("+6281111100003"), 0, "RPC   onboarding kosong -> nol baris");

  const badPhone = await callRpc("0812");
  assertEq(badPhone.body, 0, "RPC   nomor tidak valid -> 0");

  // Bug terpisah yang ketemu saat uji ini: jalur webhook menulis `users.phone`
  // TANPA '+' (normalizePhone -> digit E.164 murni), padahal konvensi DB
  // `+62...`. Jembatan harus tetap bekerja untuk baris yang tersimpan begitu.
  seedUser(bare("+6281111100004"), "Wati Ningsih", { age: 33, weight: 55 });
  const bareRow = await callRpc(bare("+6281111100004"));
  assertEq(bareRow.body, 3, "RPC   users.phone digit telanjang tetap terbaca (nama+umur+BB)");
  assertEq(memCount("+6281111100004"), 3, "RPC   user_wa tetap ditulis format `+62...`");

  assertEq(memCount(TENANT_B), 0, "RPC   isolasi tenant: tenant B tidak tersentuh");
  const contents = memContents(TENANT_A);
  assertOk(
    contents.includes("nama: Budi Santoso") && contents.includes("umur: 26 tahun"),
    "RPC   satu fakta per baris (`label: nilai`)",
    contents.join(" / ")
  );
  assertOk(
    contents.includes("fokus program: Workout & Strength, Fat Loss"),
    "RPC   array programFocus diratakan ke satu baris",
    contents.join(" / ")
  );

  // ── AKTIV: kegagalan RPC tidak menggagalkan apa pun ───────────────────────
  console.log("\n── AKTIV: RPC memori mati tidak menggagalkan aktivasi ──");
  process.env.SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dead-key";
  const dead = await seedNinaMemory(TENANT_A);
  assertEq(dead.ok, false, "AKTIV RPC tak terjangkau -> { ok: false }, tanpa lempar error");
  const garbage = await seedNinaMemory("0812");
  assertEq(garbage.ok, false, "AKTIV nomor tidak valid -> { ok: false }, tanpa lempar error");
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;

  // ── AKTIV/E2E: webhook nyata ──────────────────────────────────────────────
  console.log("\n── E2E: webhook paid -> `memories` + aktivasi tetap jalan ──");
  try {
    fs.truncateSync(LOG_FILE, 0);
  } catch {
    /* ignore */
  }
  app = spawn("./node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    cwd: REPO,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      SUPABASE_URL: POSTGREST_URL,
      SUPABASE_SERVICE_KEY: SERVICE_KEY,
      SCALEV_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ONBOARDING_DATA_DIR: DISK_DIR,
    },
    stdio: ["ignore", logFd, logFd],
  });

  try {
    await waitFor(`${BASE_URL}/api/scalev/webhook`);
    truncate();
    insertSnapshot(bare(TENANT_A), ORDER_A);

    const post = async (body: unknown) => {
      const raw = JSON.stringify(body);
      return fetch(`${BASE_URL}/api/scalev/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Scalev-Hmac-Sha256": sign(raw) },
        body: raw,
      });
    };

    const okRes = await post(paymentEvent("evt_mem_1", ORDER_A, bare(TENANT_A), "Budi Santoso"));
    const okJson = await okRes.json();
    assertEq(okRes.status, 200, "E2E   webhook paid -> 200");
    assertEq(okJson.userActivated, true, "E2E   langganan aktif");
    assertEq(memCount(TENANT_A), EXPECTED_FACTS, `E2E   ${EXPECTED_FACTS} fakta onboarding masuk ke \`memories\``);
    assertOk(
      memContents(TENANT_A).includes("tinggi: 175 cm"),
      "E2E   fakta yang sebelumnya ditanyakan ulang Nina sudah tersimpan",
      memContents(TENANT_A).join(" / ")
    );
    assertOk(
      !serverLog().includes(bare(TENANT_A)),
      "E2E   log server tidak memuat nomor pelanggan"
    );

    // Matikan RPC (cabut EXECUTE) → aktivasi pelanggan berikutnya harus tetap sah.
    psqlSuper("REVOKE EXECUTE ON FUNCTION public.seed_nina_memory_from_onboarding(text) FROM service_role;");
    insertSnapshot(bare(TENANT_B), ORDER_B);
    const failRes = await post(paymentEvent("evt_mem_2", ORDER_B, bare(TENANT_B), "Siti Aminah"));
    const failJson = await failRes.json();
    assertEq(failRes.status, 200, "AKTIV webhook tetap 200 walau RPC memori mati");
    assertEq(failJson.userActivated, true, "AKTIV langganan tetap aktif (tidak di-rollback)");
    assertEq(
      Number(psqlSuper(`SELECT count(*) FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.phone = '${bare(TENANT_B)}';`, { csv: true }).split("\n").pop()),
      1,
      "AKTIV baris subscription tetap dibuat"
    );
    assertEq(memCount(TENANT_B), 0, "AKTIV nol baris memori saat RPC mati (fail-open, bukan error)");
  } finally {
    psqlSuper("GRANT EXECUTE ON FUNCTION public.seed_nina_memory_from_onboarding(text) TO service_role;");
    stopApp();
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  for (const [state, name] of results) console.log(`${state}  ${name}`);
  const failed = results.filter(([s]) => s === "FAIL").length;
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`${results.length - failed}/${results.length} PASS`);
  if (failed) {
    console.error(`${failed} FAILED`);
    process.exitCode = 1;
  }
  } finally {
    stopApp();
    postgrest.stop();
  }
}

main().catch((err) => {
  console.error("memory bridge suite crashed:", err);
  process.exit(1);
});
