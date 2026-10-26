import fs from "fs";
import path from "path";
import crypto from "crypto";
import { normalizePhone } from "./phone.ts";
import { resolveSubscriptionPlan, type PlanKey } from "./plans.ts";

export interface OnboardingProfile {
  gender?: "Laki-laki" | "Perempuan" | string;
  age?: number;
  weight?: number;
  height?: number;
  activityLevel?: "Sedentari" | "Ringan" | "Moderat" | "Aktif" | "Sangat Aktif" | string;
  workoutLocation?: "Di Rumah" | "Di Gym" | "Luar Ruangan" | "Fleksibel" | string;
  programFocus?: string[] | string;
  biggestChallenge?: string;
  communicationStyle?: string;
  /** Plan the customer actually bought; drives quota provisioning (M-6). */
  plan_key?: PlanKey;
  [key: string]: unknown;
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const STORAGE_DIR =
  process.env.ONBOARDING_DATA_DIR || path.join(process.cwd(), ".data", "onboarding");

// Replay guard: reject webhooks whose signed timestamp is older than this window.
const REPLAY_WINDOW_SECONDS = Number(process.env.SCALEV_WEBHOOK_REPLAY_WINDOW_SECONDS || 300);
// Tolerance for a clock that runs slightly ahead of ours (L-2).
const REPLAY_FUTURE_SKEW_SECONDS = 30;

export const TENANT_ID = process.env.THRIVIN_TENANT_ID || "thrivin";
export const WEBHOOK_SOURCE = "scalev";

/** Raised when required Supabase configuration is missing — never swallowed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Replay/timestamp guard. Scalev signs the raw body; a captured body can be
 * replayed forever unless we bound it in time. Accepts an ISO-8601 timestamp
 * (event `timestamp`) or a unix epoch (seconds/millis) and rejects anything
 * more than REPLAY_WINDOW_SECONDS in the past (small future skew tolerated so a
 * clock that runs slightly ahead does not lock the endpoint — L-2).
 */
export function isTimestampWithinReplayWindow(
  timestamp: string | number | null | undefined,
  now: number = Date.now()
): { ok: boolean; skewSeconds: number | null } {
  if (timestamp === null || timestamp === undefined || timestamp === "") {
    return { ok: false, skewSeconds: null };
  }
  let ms: number;
  if (typeof timestamp === "number" || /^\d+$/.test(String(timestamp))) {
    const n = Number(timestamp);
    ms = n < 1e12 ? n * 1000 : n; // seconds vs millis
  } else {
    ms = Date.parse(String(timestamp));
  }
  if (!Number.isFinite(ms)) return { ok: false, skewSeconds: null };
  const skewSeconds = (now - ms) / 1000; // positive = in the past
  if (skewSeconds < -REPLAY_FUTURE_SKEW_SECONDS) {
    return { ok: false, skewSeconds };
  }
  return { ok: skewSeconds <= REPLAY_WINDOW_SECONDS, skewSeconds };
}

/**
 * Strip PII (phone numbers, emails, tokens/keys, long digit runs) from an error
 * string before it is persisted in webhook_events_inbox.error_redacted.
 */
export function redactError(input: unknown): string {
  let s: string;
  if (input instanceof Error) {
    s = `${input.name}: ${input.message}`;
  } else if (typeof input === "object" && input !== null) {
    try {
      s = JSON.stringify(input);
    } catch {
      s = String(input);
    }
  } else {
    s = String(input ?? "");
  }
  s = s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{10,16}\b/g, "[phone]")
    .replace(/\b(sk|pk|mid|midtrans|bearer|token|secret)[_-]?[\w-]{6,}/gi, "[secret]")
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}\b/g, "[jwt]");
  // Cap the stored error at 500 chars INCLUDING the ellipsis.
  return s.length > 500 ? s.slice(0, 497) + "..." : s;
}

/** sha256 hex digest, truncated — used for opaque file names (H-3). */
function opaqueKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Local disk storage is a DEVELOPMENT-ONLY fallback (H-3).
 * In production Supabase is the only store: no plaintext PII on disk, no /tmp
 * copy shared with every other process on the box.
 */
export function diskFallbackEnabled(): boolean {
  return !IS_PRODUCTION;
}

function ensureStorageDir(): string {
  if (!diskFallbackEnabled()) {
    throw new ConfigError(
      "[OnboardingStore] Disk fallback is disabled in production; Supabase must be configured"
    );
  }
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  return STORAGE_DIR;
}

/**
 * H-1: the service-role key is the only accepted key. `SUPABASE_ANON_KEY` was
 * silently substituted before, which turned every write into an RLS denial that
 * only produced a `console.warn` — events vanished while still 200-ing Scalev.
 * A partial configuration now raises instead of degrading.
 */
export function getSupabaseConfig(): { url: string; key: string } {
  const url = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  ).replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

  if (url && !key) {
    throw new ConfigError(
      "[OnboardingStore] SUPABASE_URL is set but no service-role key " +
        "(SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY). Refusing to fall back to anon."
    );
  }
  if (key && !url) {
    throw new ConfigError("[OnboardingStore] Service-role key set but SUPABASE_URL is missing.");
  }
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

/** Fails loudly when Supabase is required and not configured (production). */
function requireSupabase(): { url: string; key: string } {
  const config = getSupabaseConfig();
  if (!config.url || !config.key) {
    throw new ConfigError(
      "[OnboardingStore] Supabase is not configured. Set SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY (disk fallback is development-only)."
    );
  }
  return config;
}

function serviceHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * H-2: only a whitelist subset of the webhook body is persisted, plus a sha256
 * of the raw body for tamper-evidence. The raw body carries customer name,
 * phone, e-mail and address — none of which audit needs.
 */
export function buildAuditPayload(
  data: Record<string, unknown> | null | undefined,
  rawBody: string
): Record<string, unknown> {
  const d = data || {};
  return {
    payment_status: (d.payment_status as string) ?? null,
    gross_revenue: (d.gross_revenue as string | number) ?? null,
    body_sha256: crypto.createHash("sha256").update(rawBody).digest("hex"),
  };
}

/**
 * Save the onboarding snapshot AFTER the order exists (H-5).
 * Pre-order writes used `order_id = NULL`, and in Postgres NULL never conflicts
 * with NULL, so `UNIQUE (tenant_id, order_id)` let every checkout insert a fresh
 * row. Writes are now upserts keyed on `(tenant_id, order_id)`.
 */
export async function saveOnboardingSnapshot(input: {
  phone: string;
  orderId: string;
  planKey?: PlanKey;
  snapshot: OnboardingProfile;
}): Promise<void> {
  const cleanPhone = normalizePhone(input.phone);
  if (!cleanPhone) throw new ConfigError("[OnboardingStore] Invalid phone number for snapshot");
  if (!input.orderId) throw new ConfigError("[OnboardingStore] orderId is required for snapshot");

  const now = new Date().toISOString();
  const snapshot: OnboardingProfile = { ...input.snapshot };
  if (input.planKey) snapshot.plan_key = input.planKey;

  const record = {
    tenant_id: TENANT_ID,
    phone: cleanPhone,
    order_id: input.orderId,
    snapshot,
    created_at: now,
  };

  if (diskFallbackEnabled()) {
    const dir = ensureStorageDir();
    try {
      // File name is a hash of the order id; the phone number is never on disk
      // in the path (H-3).
      fs.writeFileSync(
        path.join(dir, `snapshot_${opaqueKey(input.orderId)}.json`),
        JSON.stringify(record, null, 2)
      );
    } catch (err) {
      console.warn("[OnboardingStore] Failed to write local snapshot file:", redactError(err));
    }
  }

  const { url, key } = IS_PRODUCTION ? requireSupabase() : getSupabaseConfig();
  if (url && key) {
    const res = await fetch(`${url}/rest/v1/onboarding_snapshots?on_conflict=tenant_id,order_id`, {
      method: "POST",
      headers: {
        ...serviceHeaders(key),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const errText = await res.text();
      // Loud: a lost snapshot means the webhook cannot personalise the user.
      throw new Error(
        `[OnboardingStore] Supabase snapshot write failed: ${res.status} ${redactError(errText)}`
      );
    }
  }
}

/**
 * Retrieve onboarding snapshot by order id (preferred) or phone.
 */
export async function getOnboardingSnapshot(
  phone: string,
  orderId?: string | null
): Promise<OnboardingProfile | null> {
  const cleanPhone = normalizePhone(phone);

  const { url, key } = IS_PRODUCTION ? requireSupabase() : getSupabaseConfig();
  if (url && key) {
    let queryUrl = "";
    if (orderId && cleanPhone) {
      queryUrl = `${url}/rest/v1/onboarding_snapshots?order_id=eq.${encodeURIComponent(
        orderId
      )}&phone=eq.${encodeURIComponent(cleanPhone)}&order=created_at.desc&limit=1`;
    } else if (orderId) {
      queryUrl = `${url}/rest/v1/onboarding_snapshots?order_id=eq.${encodeURIComponent(
        orderId
      )}&order=created_at.desc&limit=1`;
    } else if (cleanPhone) {
      queryUrl = `${url}/rest/v1/onboarding_snapshots?phone=eq.${encodeURIComponent(
        cleanPhone
      )}&order=created_at.desc&limit=1`;
    }
    if (queryUrl) {
      const res = await fetch(queryUrl, {
        headers: { ...serviceHeaders(key), Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`[OnboardingStore] Supabase snapshot read failed: ${res.status}`);
      }
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.snapshot) {
        return rows[0].snapshot as OnboardingProfile;
      }
    }
  }

  if (diskFallbackEnabled()) {
    const dir = ensureStorageDir();
    try {
      const candidates = orderId
        ? [path.join(dir, `snapshot_${opaqueKey(orderId)}.json`)]
        : [];
      if (cleanPhone) candidates.push(path.join(dir, `phone_${opaqueKey(cleanPhone)}.json`));
      for (const file of candidates) {
        if (fs.existsSync(file)) {
          const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
          if (cleanPhone && raw?.phone && raw.phone !== cleanPhone) {
            continue;
          }
          if (raw?.snapshot) return raw.snapshot as OnboardingProfile;
        }
      }
    } catch (err) {
      console.warn("[OnboardingStore] Disk read snapshot error:", redactError(err));
    }
  }

  return null;
}

/**
 * Record Nina's first-touch greeting status in Supabase.
 * `sent` = an APPROVED template was accepted by Meta (deliverable outside the
 * 24h window). `sent_unverified` = free-form text accepted, but no template was
 * configured, so delivery to a first-time recipient is not guaranteed.
 */
export async function recordGreetingStatus(orderId: string, status: string): Promise<void> {
  if (!orderId) return;
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return;
  try {
    await fetch(
      `${url}/rest/v1/onboarding_snapshots?tenant_id=eq.${TENANT_ID}&order_id=eq.${encodeURIComponent(
        orderId
      )}`,
      {
        method: "PATCH",
        headers: { ...serviceHeaders(key), Prefer: "return=minimal" },
        body: JSON.stringify({
          first_greeting_status: status,
          first_greeting_sent_at: new Date().toISOString(),
        }),
      }
    );
  } catch (err) {
    console.warn("[OnboardingStore] Failed to update greeting status:", redactError(err));
  }
}

export interface WebhookClaim {
  eventId: string;
  eventType: string;
  orderId?: string | null;
  phone?: string | null;
  fulfillmentKey: string;
  payload: Record<string, unknown>;
}

export interface WebhookClaimResult {
  /** True only for the delivery that won the atomic insert; losers must not activate. */
  claimed: boolean;
  id?: string;
}

/**
 * H-6: idempotency is claimed by the INSERT itself, not by a read-then-write.
 *
 * The previous flow did `isWebhookEventProcessed()` (read) ... `await` network
 * ... `activateUserSubscription()` (write). Two concurrent deliveries of the
 * same order (`paid` then `settled`) both read "not processed" and both
 * activated, producing two subscriptions and double token quota.
 *
 * Now: one INSERT with `Prefer: resolution=ignore-duplicates` against the
 * unique index on `(tenant_id, source, fulfillment_key)`. PostgREST returns the
 * inserted row only to the winner; the loser gets an empty array or 409 and
 * must stop.
 */
export async function claimWebhookEvent(claim: WebhookClaim): Promise<WebhookClaimResult> {
  const cleanPhone = claim.phone ? normalizePhone(claim.phone) : null;
  const record = {
    tenant_id: TENANT_ID,
    source: WEBHOOK_SOURCE,
    event_id: claim.eventId,
    fulfillment_key: claim.fulfillmentKey,
    event_type: claim.eventType,
    order_id: claim.orderId || null,
    phone: cleanPhone,
    payload_version: "v2",
    payload: claim.payload,
    status: "processing",
  };

  const { url, key } = requireSupabase();

  const res = await fetch(
    `${url}/rest/v1/webhook_events_inbox?on_conflict=tenant_id,source,fulfillment_key`,
    {
      method: "POST",
      headers: {
        ...serviceHeaders(key),
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify(record),
    }
  );

  if (res.status === 409) return { claimed: false };
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[OnboardingStore] Webhook claim failed: ${res.status} ${redactError(errText)}`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return { claimed: false };
  return { claimed: true, id: rows[0]?.id };
}

/** Terminal status update for a claimed event. Never throws into the webhook path. */
export async function finalizeWebhookEvent(
  eventId: string,
  opts: { status: "completed" | "failed"; error?: unknown }
): Promise<void> {
  try {
    const { url, key } = requireSupabase();
    await fetch(
      `${url}/rest/v1/webhook_events_inbox?tenant_id=eq.${TENANT_ID}&source=eq.${WEBHOOK_SOURCE}&event_id=eq.${encodeURIComponent(
        eventId
      )}`,
      {
        method: "PATCH",
        headers: { ...serviceHeaders(key), Prefer: "return=minimal" },
        body: JSON.stringify({
          status: opts.status,
          processed_at: new Date().toISOString(),
          error_redacted: opts.error ? redactError(opts.error) : null,
        }),
      }
    );
  } catch (err) {
    console.warn("[OnboardingStore] Failed to finalize webhook event:", redactError(err));
  }
}

/**
 * Format Nina user profile memory text so Nina's first greeting is aware of the
 * user's stats and preferences.
 */
export function formatNinaProfileMemory(
  customerName: string,
  phone: string,
  snapshot?: OnboardingProfile | null
): string {
  const cleanPhone = normalizePhone(phone) || "";
  const name = customerName || "Kawan Thrivin";

  if (!snapshot) {
    return [
      `Profil Pengguna:`,
      `- Nama: ${name}`,
      `- WhatsApp: ${cleanPhone}`,
      `- Status Onboarding: Selesai via Web Checkout`,
    ].join("\n");
  }

  const focusStr = Array.isArray(snapshot.programFocus)
    ? snapshot.programFocus.join(", ")
    : snapshot.programFocus || "-";

  return [
    `Profil Pengguna:`,
    `- Nama: ${name}`,
    `- WhatsApp: ${cleanPhone}`,
    `- Gender: ${snapshot.gender || "-"}`,
    `- Usia: ${snapshot.age ? `${snapshot.age} tahun` : "-"}`,
    `- Berat Badan: ${snapshot.weight ? `${snapshot.weight} kg` : "-"}`,
    `- Tinggi Badan: ${snapshot.height ? `${snapshot.height} cm` : "-"}`,
    `- Tingkat Aktivitas: ${snapshot.activityLevel || "-"}`,
    `- Tempat Latihan: ${snapshot.workoutLocation || "-"}`,
    `- Fokus Program: ${focusStr}`,
    `- Tantangan Terbesar: ${snapshot.biggestChallenge || "-"}`,
    `- Gaya Komunikasi: ${snapshot.communicationStyle || "Santai & Akrab"}`,
    `- Status Onboarding: Selesai via Web Checkout`,
  ].join("\n");
}

/**
 * Activate user + subscription in Supabase.
 *
 * Must only be called by the delivery that won `claimWebhookEvent` (H-6).
 * Quota comes from the plan recorded on the snapshot, never hardcoded (M-6).
 */
export async function activateUserSubscription(
  phone: string,
  name: string,
  snapshot: OnboardingProfile | null
): Promise<{ success: boolean; memory: string; userId?: string }> {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) {
    return { success: false, memory: "", userId: undefined };
  }
  const memoryText = formatNinaProfileMemory(name, cleanPhone, snapshot);

  const { url, key } = IS_PRODUCTION ? requireSupabase() : getSupabaseConfig();
  if (!url || !key) {
    // Development only: no Supabase configured, nothing to write.
    console.log("[OnboardingStore] Dev mode: skipping Supabase activation (plan from snapshot)");
    return { success: true, memory: memoryText, userId: "local-user-id" };
  }

  const plan = resolveSubscriptionPlan(snapshot?.plan_key);

  const upsertRes = await fetch(`${url}/rest/v1/users?on_conflict=phone`, {
    method: "POST",
    headers: {
      ...serviceHeaders(key),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      phone: cleanPhone,
      name: name || "Kawan Thrivin",
      memory: memoryText,
      onboarding_complete: true,
      onboarding_step: "done",
      onboarding_data: snapshot || {},
      updated_at: new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) {
    const errText = await upsertRes.text();
    throw new Error(
      `[OnboardingStore] Supabase user upsert failed: ${upsertRes.status} ${redactError(errText)}`
    );
  }

  const usersData = await upsertRes.json();
  const userId: string | undefined = Array.isArray(usersData) ? usersData[0]?.id : undefined;
  if (!userId) {
    throw new Error("[OnboardingStore] Supabase user upsert returned no id");
  }

  const expiresAt = new Date(
    Date.now() + plan.durationDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const subRes = await fetch(`${url}/rest/v1/subscriptions`, {
    method: "POST",
    headers: { ...serviceHeaders(key), Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      plan_id: plan.planId,
      status: "active",
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
      token_used: 0,
      token_limit: plan.tokenLimit,
    }),
  });

  if (!subRes.ok) {
    const errText = await subRes.text();
    throw new Error(
      `[OnboardingStore] Supabase subscription insert failed: ${subRes.status} ${redactError(errText)}`
    );
  }

  return { success: true, memory: memoryText, userId };
}