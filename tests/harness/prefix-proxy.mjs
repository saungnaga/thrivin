#!/usr/bin/env node
/**
 * Prefix-stripping reverse proxy for the local PostgREST stand-in.
 *
 * PostgREST 16.x has no `server-root-spec` (that option does not exist — writing
 * it is silently ignored, which is why `/rest/v1/...` returned 404/PGRST125).
 * Supabase serves PostgREST behind Kong, which strips the `/rest/v1` prefix
 * before the request reaches PostgREST. We mirror that here: the app keeps
 * talking to `<url>/rest/v1/...` (identical to production) and this proxy
 * forwards the stripped path to PostgREST on an internal port.
 *
 *   node tests/harness/prefix-proxy.mjs <listenPort> <upstreamPort> [runId]
 *
 * RX2-4: `runId` (identitas run, dari isolate.mts) diiklankan di
 * `GET /__proxy-identity`. stack.mts memakainya untuk membedakan proxy MILIK RUN
 * INI dari listener asing yang kebetulan memegang port yang sama (tabrakan
 * PORT_BASE ~1/1200) — tanpa itu, uji bisa hijau/merah di DB yang salah.
 */
import http from "http";

// RX2-2: wajib argumen eksplisit — default bersama (54321/54322) dulu bikin dua
// worktree yang jalan bareng saling menimpa. Port datang dari isolate.mts.
const listenPort = Number(process.argv[2]);
const upstreamPort = Number(process.argv[3]);
const runId = process.argv[4] || "";
if (!listenPort || !upstreamPort) {
  console.error(
    "usage: node tests/harness/prefix-proxy.mjs <listenPort> <upstreamPort> [runId]"
  );
  process.exit(2);
}
const PREFIX = "/rest/v1";

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  if (req.method === "GET" && url === "/__proxy-identity") {
    const payload = JSON.stringify({
      pid: process.pid,
      listenPort,
      upstreamPort,
      runId,
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
    return;
  }

  if (!url.startsWith(PREFIX)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "Invalid path specified in request URL" }));
    return;
  }
  const stripped = url.slice(PREFIX.length) || "/";
  const proxyReq = http.request(
    {
      host: "127.0.0.1",
      port: upstreamPort,
      method: req.method,
      path: stripped,
      headers: { ...req.headers, host: `127.0.0.1:${upstreamPort}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `upstream error: ${err.message}` }));
  });
  req.pipe(proxyReq);
});

server.listen(listenPort, "127.0.0.1");
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);