import fs from "fs";
import path from "path";
import { normalizePhone } from "./phone.ts";
import { redactError } from "./onboarding-store.ts";

/**
 * Outbound first-touch greeting Nina sends right after a payment completes.
 *
 * Content lives here (not in the webhook route) so copy can change without
 * touching payment logic. Bubbles are separated by "\n---\n" — that is the exact
 * separator the WhatsApp bridge splits on (whatsapp-bridge/bridge.js:847).
 */
const BUBBLE_SEPARATOR = "\n---\n";

/** Minimal structural shape we need — keeps this module dependency-free. */
export interface WelcomeProfile {
  programFocus?: string[] | string | null;
  [key: string]: unknown;
}

/** Max bubbles the bridge/Nina voice allows (SOUL.md: 3-5 short bubbles). */
export const MAX_BUBBLES = 5;

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function focusLabel(snapshot?: WelcomeProfile | null): string {
  if (!snapshot) return "";
  const raw = snapshot.programFocus;
  const list = Array.isArray(raw) ? raw : hasText(raw) ? [raw as string] : [];
  return list
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

/**
 * Build Nina's welcome message. Returns bubbles joined by the bridge separator.
 * Handles: full onboarding data, partial data (no goal), and missing name.
 */
export function buildWelcomeMessage(
  name?: string | null,
  snapshot?: WelcomeProfile | null
): string {
  const cleanName = hasText(name) ? String(name).trim() : "";
  const focus = focusLabel(snapshot);

  const bubbles = [
    cleanName
      ? `Halo ${cleanName}! 👋 Selamat datang di Thrivin 😊`
      : `Halo! 👋 Selamat datang di Thrivin 😊`,
    `Aku Nina, aku bakal nemenin perjalanan fitness kamu.`,
    focus
      ? `Aku udah baca profil kamu — fokus kamu ${focus}. Nanti aku bantu susun langkah kecilnya ya.`
      : `Ceritain dong, fokus latihan kamu apa? Nanti aku bantu susun langkah kecilnya.`,
    `Siap mulai dari mana nih?`,
  ];

  return bubbles.slice(0, MAX_BUBBLES).join(BUBBLE_SEPARATOR);
}

/** Split a built message the same way the bridge does — used to assert parity. */
export function splitBubbles(message: string): string[] {
  return message
    .split(BUBBLE_SEPARATOR)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Normalise to a WhatsApp JID using shared phone validator (M-5).
 * Returns null for input that is not a plausible Indonesian mobile number.
 */
export function toWhatsAppChatId(phone: string): string | null {
  const clean = normalizePhone(phone);
  if (!clean) return null;
  return `${clean}@s.whatsapp.net`;
}

/** Log-safe phone reference: never the full number (Sentinel M-4 / W-6). */
export function maskedPhone(phone: string): string {
  const clean = String(phone || "").replace(/\D/g, "");
  return clean.length >= 4 ? `***${clean.slice(-4)}` : "***";
}

function bridgeUrl(): string {
  return (process.env.WHATSAPP_BRIDGE_URL || "").trim().replace(/\/+$/, "");
}

/**
 * Best-effort delivery of a first-touch greeting. NEVER throws: a dead bridge
 * or bad number must not fail a webhook that already activated a subscription.
 */
export async function sendWelcomeMessage(
  phone: string,
  message: string
): Promise<{ sent: boolean; reason?: string; messageId?: string }> {
  const base = bridgeUrl();
  if (!base) {
    console.warn(
      "[WelcomeMessage] WHATSAPP_BRIDGE_URL not configured — skipping first-touch greeting"
    );
    return { sent: false, reason: "bridge_url_not_configured" };
  }

  const chatId = toWhatsAppChatId(phone);
  if (!chatId) {
    console.warn(
      `[WelcomeMessage] Invalid WhatsApp number (${maskedPhone(phone)}) — skipping first-touch greeting`
    );
    return { sent: false, reason: "invalid_phone" };
  }

  try {
    const res = await fetch(`${base}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(
        `[WelcomeMessage] Bridge rejected first-touch greeting (${maskedPhone(phone)}): HTTP ${res.status}`
      );
      return { sent: false, reason: `bridge_http_${res.status}` };
    }
    const body = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { sent: true, messageId: body?.messageId };
  } catch (err) {
    console.warn(
      `[WelcomeMessage] Bridge unreachable (${maskedPhone(phone)}): ${redactError(err)}`
    );
    return { sent: false, reason: "bridge_unreachable" };
  }
}

const WELCOME_DIR =
  process.env.WELCOME_MARKER_DIR ||
  path.join(
    process.env.ONBOARDING_DATA_DIR || path.join(process.cwd(), ".data", "onboarding"),
    "welcome"
  );

/**
 * Claim the right to send exactly one greeting per fulfillment.
 * In dev/test: uses atomic O_EXCL file marker.
 * In production: deduplication relies on DB fulfillment claim; no disk markers.
 */
export function claimWelcomeSend(fulfillmentKey: string): boolean {
  if (!fulfillmentKey) return true;
  if (process.env.NODE_ENV === "production" && !process.env.WELCOME_MARKER_DIR) {
    return true;
  }
  const safeKey = String(fulfillmentKey).replace(/[^\w.-]/g, "_").slice(0, 120);
  try {
    fs.mkdirSync(WELCOME_DIR, { recursive: true });
    fs.writeFileSync(path.join(WELCOME_DIR, `welcome_${safeKey}.marker`), "", {
      flag: "wx",
    });
    return true;
  } catch (err: any) {
    if (err?.code === "EEXIST") return false;
    console.warn("[WelcomeMessage] Could not write welcome marker:", redactError(err));
    return true;
  }
}
