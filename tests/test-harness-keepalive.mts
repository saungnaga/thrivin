/**
 * Guard — harness HTTP client hygiene (evidence integrity).
 *
 *   node --experimental-strip-types tests/test-harness-keepalive.mts
 *
 * Why: the e2e suites call `psqlSuper()` (execFileSync) in chains, which blocks
 * this process's event loop. An idle socket in undici's pool then cannot be
 * closed client-side (own keep-alive timeout ≈3 s) and the server's FIN cannot
 * be processed, so the next request lands on a socket the server is closing and
 * the suite dies mid-run with
 *
 *   TypeError: fetch failed / SocketError: UND_ERR_SOCKET "other side closed"
 *
 * Scenario: stand-in node http server with the SAME keepAliveTimeout the app
 * uses (node default 5000 ms — `next start` only overrides it from
 * KEEP_ALIVE_TIMEOUT, which the harness never sets): request → async pause →
 * SYNCHRONOUS stall across the keep-alive boundary → request.
 *
 * Both directions are asserted, so this cannot pass by accident:
 *   control — the raw client MUST fail; if the race no longer reproduces that is
 *             reported as FAIL ("model drifted"), not faked.
 *   subject — the client the suites actually use MUST succeed, MUST open a fresh
 *             connection per request, and MUST put `connection: close` on the wire.
 *
 * No build, no Postgres, no PostgREST, no /tmp state, no network.
 */
import http from "node:http";
import * as stack from "./harness/stack.mts";

/**
 * The raw (pre-fix) client: stack.mts exports the fetch it captured before
 * installing the wrapper. A tree without the wrapper has no export, and then
 * globalThis.fetch IS the raw client — so the control still reproduces the race
 * and the guard fails on the assertions below instead of dying on a missing
 * export.
 */
const rawFetch: typeof fetch =
  (stack as { unwrappedFetch?: typeof fetch }).unwrappedFetch ?? globalThis.fetch;

const SERVER_KEEPALIVE_MS = 5000;
const PAUSE_MS = 500;
const STALL_MS = 6000;

const results: Array<[boolean, string, string]> = [];
function assert(cond: boolean, name: string, detail = "") {
  results.push([cond, name, detail]);
}
function syncStall(ms: number) {
  const end = Date.now() + ms;
  // eslint-disable-next-line no-empty
  while (Date.now() < end) {}
}

interface Outcome {
  error: { code?: string; message?: string } | null;
  status: number | null;
  conns: number;
  ports: number[];
  closeHeaders: number;
}

/** One request → pause → synchronous stall → request, against a fresh server. */
async function scenario(fetchFn: typeof fetch): Promise<Outcome> {
  const ports: number[] = [];
  let conns = 0;
  let closeHeaders = 0;
  const server = http.createServer((req, res) => {
    ports.push(req.socket.remotePort as number);
    if (String(req.headers.connection || "").toLowerCase().includes("close")) closeHeaders++;
    res.end("ok");
  });
  server.keepAliveTimeout = SERVER_KEEPALIVE_MS;
  server.on("connection", () => conns++);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

  const outcome: Outcome = { error: null, status: null, conns: 0, ports: [], closeHeaders: 0 };
  try {
    await (await fetchFn(url)).text();
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    syncStall(STALL_MS);
    const res = await fetchFn(url);
    await res.text();
    outcome.status = res.status;
  } catch (err) {
    const e = err as { cause?: { code?: string; message?: string }; message?: string };
    const cause = (e.cause ?? e) as { code?: string; message?: string };
    outcome.error = { code: cause?.code, message: cause?.message ?? String(err) };
  }
  outcome.conns = conns;
  outcome.ports = ports;
  outcome.closeHeaders = closeHeaders;
  server.close();
  return outcome;
}

console.log("── harness client must not reuse pooled keep-alive sockets ──");

// Control: the raw client (no `connection: close`) must hit the race.
const control = await scenario(rawFetch);
assert(
  control.error !== null,
  "control: raw client (pre-fix) fails on a socket the server closed",
  control.error ? "" : `no socket error — model drifted (conns=${control.conns}, status=${control.status})`
);
assert(
  /UND_ERR_SOCKET|ECONNRESET|EPIPE|other side closed|fetch failed/i.test(
    `${control.error?.code ?? ""} ${control.error?.message ?? ""}`
  ),
  "control: failure is a socket-level error on the pooled connection",
  `got ${control.error?.code ?? "(none)"}: ${control.error?.message ?? ""}`
);

// Subject: the client the suites use must survive the same sequence.
const subject = await scenario(globalThis.fetch);
assert(
  subject.error === null && subject.status === 200,
  "harness client: request after the stall succeeds",
  subject.error ? `${subject.error.code}: ${subject.error.message}` : `status ${subject.status}`
);
assert(
  subject.conns === 2 && subject.ports.length === 2 && subject.ports[0] !== subject.ports[1],
  "harness client: no pooled socket is reused (one connection per request)",
  `conns=${subject.conns} ports=${subject.ports.join(",")}`
);
assert(
  subject.closeHeaders === 2,
  "harness client: `connection: close` present on the wire",
  `close-on-wire=${subject.closeHeaders}/2`
);

let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} harness keep-alive checks passed`);
if (failed > 0) {
  console.log("HARNESS KEEP-ALIVE CHECKS FAILED");
  process.exit(1);
}
console.log("ALL HARNESS KEEP-ALIVE CHECKS PASSED");
