import { NextResponse } from "next/server";
import crypto from "crypto";
import { normalizePhone } from "@/lib/phone";
import { resolveSubscriptionPlan } from "@/lib/plans";
import { limitRequest } from "@/lib/rate-limit";
import {
  getOnboardingSnapshot,
  claimWebhookEvent,
  finalizeWebhookEvent,
  activateUserSubscription,
  recordGreetingSent,
  isTimestampWithinReplayWindow,
  buildAuditPayload,
  redactError,
} from "@/lib/onboarding-store";
import {
  buildWelcomeMessage,
  claimWelcomeSend,
  sendWelcomeMessage,
} from "@/lib/welcome-message";

/**
 * Scalev signs with HMAC-SHA256 and transmits base64 (L-1). The previous
 * "guess hex vs base64 from length" heuristic could silently mis-parse a
 * 64-char base64 signature; the spec is base64, so we only accept base64.
 */
function verifyScalevSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
    const received = Buffer.from(signatureHeader, "base64");
    if (received.length !== expected.length) return false;
    return crypto.timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

// Per-IP ceiling: Scalev retries are a handful of deliveries per order.
const IP_LIMIT = 120;
const PHONE_LIMIT = 60;

export async function POST(req: Request) {
  try {
    // B-1: exactly one source of truth for the signing secret. It is NOT the
    // API key — different credential, different rotation. Missing config means
    // we refuse to verify rather than HMAC with an empty key (which accepted
    // any attacker-computed signature).
    const secret = process.env.SCALEV_WEBHOOK_SECRET;
    if (!secret) {
      console.error(
        "[Scalev Webhook] SCALEV_WEBHOOK_SECRET is not configured — refusing to verify"
      );
      return NextResponse.json(
        { error: "Webhook signing secret is not configured" },
        { status: 500 }
      );
    }

    const rawBody = await req.text();
    const signature =
      req.headers.get("x-scalev-hmac-sha256") ||
      req.headers.get("X-Scalev-Hmac-Sha256");

    // 1. Signature Verification with Constant-Time Comparison
    if (!verifyScalevSignature(rawBody, signature, secret)) {
      console.warn("[Scalev Webhook] Invalid HMAC signature rejected");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 2. Parse Body
    let body: Record<string, any>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 3. Replay guard: reject bodies whose signed timestamp is outside the window.
    const eventTimestamp =
      body.timestamp || body.created_at || body.event_created_at || body.data?.created_at;
    const replay = isTimestampWithinReplayWindow(eventTimestamp);
    if (!replay.ok) {
      console.warn(
        `[Scalev Webhook] Replay/stale timestamp rejected (skew=${
          replay.skewSeconds === null ? "n/a" : `${Math.round(replay.skewSeconds)}s`
        })`
      );
      return NextResponse.json(
        { ok: false, error: "Stale or missing timestamp", code: "REPLAY_WINDOW_EXCEEDED" },
        { status: 409 }
      );
    }

    const event = body.event || body.type;

    // 4. Scalev handshake (Settings > Developers > Webhooks activation)
    if (event === "business.test_event") {
      return NextResponse.json({ ok: true, message: "Test event received" });
    }

    // 5. Payment fulfilment
    if (event === "payment.received" || event === "order.paid") {
      const eventId = body.unique_id || body.event_id || body.id || `evt_${Date.now()}`;
      const data = (body.data || body) as Record<string, any>;

      const orderUniqueId =
        data.order_id || data.order_unique_id || data.unique_id || data.id || null;
      if (!orderUniqueId) {
        return NextResponse.json(
          { ok: false, error: "Missing order id", code: "INVALID_ORDER_ID" },
          { status: 400 }
        );
      }

      // Explicit payment_status contract (Atlas probe & Scalev spec):
      // payment.received must be paid or settled.
      const paymentStatus = String(
        data.payment_status || (event === "order.paid" ? "paid" : "")
      ).toLowerCase();
      if (paymentStatus !== "paid" && paymentStatus !== "settled") {
        console.warn(
          `[Scalev Webhook] Unfulfilled payment status '${paymentStatus || "unknown"}' rejected for order: ${orderUniqueId}`
        );
        return NextResponse.json(
          { ok: false, error: "Payment status must be paid or settled", code: "PAYMENT_NOT_SETTLED" },
          { status: 400 }
        );
      }

      const rawPhone =
        data.customer_phone ||
        data.destination_address?.phone ||
        data.customer?.phone ||
        data.phone ||
        "";
      const cleanPhone = normalizePhone(rawPhone);
      if (!cleanPhone) {
        return NextResponse.json(
          { ok: false, error: "Missing or invalid customer phone", code: "INVALID_PHONE" },
          { status: 400 }
        );
      }

      const customerName =
        data.customer_name ||
        data.destination_address?.name ||
        data.customer?.name ||
        data.name ||
        "Kawan Thrivin";

      // Rate limit per IP + per phone number (B-2).
      const limited = limitRequest(req, "scalev-webhook", {
        ipLimit: IP_LIMIT,
        phoneLimit: PHONE_LIMIT,
        phone: cleanPhone,
      });
      if (!limited.ok) {
        return NextResponse.json(
          { ok: false, error: "Too many requests", code: "RATE_LIMITED" },
          { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
        );
      }

      // paid and settled for the SAME order are one logical fulfilment. The key
      // is the order, so out-of-order or replayed deliveries collapse to one.
      const fulfillmentKey = String(orderUniqueId || eventId);

      // H-6: the dedup decision IS the insert. Only the delivery that wins the
      // unique index on (tenant_id, source, fulfillment_key) may activate.
      const auditPayload = buildAuditPayload(data, rawBody);
      let claim;
      try {
        claim = await claimWebhookEvent({
          eventId: String(eventId),
          eventType: String(event),
          orderId: orderUniqueId ? String(orderUniqueId) : null,
          phone: cleanPhone,
          fulfillmentKey,
          payload: auditPayload,
        });
      } catch (err) {
        console.error("[Scalev Webhook] Claim failed — event NOT processed:", redactError(err));
        return NextResponse.json(
          { ok: false, error: "Failed to record event; retry expected", code: "CLAIM_FAILED" },
          { status: 500 }
        );
      }

      if (!claim.claimed) {
        // Lost the race (or a replay). Do not activate; 200 so Scalev stops retrying.
        return NextResponse.json({
          ok: true,
          eventId: String(eventId),
          orderId: orderUniqueId,
          message: "Event already processed (idempotent)",
        });
      }

      try {
        const snapshot = await getOnboardingSnapshot(cleanPhone, orderUniqueId);
        const plan = resolveSubscriptionPlan(snapshot?.plan_key);
        const activation = await activateUserSubscription(cleanPhone, customerName, snapshot);
        await finalizeWebhookEvent(String(eventId), {
          status: activation.success ? "completed" : "failed",
        });

        // First-touch greeting: only after a successful activation, and only the
        // delivery that wins the atomic marker. A dead bridge never rolls back
        // the subscription (sendWelcomeMessage never throws).
        let welcomeSent = false;
        let welcomeMessageId: string | undefined;
        if (activation.success && claimWelcomeSend(fulfillmentKey)) {
          const result = await sendWelcomeMessage(
            cleanPhone,
            buildWelcomeMessage(customerName, snapshot)
          );
          welcomeSent = result.sent;
          welcomeMessageId = result.messageId;
          if (welcomeSent && orderUniqueId) {
            await recordGreetingSent(orderUniqueId);
          }
        }

        // M-4: event/order ids only — no phone number, no customer name.
        console.log(
          `[Scalev Webhook] Fulfilment completed event=${eventId} order=${orderUniqueId} plan=${plan.lastPlanKey} activated=${activation.success} welcomeSent=${welcomeSent}`
        );

        // M-3: no PII echoed back to the caller or any intermediary log.
        return NextResponse.json({
          ok: true,
          eventId: String(eventId),
          orderId: orderUniqueId,
          userActivated: activation.success,
          welcomeSent,
          welcomeMessageId: welcomeMessageId || null,
        });
      } catch (err) {
        await finalizeWebhookEvent(String(eventId), { status: "failed", error: err });
        throw err;
      }
    }

    // 6. Default 200 for other recognised webhook events
    return NextResponse.json({ ok: true, event, message: "Event acknowledged" });
  } catch (error: any) {
    console.error("[Scalev Webhook] Unhandled exception:", redactError(error));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "thrivin-scalev-webhook" });
}