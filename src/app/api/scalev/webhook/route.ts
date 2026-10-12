import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  getOnboardingSnapshot,
  isWebhookEventProcessed,
  recordWebhookEvent,
  activateUserSubscription,
  isTimestampWithinReplayWindow,
  redactError,
} from "@/lib/onboarding-store";

const DEFAULT_SCALEV_SECRET =
  process.env.SCALEV_WEBHOOK_SECRET ||
  process.env.SCALEV_API_KEY ||
  "";

function safeNormalizePhone(phone: string): string {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.length > 0 && !clean.startsWith("62")) {
    clean = "62" + clean;
  }
  return clean;
}

function verifyScalevSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest();

    let received: Buffer;
    if (signatureHeader.length === 64 && !signatureHeader.includes("=")) {
      // Hex encoding
      received = Buffer.from(signatureHeader, "hex");
    } else {
      // Base64 encoding (official Scalev specification)
      received = Buffer.from(signatureHeader, "base64");
    }

    if (received.length !== expected.length) {
      return false;
    }

    return crypto.timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-scalev-hmac-sha256") ||
      req.headers.get("X-Scalev-Hmac-Sha256");

    const secret = process.env.SCALEV_WEBHOOK_SECRET || DEFAULT_SCALEV_SECRET;

    // 1. Signature Verification with Constant-Time Comparison
    const isValid = verifyScalevSignature(rawBody, signature, secret);
    if (!isValid) {
      console.warn("[Scalev Webhook] Invalid HMAC signature rejected");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // 2. Parse Body
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const event = body.event || body.type;

    // 3. Replay guard: reject bodies whose signed timestamp is outside the window.
    const eventTimestamp =
      body.created_at || body.timestamp || body.event_created_at || body.data?.created_at;
    const replay = isTimestampWithinReplayWindow(eventTimestamp);
    if (!replay.ok) {
      console.warn(
        `[Scalev Webhook] Replay/stale timestamp rejected (skew=${
          replay.skewSeconds === null ? "n/a" : `${replay.skewSeconds}s`
        })`
      );
      await recordWebhookEvent(
        String(body.unique_id || body.id || `evt_${Date.now()}`),
        event || "unknown",
        body,
        null,
        null,
        { status: "failed", error: "replay_window_exceeded" }
      );
      return NextResponse.json(
        { ok: false, error: "Stale or missing timestamp", code: "REPLAY_WINDOW_EXCEEDED" },
        { status: 409 }
      );
    }

    // 4. Handle Scalev Test Event (Settings > Developers > Webhooks activation)
    if (event === "business.test_event") {
      console.log("[Scalev Webhook] business.test_event verified and accepted");
      return NextResponse.json({ ok: true, message: "Test event received" });
    }

    // 5. Handle Payment Received Event
    if (event === "payment.received" || event === "order.paid") {
      const eventId =
        body.unique_id ||
        body.event_id ||
        body.id ||
        `evt_${Date.now()}`;

      const data = body.data || body;
      const orderUniqueId =
        data.order_unique_id ||
        data.order_id ||
        data.unique_id ||
        data.id ||
        null;

      const rawPhone =
        data.customer_phone ||
        data.destination_address?.phone ||
        data.customer?.phone ||
        data.phone ||
        "";
      const cleanPhone = safeNormalizePhone(rawPhone);

      const customerName =
        data.customer_name ||
        data.destination_address?.name ||
        data.customer?.name ||
        data.name ||
        "Kawan Thrivin";

      // Fulfillment key: paid and settled for the SAME order are the same logical
      // event. Dedup by order first so out-of-order deliveries (settled before
      // paid, or a replay of either) collapse to one activation.
      const paymentStatus = String(
        data.payment_status || data.status || ""
      ).toLowerCase();
      const fulfillmentKey = orderUniqueId || eventId;

      // Idempotency / Deduplication Check (out-of-order safe: keyed on order)
      const isAlreadyProcessed = await isWebhookEventProcessed(
        eventId,
        fulfillmentKey
      );

      if (isAlreadyProcessed) {
        console.log(
          `[Scalev Webhook] Dedup hit: event ${eventId} / fulfillment ${fulfillmentKey} already processed`
        );
        // Persist the duplicate for audit + out-of-order visibility.
        await recordWebhookEvent(
          eventId,
          event,
          body,
          orderUniqueId,
          cleanPhone,
          { status: "duplicate" }
        );
        return NextResponse.json({
          ok: true,
          message: "Event already processed (idempotent)",
          eventId,
          orderId: orderUniqueId,
        });
      }

      // Fetch snapshot data (from Supabase or local persistent fallback)
      const snapshot = await getOnboardingSnapshot(cleanPhone, orderUniqueId);

      // Activate user & format Nina memory profile
      let activation: { success: boolean; memory: string; userId?: string };
      try {
        activation = await activateUserSubscription(
          cleanPhone,
          customerName,
          snapshot
        );
      } catch (err) {
        // Never leak PII/secrets into the durable error column.
        await recordWebhookEvent(eventId, event, body, orderUniqueId, cleanPhone, {
          status: "failed",
          error: err,
        });
        throw err;
      }

      // Record into durable inbox (status transition: received -> completed)
      await recordWebhookEvent(
        eventId,
        event,
        body,
        orderUniqueId,
        cleanPhone,
        { status: activation.success ? "completed" : "failed" }
      );

      console.log(
        `[Scalev Webhook] Successfully processed payment for ${cleanPhone} (${customerName}), order: ${orderUniqueId}, status: ${paymentStatus || "unknown"}`
      );

      return NextResponse.json({
        ok: true,
        eventId,
        orderId: orderUniqueId,
        phone: cleanPhone,
        customerName,
        paymentStatus: paymentStatus || null,
        userActivated: activation.success,
        memoryFormatted: true,
      });
    }

    // 5. Default 200 for other recognized webhook events
    return NextResponse.json({
      ok: true,
      event,
      message: "Event acknowledged",
    });
  } catch (error: any) {
    console.error("[Scalev Webhook] Unhandled exception:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "thrivin-scalev-webhook",
    version: "2.0.0",
  });
}
