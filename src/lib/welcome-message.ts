import fs from "fs";
import path from "path";
import { normalizePhone } from "./phone.ts";
import { redactError } from "./onboarding-store.ts";
import {
  readCloudConfig,
  readWelcomeTemplate,
  sendCloudTemplate,
  sendCloudText,
} from "./wa-cloud.ts";

/**
 * Outbound first-touch greeting Nina sends right after a payment completes.
 *
 * Content lives here (not in the webhook route) so copy can change without
 * touching payment logic. Bubbles are separated by "\n---\n" — that is the
 * bubble boundary the copy was written against. Cloud API sends one text per
 * call, so delivery joins the bubbles with a blank line.
 *
 * Delivery is Cloud API ONLY. The Baileys bridge must never be called from the
 * purchase/postpaid path, even if its env vars are still configured — that is
 * how greetings used to come from the old number.
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

/** Log-safe phone reference: never the full number (Sentinel M-4 / W-6). */
export function maskedPhone(phone: string): string {
  const clean = String(phone || "").replace(/\D/g, "");
  return clean.length >= 4 ? `***${clean.slice(-4)}` : "***";
}

/**
 * Best-effort delivery of a first-touch greeting over WhatsApp Cloud API.
 *
 * NEVER throws and NEVER falls back to another channel: a dead Cloud binding or
 * a bad number must not fail a webhook that already activated a subscription,
 * and must not resurrect the Baileys bridge.
 *
 * A brand-new buyer usually has no open 24h window, so Graph answers 131047
 * (re-engagement). That path retries exactly once with the APPROVED welcome
 * template; with no template configured the send is recorded as failed.
 */
export async function sendWelcomeMessage(
  phone: string,
  message: string,
  name?: string | null
): Promise<{ sent: boolean; reason?: string; messageId?: string }> {
  const to = normalizePhone(phone);
  if (!to) {
    console.warn(
      `[WelcomeMessage] Invalid WhatsApp number (${maskedPhone(phone)}) — skipping first-touch greeting`
    );
    return { sent: false, reason: "invalid_phone" };
  }

  const cfg = readCloudConfig();
  if (!cfg) {
    console.warn(
      "[WelcomeMessage] WhatsApp Cloud binding not configured (PHONE_NUMBER_ID/ACCESS_TOKEN) — greeting NOT sent"
    );
    return { sent: false, reason: "cloud_not_configured" };
  }

  const body = splitBubbles(message).join("\n\n");
  let result = await sendCloudText(cfg, to, body);

  // 131047: outside the 24h customer-service window (or never opened). Only an
  // approved template may open it — and only if the owner configured one.
  if (!result.ok && result.errorCode === 131047) {
    const template = readWelcomeTemplate();
    if (!template) {
      console.warn(
        `[WelcomeMessage] 24h window closed (${maskedPhone(phone)}) and no approved welcome template configured — greeting NOT sent`
      );
      return { sent: false, reason: "template_not_configured" };
    }
    result = await sendCloudTemplate(cfg, to, template, name);
  }

  if (!result.ok) {
    console.warn(
      `[WelcomeMessage] Cloud send failed (${maskedPhone(phone)}): ${result.reason || "unknown"}${
        result.errorCode ? ` code=${result.errorCode}` : ""
      }`
    );
    return { sent: false, reason: result.reason || "cloud_send_failed" };
  }
  return { sent: true, messageId: result.messageId };
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
