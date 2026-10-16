/**
 * Local mock of the Scalev API (M-7).
 *
 * The old suite POSTed /api/scalev/create-order straight at api.scalev.com and
 * created a real order in the production account, then treated the failure as
 * "non-fatal". Tests must not touch a live payment account, so the route takes
 * its base URL from SCALEV_API_BASE_URL and the suite points it here.
 *
 *   node tests/mock-scalev.mjs [port]
 */
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";

const PORT = Number(process.argv[2] || process.env.MOCK_SCALEV_PORT || 4111);

const PRODUCTS = [
  { name: "Checkout Nina 1 Bulan", variants: [{ unique_id: "variant_vF4j4Pwv1wIizRu3VP6FVOgt", price: 99000 }] },
  { name: "Checkout Nina 3 Bulan", variants: [{ unique_id: "variant_HQdTVIe99NfKi4yjdryOprFc", price: 219000 }] },
  { name: "Checkout Nina 6 Bulan", variants: [{ unique_id: "variant_f_rx-DoyHQGghKA9LCQsaoz9", price: 359000 }] },
  { name: "Checkout Nina 12 Bulan", variants: [{ unique_id: "variant_Year12M0JKm9wXQp7ZbV2Nq", price: 465000 }] },
];

/** Every order this mock has been asked to create — the assertion surface. */
export const createdOrders = [];

// Mirror to disk so the test process (which talks to the mock over HTTP, not
// via import) can assert on what the route actually sent Scalev. Default
// ber-pid supaya menjalankan mock manual tidak menimpa file run lain (RX2-2).
const ORDERS_FILE =
  process.env.MOCK_SCALEV_ORDERS_FILE ||
  path.join(os.tmpdir(), `thrivin-mock-orders-${process.pid}.json`);
fs.writeFileSync(ORDERS_FILE, "[]");

function persistOrders() {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(createdOrders, null, 2));
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

  send(res, 404, { error: "not found", path: url.pathname });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-scalev] listening on http://127.0.0.1:${PORT}`);
});

export { server, PRODUCTS };
export default server;