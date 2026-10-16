/**
 * Local Supabase stand-in for the Scalev webhook tests.
 *
 * Real Postgres + real PostgREST, so the route tests actually exercise the
 * constraints that make the remediation work (H-5 unique index, H-6 unique
 * fulfillment key with ON CONFLICT DO NOTHING, RLS deny policies).
 *
 * Why not just hit Supabase staging: staging is a shared dataset, and the tests
 * must never write to it. See thrivin-team-sop / securing-agent-data-access.
 */
import crypto from "crypto";
import fs from "fs";
import { spawn } from "child_process";
import { execFileSync } from "child_process";

export const PG_HOST = process.env.HARNESS_PG_HOST || "127.0.0.1";
export const PG_PORT = process.env.HARNESS_PG_PORT || "5432";
export const PG_DB = process.env.HARNESS_PG_DB || "thrivin_remediation_test";
export const PG_USER = "authenticator";
export const PG_PASSWORD = process.env.HARNESS_PG_PASSWORD || "localtestpw";
export const PG_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}`;

export const POSTGREST_PORT = Number(process.env.HARNESS_POSTGREST_PORT || 54321);
export const POSTGREST_URL = `http://127.0.0.1:${POSTGREST_PORT}`;
/** PostgREST listens here; the app only ever sees POSTGREST_URL (prefix proxy). */
export const POSTGREST_UPSTREAM_PORT = Number(
  process.env.HARNESS_POSTGREST_UPSTREAM_PORT || 54322
);
export const JWT_SECRET =
  process.env.HARNESS_JWT_SECRET || "super-secret-jwt-key-with-at-least-32-chars-long";

export const POSTGREST_BIN = process.env.POSTGREST_BIN || "/tmp/postgrest";

/** HS256 JWT PostgREST accepts; `role` selects which DB role the request runs as. */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string = JWT_SECRET
): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: "postgrest", role: "anon", exp: 4_000_000_000, ...payload });
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export const SERVICE_KEY = signJwt({ role: "service_role" });
export const ANON_KEY = signJwt({ role: "anon" });

export function hasPsql(): boolean {
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Run SQL as the postgres superuser via `sudo -u postgres` (peer auth). */
export function psqlSuper(sql: string, { db = PG_DB, csv = false } = {}): string {
  const args = ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", db];
  if (csv) args.push("-At", "-F", "|");
  args.push("-c", sql);
  return execFileSync("sudo", args, { encoding: "utf-8" }).trim();
}

export function createDatabase(): void {
  psqlSuper(`CREATE DATABASE ${PG_DB} OWNER postgres;`, { db: "postgres" });
}

export function databaseExists(): boolean {
  const out = psqlSuper(
    `SELECT 1 FROM pg_database WHERE datname = '${PG_DB}';`,
    { db: "postgres" }
  );
  return out.includes("1");
}

export function applySqlFile(file: string): void {
  // File is read as ubuntu and streamed to psql: postgres cannot traverse
  // /home/ubuntu, so `-f <path>` would fail with EACCES.
  execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", PG_DB, "-q", "-f", "-"],
    { input: fs.readFileSync(file), stdio: ["pipe", "ignore", "inherit"] }
  );
}

async function waitForHttp(url: string, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export interface RunningStack {
  stop: () => void;
}

export async function startPostgrest(): Promise<RunningStack | null> {
  if (!fs.existsSync(POSTGREST_BIN)) {
    console.warn(`[harness] PostgREST binary not found at ${POSTGREST_BIN} — skipping`);
    return null;
  }

  // Probe the /rest/v1 root THROUGH THE PROXY: 404 there means not up yet.
  // (PostgREST 16.x has no `server-root-spec` — writing it is silently ignored
  // and bare /rest/v1/ paths 404 with PGRST125. Supabase hides PostgREST behind
  // Kong, which strips /rest/v1; prefix-proxy.mjs mirrors that. See its header.)
  try {
    const res = await fetch(`${POSTGREST_URL}/rest/v1/`);
    if (res.status !== 404) return { stop: () => {} }; // already up (behind proxy)
  } catch {
    /* not running */
  }

  const upstreamConfig = "/tmp/thrivin-harness-postgrest.conf";
  const proxyScript = new URL("./prefix-proxy.mjs", import.meta.url).pathname;
  fs.writeFileSync(
    upstreamConfig,
    [
      `db-uri = "${PG_URL}"`,
      `db-schemas = "public"`,
      `db-anon-role = "anon"`,
      `server-port = ${POSTGREST_UPSTREAM_PORT}`,
      `jwt-secret = "${JWT_SECRET}"`,
      "",
    ].join("\n")
  );

  const upstream = spawn(POSTGREST_BIN, [upstreamConfig], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  upstream.stderr.on("data", (d) => process.stderr.write(`[postgrest] ${d}`));
  upstream.unref();

  await waitForHttp(`http://127.0.0.1:${POSTGREST_UPSTREAM_PORT}/`);

  const proxy = spawn(process.execPath, [proxyScript, String(POSTGREST_PORT), String(POSTGREST_UPSTREAM_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  proxy.stderr.on("data", (d) => process.stderr.write(`[prefix-proxy] ${d}`));
  proxy.unref();

  await waitForHttp(`${POSTGREST_URL}/rest/v1/`);
  return {
    stop: () => {
      for (const child of [proxy, upstream]) {
        try {
          process.kill(-(child.pid as number), "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    },
  };
}

export function truncateAll(): void {
  psqlSuper(
    "TRUNCATE webhook_events_inbox, onboarding_snapshots, subscriptions, users, " +
      "promo_redemptions, promo_codes, consent_events, onboarding_progress, " +
      "checkout_claims RESTART IDENTITY CASCADE;"
  );
}

export function countRows(table: string, where = "TRUE"): number {
  const out = psqlSuper(`SELECT count(*) FROM ${table} WHERE ${where};`, { csv: true });
  return Number(out.split("\n").pop());
}

export function query<T = Record<string, unknown>>(sql: string): T[] {
  const out = psqlSuper(sql, { csv: true });
  if (!out) return [];
  return out.split("\n").map((line) => line.split("|") as unknown as T);
}