/**
 * WhatsApp Cloud API sender for the PRODUCT path (purchase / postpaid messages).
 *
 * The Baileys bridge belongs to Nina's chat runtime; nothing here may talk to it.
 * Purchase notifications must come from the official Meta number
 * (6285165581209), so this module is the single place that knows the Cloud
 * binding and the official number.
 *
 * Config (server env, never committed):
 *   WHATSAPP_CLOUD_PHONE_NUMBER_ID      phone-number-id of the official Meta number
 *   WHATSAPP_CLOUD_ACCESS_TOKEN         system-user token for that number
 *   WHATSAPP_CLOUD_API_VERSION          default v21.0
 *   WHATSAPP_CLOUD_GRAPH_URL            test seam (default https://graph.facebook.com)
 *   WHATSAPP_CLOUD_WELCOME_TEMPLATE     APPROVED welcome-greeting template name
 *   WHATSAPP_CLOUD_WELCOME_TEMPLATE_LANG default "id"
 *   WHATSAPP_CLOUD_WELCOME_TEMPLATE_PARAMS 0 (default) or 1 ({{1}} = first name)
 *   NINA_WA_NUMBER                      official display number, default 6285165581209
 *
 * ponytail: two message kinds only (text + one template). Add media/interactive
 * when a product flow actually needs them.
 */

export const OFFICIAL_WA_NUMBER = (
  process.env.NINA_WA_NUMBER || "6285165581209"
).trim();

/** Deep link buyers are told to use on the thank-you page. */
export const NINA_WA_LINK = `https://wa.me/${OFFICIAL_WA_NUMBER}`;

/** Post-payment landing page served by this app (configured in Scalev). */
export const POST_PAYMENT_PATH = "/pembayaran/sukses";

export interface CloudConfig {
  phoneNumberId: string;
  token: string;
  apiVersion: string;
}

/** Both halves of the binding are required; a half-configured number fails closed. */
export function readCloudConfig(env: NodeJS.ProcessEnv = process.env): CloudConfig | null {
  const phoneNumberId = String(env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim();
  const token = String(env.WHATSAPP_CLOUD_ACCESS_TOKEN || "").trim();
  if (!phoneNumberId || !token) return null;
  const apiVersion =
    String(env.WHATSAPP_CLOUD_API_VERSION || "v21.0").trim().replace(/^\/+|\/+$/g, "") ||
    "v21.0";
  return { phoneNumberId, token, apiVersion };
}

export interface WelcomeTemplate {
  name: string;
  lang: string;
  /** Body parameters to send: 0, 1 ({{1}} = name) or 2 ({{1}} = name, {{2}} = context). */
  params: number;
}

export function readWelcomeTemplate(
  env: NodeJS.ProcessEnv = process.env
): WelcomeTemplate | null {
  const name = String(env.WHATSAPP_CLOUD_WELCOME_TEMPLATE || "").trim();
  if (!name) return null;
  const lang = String(env.WHATSAPP_CLOUD_WELCOME_TEMPLATE_LANG || "id").trim() || "id";
  const rawParams = Math.trunc(Number(env.WHATSAPP_CLOUD_WELCOME_TEMPLATE_PARAMS || 0));
  const params = Number.isFinite(rawParams) && rawParams > 0 ? Math.min(rawParams, 2) : 0;
  return { name, lang, params };
}

export interface CloudSendResult {
  ok: boolean;
  messageId?: string;
  /** Graph error code (131047 = re-engagement/24h window closed). */
  errorCode?: number;
  reason?: string;
}

function graphBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.WHATSAPP_CLOUD_GRAPH_URL || "https://graph.facebook.com")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * POST /{version}/{phone-number-id}/messages. Never throws: callers treat a
 * failure as "recorded, not delivered".
 */
async function send(
  cfg: CloudConfig,
  to: string,
  payload: Record<string, unknown>
): Promise<CloudSendResult> {
  const url = `${graphBase()}/${cfg.apiVersion}/${encodeURIComponent(
    cfg.phoneNumberId
  )}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        ...payload,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const code = Number(body?.error?.code);
      return {
        ok: false,
        errorCode: Number.isFinite(code) ? code : undefined,
        reason: `graph_http_${res.status}`,
      };
    }
    return { ok: true, messageId: body?.messages?.[0]?.id };
  } catch {
    return { ok: false, reason: "graph_unreachable" };
  }
}

export function sendCloudText(
  cfg: CloudConfig,
  to: string,
  body: string
): Promise<CloudSendResult> {
  return send(cfg, to, { type: "text", text: { body, preview_url: false } });
}

export function sendCloudTemplate(
  cfg: CloudConfig,
  to: string,
  template: WelcomeTemplate,
  name?: string | null,
  context?: string | null
): Promise<CloudSendResult> {
  const first = String(name || "Kawan Thrivin").trim() || "Kawan Thrivin";
  const second = String(context || "").trim();
  const params =
    template.params === 0
      ? []
      : template.params === 1
        ? [first]
        : [first, second || "Selamat datang di Thrivin"];
  return send(cfg, to, {
    type: "template",
    template: {
      name: template.name,
      language: { code: template.lang },
      ...(params.length
        ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  });
}
