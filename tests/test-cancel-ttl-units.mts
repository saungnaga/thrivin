/**
 * Unit (tanpa DB/HTTP) untuk klasifikasi hasil cancel F-W4-1c — kartu t_1d1cf77f.
 *
 *   node --experimental-strip-types tests/test-cancel-ttl-units.mts
 *
 * Yang diuji: tabel B-3 + M-5 (kelas hasil) dan verifikasi response B-1.3
 * (setiap ID yang dikirim wajib muncul `canceled`). Bagian state/DB diuji di
 * tests/test-cancel-ttl-e2e.mts; di sini nol I/O.
 */
import {
  CANCEL_BACKOFF_MS,
  CANCEL_MAX_ATTEMPTS,
  CANCEL_TIMEOUT_MS,
  CANCEL_BUDGET_MS,
  classifyCancelResponse,
  verifyCancelResponse,
} from "../src/lib/checkout-cancel.ts";

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

const A = "0199a1b8-4d1f-7c3a-9d2e-5f6a7b8c9d0e";
const B = "0199a1b8-4d1f-7c3a-9d2e-5f6a7b8c9d0f";
const IDS = [A, B];

// ── 1. Verifikasi response (B-1.3) ──────────────────────────────────────────
eq(
  verifyCancelResponse({ data: [{ id: A, status: "canceled" }, { id: B, status: "canceled" }] }, IDS),
  { ok: true, detail: "2 id terverifikasi canceled" },
  "semua id canceled ⇒ ok"
);
check(
  verifyCancelResponse({ data: [{ id: A, status: "canceled" }] }, IDS).ok === false,
  "response parsial (ID hilang) ⇒ bukan sukses"
);
check(
  verifyCancelResponse({ data: [{ id: A, status: "canceled" }, { id: B, status: "processed" }] }, IDS).ok === false,
  "satu id berstatus lain ⇒ bukan sukses"
);
check(
  verifyCancelResponse({ data: [{ status: "canceled" }, { status: "canceled" }] }, IDS).ok === false,
  "elemen tanpa id ≠ bukti"
);
check(verifyCancelResponse({ message: "ok" }, IDS).ok === false, "body tanpa data[] ⇒ bukan sukses");
check(verifyCancelResponse(null, IDS).ok === false, "body null ⇒ bukan sukses");

// ── 2. Kelas hasil (B-3 + M-5) ──────────────────────────────────────────────
const cls = (status: number, body: unknown = { data: IDS.map((id) => ({ id, status: "canceled" })) }) =>
  classifyCancelResponse(status, body, IDS).verdict;

eq(cls(200), "success", "200 + semua id canceled ⇒ success");
eq(cls(200, { data: [{ id: A, status: "canceled" }] }), "transient", "200 parsial ⇒ TAHAN (M-5)");
eq(cls(200, { data: [{ id: A, status: "canceled" }, { id: B, status: "processed" }] }), "transient", "200 status salah ⇒ TAHAN");
eq(cls(200, { message: "ok" }), "transient", "200 malformed ⇒ TAHAN (M-5)");
eq(cls(201), "success", "2xx lain dengan bukti lengkap ⇒ success");
eq(cls(400, { message: "bad request" }), "terminal", "400 ⇒ terminal");
eq(cls(403, { message: "forbidden" }), "terminal", "403 ⇒ terminal");
eq(cls(401, { message: "unauthorized" }), "unauthorized", "401 ⇒ breaker global");
eq(cls(404, { error: "not found" }), "terminal", "404 tanpa bukti canceled ⇒ terminal");
eq(cls(409, { message: "already canceled" }), "terminal", "409 tanpa bukti canceled ⇒ terminal (jangan tebak dari teks)");
eq(cls(409), "success", "409 DENGAN body terverifikasi canceled ⇒ success");
eq(cls(429, { error: "rate limited" }), "transient", "429 ⇒ transient");
eq(cls(500, { error: "internal" }), "transient", "500 ⇒ transient");
eq(cls(503), "transient", "503 ⇒ transient");
eq(cls(408), "transient", "408 tak terdaftar ⇒ TAHAN (M-5)");
eq(cls(425), "transient", "425 tak terdaftar ⇒ TAHAN (M-5)");
eq(cls(499), "transient", "499 tak terdaftar ⇒ TAHAN (M-5)");
eq(cls(302), "transient", "3xx tak terdaftar ⇒ TAHAN (M-5)");
eq(cls(Number.NaN, null), "transient", "timeout/network ⇒ transient");

// Rincian pesan tidak boleh membawa PII/body upstream: hanya kelas + jumlah.
check(
  !classifyCancelResponse(400, { message: "customer 6281234567890 rejected" }, IDS).detail.includes("6281234567890"),
  "detail kelas TIDAK memuat isi body (nol PII)"
);

// ── 3. Angka retry yang dijanjikan (M-1) ────────────────────────────────────
eq([CANCEL_TIMEOUT_MS, CANCEL_MAX_ATTEMPTS, CANCEL_BACKOFF_MS, CANCEL_BUDGET_MS], [5000, 3, [250, 1000], 15000], "M-1: timeout/attempts/backoff/budget");

console.log(`\ncancel TTL units: ${pass} PASS, ${failures.length} FAIL`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length) process.exit(1);
