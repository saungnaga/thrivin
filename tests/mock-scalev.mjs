/**
 * Local mock of the Scalev API (M-7).
 *
 * The old suite POSTed /api/scalev/create-order straight at api.scalev.com and
 * created a real order in the production account, then treated the failure as
 * "non-fatal". Tests must not touch a live payment account, so the route takes
 * its base URL from SCALEV_API_BASE_URL and the suite points it here.
 *
 *   node tests/mock-scalev.mjs <port>        (atau env MOCK_SCALEV_PORT)
 */
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  mkPrivateTempDir,
  rewritePrivateFile,
  writePrivateFile,
} from "./harness/private-fs.mjs";

// RX2-4 R1: wajib port eksplisit — dulu fallback bersama 4111 bikin dua reviewer
// yang menjalankan mock manual bertabrakan (dan membuat mock anak mati
// EADDRINUSE sementara suite-nya bicara ke mock orang lain). Port selalu datang
// dari isolate.mts (slot per-worktree); env dipertahankan sebagai jalur eksplisit.
const PORT = Number(process.argv[2] || process.env.MOCK_SCALEV_PORT);
if (!PORT) {
  console.error("usage: node tests/mock-scalev.mjs <port>  (or set MOCK_SCALEV_PORT)");
  process.exit(2);
}

const PRODUCTS = [
  { name: "Checkout Nina 1 Bulan", variants: [{ unique_id: "variant_vF4j4Pwv1wIizRu3VP6FVOgt", price: 99000 }] },
  { name: "Checkout Nina 3 Bulan", variants: [{ unique_id: "variant_HQdTVIe99NfKi4yjdryOprFc", price: 219000 }] },
  { name: "Checkout Nina 6 Bulan", variants: [{ unique_id: "variant_f_rx-DoyHQGghKA9LCQsaoz9", price: 359000 }] },
  { name: "Checkout Nina 12 Bulan", variants: [{ unique_id: "variant_Year12M0JKm9wXQp7ZbV2Nq", price: 465000 }] },
];

/** Every order this mock has been asked to create — the assertion surface. */
export const createdOrders = [];

// F-W4-1c: `POST /v3/orders/change-status` (cancel). Dipakai uji cancel TTL.
export const changeStatusCalls = [];

// Mirror to disk so the test process (which talks to the mock over HTTP, not
// via import) can assert on what the route actually sent Scalev.
// RX2-4 follow-up B2: default dulu `/tmp/thrivin-mock-orders-<pid>.json` yang
// predictable, ditulis `writeFileSync` (mengikuti symlink). Default sekarang
// direktori unik 0700 (mkdtemp) dan tiap tulis eksklusif/tanpa-follow; suite
// tetap boleh menunjuk path sendiri lewat env (di dalam TMP_PREFIX privat).
const ARTIFACT_DIR =
  process.env.MOCK_SCALEV_DIR || mkPrivateTempDir("thrivin-mock-");
const ORDERS_FILE =
  process.env.MOCK_SCALEV_ORDERS_FILE || path.join(ARTIFACT_DIR, "orders.json");
writePrivateFile(ORDERS_FILE, "[]");

/**
 * F-W4-1c: mode cancel DIBACA DARI FILE pada tiap request (bukan env), supaya
 * suite bisa mengubah hasil upstream tanpa me-restart mock: satu mode = satu
 * assertion yang hanya bisa lulus kalau kode benar-benar menangani mode itu
 * (Sentinel S-4: mode parsial adalah satu-satunya cara assertion bisa gagal).
 * Nilai: ok (default) · partial · partial_once · wrong_status · no_id ·
 *        200_malformed · 408 · 429 · 500 · 500_once · 400 · 403 · 401 · 404 · 409 · timeout.
 */
const CANCEL_MODE_FILE =
  process.env.MOCK_SCALEV_CANCEL_MODE_FILE ||
  path.join(ARTIFACT_DIR, "cancel-mode.txt");
const CANCEL_FILE =
  process.env.MOCK_SCALEV_CANCEL_FILE ||
  path.join(ARTIFACT_DIR, "cancel-calls.json");
writePrivateFile(CANCEL_FILE, "[]");

function cancelMode() {
  try {
    return fs.readFileSync(CANCEL_MODE_FILE, "utf-8").trim() || "ok";
  } catch {
    return "ok";
  }
}

function persistCalls() {
  rewritePrivateFile(CANCEL_FILE, JSON.stringify(changeStatusCalls, null, 2));
}

function persistOrders() {
  rewritePrivateFile(ORDERS_FILE, JSON.stringify(createdOrders, null, 2));
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // RX2-4 R3: identitas mock (pola promo-ws). Suite memakainya untuk memastikan
  // port ini benar-benar dipegang mock MILIKNYA: kalau port tabrakan, mock anak
  // mati EADDRINUSE sementara `waitFor(...)` dijawab listener asing — suite lalu
  // membaca file orders milik run lain dan hasilnya hijau/merah karena alasan
  // yang salah. assertMockOwner() (harness/stack.mts) yang memeriksanya.
  if (req.method === "GET" && url.pathname === "/__mock-identity") {
    return send(res, 200, { pid: process.pid, port: PORT, ordersFile: ORDERS_FILE, cancelFile: CANCEL_FILE });
  }

  if (req.method === "GET" && url.pathname.endsWith("/products")) {
    return send(res, 200, { data: PRODUCTS });
  }

  if (req.method === "GET" && url.pathname.endsWith("/orders")) {
    // Customer order history (TEMANBAIKHATI once-per-number check).
    if (url.searchParams.get("search_field") === "customer_phone") {
      return send(res, 200, { data: [] });
    }
    return send(res, 200, { data: [] });
  }

  if (req.method === "POST" && url.pathname.endsWith("/orders")) {
      const body = await readBody(req);
      const record = { receivedAt: Date.now(), body, authorization: req.headers.authorization };
      createdOrders.push(record);
      persistOrders();

      // Order yang gagal di Scalev, untuk menguji pelepasan kuota promo
      // (kode promo sudah diklaim, order tidak jadi dibuat).
      if (String(body.customer_name || "").startsWith("FAILORDER")) {
        return send(res, 422, { message: "mock: order rejected on purpose" });
      }

      const orderId = `test_${createdOrders.length}_${Date.now().toString(36)}`;
      const unitPrice = 219000;
      const qty = Array.isArray(body.ordervariants) ? body.ordervariants[0]?.quantity || 1 : 1;
      const gross = unitPrice * qty - (Number(body.product_discount) || 0);

      return send(res, 200, {
        id: `uuid_${orderId}`,
        order_id: orderId,
        public_order_url: `https://thrivin.myscalev.com/orders/${orderId}`,
        pg_payment_info: { payment_url: `https://thrivin.myscalev.com/pay/${orderId}` },
        gross_revenue: gross,
        notes: body.notes,
      });
  }

  // F-W4-1c: cancel order — `POST /v3/orders/change-status`.
  if (req.method === "POST" && url.pathname.endsWith("/orders/change-status")) {
    const body = await readBody(req);
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const authHeader = req.headers.authorization || "";
    changeStatusCalls.push({
      receivedAt: Date.now(),
      ids,
      status: body.status,
      by: body.by,
      // Nol kredensial di artefak: cukup bentuk header + sidik jari 8 hex supaya
      // uji bisa membuktikan key CANCEL yang dipakai (bukan key create-order).
      authKind: authHeader.startsWith("Bearer ") ? "bearer" : "none",
      authSha8: crypto.createHash("sha256").update(authHeader).digest("hex").slice(0, 8),
      mode: cancelMode(),
    });
    persistCalls();

    const mode = cancelMode();
    // Mode "*_once": hasil jelek HANYA pada panggilan pertama, lalu normal —
    // satu-satunya cara membuktikan retry bounded benar-benar terjadi DAN
    // idempotent (ids yang dikirim ulang harus sama).
    const attemptNo = changeStatusCalls.filter((c) => c.mode === mode).length;
    if (mode === "timeout") {
      // Lebih lama dari timeout klien (5 s) supaya jalurnya benar-benar hangus.
      await new Promise((r) => setTimeout(r, 9000));
    }
    if (mode === "401") return send(res, 401, { message: "unauthorized" });
    if (mode === "403") return send(res, 403, { message: "forbidden" });
    if (mode === "400") return send(res, 400, { message: "bad request" });
    if (mode === "404") return send(res, 404, { error: "not found" });
    if (mode === "408") return send(res, 408, { error: "request timeout" });
    if (mode === "409") return send(res, 409, { message: "already canceled" });
    if (mode === "429") return send(res, 429, { error: "rate limited" });
    if (mode === "500") return send(res, 500, { error: "internal" });
    if (mode === "500_once" && attemptNo === 1) return send(res, 500, { error: "internal" });
    if (mode === "partial" || (mode === "partial_once" && attemptNo === 1)) {
      // Sukses tapi data[] hanya memuat SEBAGIAN id yang dikirim.
      return send(res, 200, {
        data: ids.slice(0, Math.max(1, ids.length - 1)).map((id) => ({ id, status: "canceled" })),
      });
    }
    if (mode === "wrong_status") {
      return send(res, 200, { data: ids.map((id) => ({ id, status: "processed" })) });
    }
    if (mode === "no_id") {
      return send(res, 200, { data: ids.map(() => ({ status: "canceled" })) });
    }
    if (mode === "200_malformed") {
      return send(res, 200, { message: "ok" });
    }
    return send(res, 200, {
      data: ids.map((id) => ({ id, status: "canceled", url: `https://thrivin.myscalev.com/orders/${id}` })),
    });
  }

  send(res, 404, { error: "not found", path: url.pathname });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-scalev] listening on http://127.0.0.1:${PORT}`);
});

export { server, PRODUCTS };
export default server;