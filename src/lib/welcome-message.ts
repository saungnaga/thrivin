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
    `Aku Nina, companion fitness kamu. Aku bakal bantu latihan, nutrisi, dan konsistensi harianmu.`,
    focus
      ? `Aku udah baca profil kamu — fokus kamu ${focus}. Kita lanjut dari situ, bukan mulai dari nol.`
      : `Nanti kita susun langkah kecil yang paling cocok buat kamu.`,
    `Yang bisa kamu pakai: kirim foto makanan untuk dibantu estimasi kalori dan protein, kirim screenshot aktivitas untuk dibahas progresnya, dan minta aku pasang pengingat latihan atau kebiasaan harian.`,
    `Mau mulai dari mana? Kirim foto makananmu, screenshot latihan, atau bilang aja targetmu hari ini.`,
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
 * Short {{2}}-style context line for an approved greeting template.
 * Only used when the template has a second body parameter.
 */
export function buildWelcomeContext(focus?: string): string {
  const clean = hasText(focus) ? String(focus).trim() : "";
  return clean
    ? `Selamat datang di Thrivin! Fokus kamu ${clean} udah aku catat ya.`
    : `Selamat datang di Thrivin! Profil kamu udah aku catat ya.`;
}

export interface WelcomeSendResult {
  sent: boolean;
  /** `template` = Meta accepted an APPROVED template (deliverable outside the 24h window). */
  via?: "template" | "text";
  /** Only a template send is delivery-safe for a first-time recipient. */
  verified?: boolean;
  reason?: string;
  messageId?: string;
}

/**
 * Best-effort delivery of a first-touch greeting over WhatsApp Cloud API.
 *
 * NEVER throws and NEVER falls back to another channel: a dead Cloud binding or
 * a bad number must not fail a webhook that already activated a subscription,
 * and must not resurrect the Baileys bridge.
 *
 * A brand-new buyer has no open 24h window BY DEFINITION, and Meta does not
 * deliver free-form text there — it may even answer HTTP 200 and fail the
 * delivery asynchronously (status webhook), which is why an accepted text was
 * previously recorded as "sent" while nothing arrived. So when an APPROVED
 * welcome template is configured we send that FIRST; text is only the fallback
 * for a recipient that already has an open window (re-purchase), and such a
 * send is reported as unverified.
 */
export async function sendWelcomeMessage(
  phone: string,
  message: string,
  name?: string | null,
  context?: string | null
): Promise<WelcomeSendResult> {
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

  const template = readWelcomeTemplate();

  // First touch = closed window: only an approved template can be delivered.
  if (template) {
    const templated = await sendCloudTemplate(cfg, to, template, name, context);
    if (templated.ok) {
      return { sent: true, via: "template", verified: true, messageId: templated.messageId };
    }
    console.warn(
      `[WelcomeMessage] Approved template send failed (${maskedPhone(phone)}): ${
        templated.reason || "unknown"
      }${templated.errorCode ? ` code=${templated.errorCode}` : ""} — falling back to text`
    );
  }

  const body = splitBubbles(message).join("\n\n");
  const result = await sendCloudText(cfg, to, body);

  if (!result.ok) {
    if (result.errorCode === 131047 && !template) {
      console.warn(
        `[WelcomeMessage] 24h window closed (${maskedPhone(phone)}) and no approved welcome template configured — greeting NOT delivered`
      );
    }
    console.warn(
      `[WelcomeMessage] Cloud send failed (${maskedPhone(phone)}): ${result.reason || "unknown"}${
        result.errorCode ? ` code=${result.errorCode}` : ""
      }`
    );
    return {
      sent: false,
      reason:
        result.errorCode === 131047 && !template ? "template_not_configured" : result.reason || "cloud_send_failed",
    };
  }

  if (!template) {
    // Meta accepted a free-form message, but for a first-time recipient there is
    // no window to accept it in: acceptance is NOT delivery. Say so out loud.
    console.warn(
      `[WelcomeMessage] Text accepted for ${maskedPhone(phone)} with NO approved welcome template configured — delivery to a first-time recipient is not guaranteed (set WHATSAPP_CLOUD_WELCOME_TEMPLATE)`
    );
  }
  return { sent: true, via: "text", verified: false, messageId: result.messageId };
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
