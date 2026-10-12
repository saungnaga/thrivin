import fs from "fs";
import path from "path";

export interface OnboardingProfile {
  gender?: "Laki-laki" | "Perempuan" | string;
  age?: number;
  weight?: number;
  height?: number;
  activityLevel?: "Sedentari" | "Ringan" | "Moderat" | "Aktif" | "Sangat Aktif" | string;
  workoutLocation?: "Di Rumah" | "Di Gym" | "Luar Ruangan" | "Fleksibel" | string;
  programFocus?: string[] | string;
  biggestChallenge?: string;
  communicationStyle?: "Santai & Akrab" | "Tegas & Terarah" | "Lembut & Empatik" | string;
  [key: string]: any;
}

const STORAGE_DIR = process.env.ONBOARDING_DATA_DIR || path.join(process.cwd(), ".data", "onboarding");

// Replay guard: reject webhooks whose signed timestamp is older than this window.
const REPLAY_WINDOW_SECONDS = Number(process.env.SCALEV_WEBHOOK_REPLAY_WINDOW_SECONDS || 300);

/**
 * Replay/timestamp guard. Scalev signs the raw body; a captured body can be
 * replayed forever unless we bound it in time. Accepts an ISO-8601 timestamp
 * (event `created_at`) or a unix epoch (seconds/millis) and rejects anything
 * outside +/- REPLAY_WINDOW_SECONDS of now.
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
  const skewSeconds = Math.abs(now - ms) / 1000;
  return { ok: skewSeconds <= REPLAY_WINDOW_SECONDS, skewSeconds };
}

/**
 * Strip PII (phone numbers, emails, tokens/keys, long digit runs) from an error
 * string before it is persisted in webhook_events_inbox.error_redacted.
 */
export function redactError(input: unknown): string {
  let s = input instanceof Error ? input.message : String(input ?? "");
  s = s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{10,16}\b/g, "[phone]")
    .replace(/\b(sk|pk|mid|midtrans|bearer|token|secret)[_-]?[\w-]{6,}/gi, "[secret]")
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}\b/g, "[jwt]");
  return s.length > 500 ? s.slice(0, 500) + "…" : s;
}

function ensureStorageDir(): string {
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    return STORAGE_DIR;
  } catch {
    const tmpDir = path.join("/tmp", "thrivin-onboarding");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  return { url: url.replace(/\/$/, ""), key };
}

function safeNormalizePhone(phone: string): string {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.length > 0 && !clean.startsWith("62")) {
    clean = "62" + clean;
  }
  return clean;
}

/**
 * Save onboarding snapshot to Supabase and persistent local disk.
 */
export async function saveOnboardingSnapshot(
  phone: string,
  orderId: string | null,
  snapshot: OnboardingProfile
): Promise<void> {
  const cleanPhone = safeNormalizePhone(phone);
  const now = new Date().toISOString();
  const dir = ensureStorageDir();

  const record = {
    phone: cleanPhone,
    order_id: orderId || null,
    snapshot,
    created_at: now,
  };

  // 1. Local disk fallback
  try {
    if (cleanPhone) {
      fs.writeFileSync(path.join(dir, `phone_${cleanPhone}.json`), JSON.stringify(record, null, 2));
    }
    if (orderId) {
      fs.writeFileSync(path.join(dir, `order_${orderId}.json`), JSON.stringify(record, null, 2));
    }
  } catch (err) {
    console.warn("[OnboardingStore] Failed to write local snapshot file:", err);
  }

  // 2. Supabase staging if configured
  const { url, key } = getSupabaseConfig();
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/onboarding_snapshots`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          phone: cleanPhone,
          order_id: orderId || null,
          snapshot,
          created_at: now,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.warn("[OnboardingStore] Supabase save snapshot warning:", res.status, errText);
      }
    } catch (err) {
      console.warn("[OnboardingStore] Supabase network error saving snapshot:", err);
    }
  }
}

/**
 * Retrieve onboarding snapshot by phone or orderId.
 */
export async function getOnboardingSnapshot(
  phone: string,
  orderId?: string | null
): Promise<OnboardingProfile | null> {
  const cleanPhone = safeNormalizePhone(phone);

  // 1. Check Supabase first if available
  const { url, key } = getSupabaseConfig();
  if (url && key) {
    try {
      let queryUrl = "";
      if (orderId) {
        queryUrl = `${url}/rest/v1/onboarding_snapshots?order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc&limit=1`;
      } else if (cleanPhone) {
        queryUrl = `${url}/rest/v1/onboarding_snapshots?phone=eq.${encodeURIComponent(cleanPhone)}&order=created_at.desc&limit=1`;
      }

      if (queryUrl) {
        const res = await fetch(queryUrl, {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0 && rows[0]?.snapshot) {
            return rows[0].snapshot;
          }
        }
      }
    } catch (err) {
      console.warn("[OnboardingStore] Supabase fetch snapshot error, falling back to disk:", err);
    }
  }

  // 2. Local disk fallback
  const dir = ensureStorageDir();
  try {
    if (orderId) {
      const orderFile = path.join(dir, `order_${orderId}.json`);
      if (fs.existsSync(orderFile)) {
        const raw = JSON.parse(fs.readFileSync(orderFile, "utf-8"));
        if (raw?.snapshot) return raw.snapshot;
      }
    }
    if (cleanPhone) {
      const phoneFile = path.join(dir, `phone_${cleanPhone}.json`);
      if (fs.existsSync(phoneFile)) {
        const raw = JSON.parse(fs.readFileSync(phoneFile, "utf-8"));
        if (raw?.snapshot) return raw.snapshot;
      }
    }
  } catch (err) {
    console.warn("[OnboardingStore] Disk read snapshot error:", err);
  }

  return null;
}

/**
 * Check if webhook event or order was already processed (Idempotency).
 */
export async function isWebhookEventProcessed(
  eventId: string,
  orderId?: string | null
): Promise<boolean> {
  // Check local disk first
  const dir = ensureStorageDir();
  const eventFile = path.join(dir, `event_${eventId}.json`);
  if (fs.existsSync(eventFile)) {
    return true;
  }
  if (orderId) {
    const processedOrderFile = path.join(dir, `order_processed_${orderId}.json`);
    if (fs.existsSync(processedOrderFile)) {
      return true;
    }
  }

  // Check Supabase
  const { url, key } = getSupabaseConfig();
  if (url && key) {
    try {
      const res = await fetch(
        `${url}/rest/v1/webhook_events_inbox?event_id=eq.${encodeURIComponent(eventId)}&select=id,status`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
          },
        }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return true;
        }
      }
    } catch (err) {
      console.warn("[OnboardingStore] Supabase check webhook dedup error:", err);
    }
  }

  return false;
}

/**
 * Record received webhook event into inbox.
 */
export async function recordWebhookEvent(
  eventId: string,
  eventType: string,
  payload: any,
  orderId?: string | null,
  phone?: string | null,
  opts?: { status?: string; error?: unknown; payloadVersion?: string }
): Promise<void> {
  const dir = ensureStorageDir();
  const now = new Date().toISOString();
  const cleanPhone = phone ? safeNormalizePhone(phone) : null;

  // Allowed status transitions: received -> processing -> completed | failed;
  // duplicate marks a replay seen after completion.
  const status = opts?.status || "completed";
  const record = {
    event_id: eventId,
    event_type: eventType,
    order_id: orderId || null,
    phone: cleanPhone,
    payload_version: opts?.payloadVersion || "v2",
    payload,
    status,
    error_redacted: opts?.error ? redactError(opts.error) : null,
    received_at: now,
    processed_at: status === "completed" || status === "failed" ? now : null,
  };

  try {
    fs.writeFileSync(path.join(dir, `event_${eventId}.json`), JSON.stringify(record, null, 2));
    if (orderId) {
      fs.writeFileSync(path.join(dir, `order_processed_${orderId}.json`), JSON.stringify(record, null, 2));
    }
  } catch (err) {
    console.warn("[OnboardingStore] Failed to write event inbox file:", err);
  }

  const { url, key } = getSupabaseConfig();
  if (url && key) {
    try {
      await fetch(`${url}/rest/v1/webhook_events_inbox`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(record),
      });
    } catch (err) {
      console.warn("[OnboardingStore] Supabase record webhook event error:", err);
    }
  }
}

/**
 * Format Nina user profile memory text so Nina's first greeting is aware of user's stats and preferences.
 */
export function formatNinaProfileMemory(
  customerName: string,
  phone: string,
  snapshot?: OnboardingProfile | null
): string {
  const cleanPhone = safeNormalizePhone(phone);
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
 * Activate user in Supabase staging (users and subscriptions).
 */
export async function activateUserSubscription(
  phone: string,
  name: string,
  snapshot: OnboardingProfile | null,
  planOptions?: { planName?: string; durationDays?: number }
): Promise<{ success: boolean; memory: string; userId?: string }> {
  const cleanPhone = safeNormalizePhone(phone);
  const memoryText = formatNinaProfileMemory(name, cleanPhone, snapshot);
  const durationDays = planOptions?.durationDays || 30;

  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    // If Supabase is not configured (e.g. offline testing), record locally
    console.log(`[OnboardingStore] Mock activating user ${cleanPhone} (${name}) with memory:`, memoryText);
    return { success: true, memory: memoryText, userId: "local-user-id" };
  }

  try {
    // 1. Upsert user in `users`
    const upsertRes = await fetch(`${url}/rest/v1/users`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
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

    let userId: string | undefined;
    if (upsertRes.ok) {
      const usersData = await upsertRes.json();
      if (Array.isArray(usersData) && usersData.length > 0) {
        userId = usersData[0]?.id;
      }
    } else {
      // If table users has unique constraint on phone, fetch user id
      const fetchUser = await fetch(`${url}/rest/v1/users?phone=eq.${encodeURIComponent(cleanPhone)}&select=id`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (fetchUser.ok) {
        const u = await fetchUser.json();
        userId = u?.[0]?.id;
      }
    }

    // 2. Activate subscription if userId is available
    if (userId) {
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
      await fetch(`${url}/rest/v1/subscriptions`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          user_id: userId,
          plan_id: 2, // Pro plan default
          status: "active",
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          token_used: 0,
          token_limit: 500000,
        }),
      });
    }

    return { success: true, memory: memoryText, userId };
  } catch (err) {
    console.error("[OnboardingStore] Failed to activate user in Supabase:", err);
    return { success: false, memory: memoryText };
  }
}
