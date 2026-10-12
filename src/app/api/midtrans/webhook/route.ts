import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      payment_type,
    } = body;

    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      return NextResponse.json(
        { error: "MIDTRANS_SERVER_KEY is not configured" },
        { status: 500 }
      );
    }

    // Verify signature key to prevent spoofing
    const signatureString = `${order_id}${status_code}${gross_amount}${serverKey}`;
    const expectedSignature = crypto
      .createHash("sha512")
      .update(signatureString)
      .digest("hex");

    if (signature_key !== expectedSignature) {
      console.warn("Invalid Midtrans webhook signature received:", { order_id, signature_key });
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 403 }
      );
    }

    console.log(`[Midtrans Webhook] Order: ${order_id} | Status: ${transaction_status} | Payment: ${payment_type}`);

    // Handle payment status
    if (transaction_status === "capture") {
      if (fraud_status === "challenge") {
        // Transaction is challenged by FDS
        console.log(`[Midtrans] Order ${order_id} challenged by fraud detection system`);
      } else if (fraud_status === "accept") {
        // Payment success
        console.log(`[Midtrans] Order ${order_id} capture successful`);
      }
    } else if (transaction_status === "settlement") {
      // Payment successfully settled (Transfer, GoPay, QRIS, etc.)
      console.log(`[Midtrans] Order ${order_id} settled successfully`);
    } else if (
      transaction_status === "cancel" ||
      transaction_status === "deny" ||
      transaction_status === "expire"
    ) {
      // Payment failed / expired / cancelled
      console.log(`[Midtrans] Order ${order_id} ${transaction_status}`);
    } else if (transaction_status === "pending") {
      // Customer has generated VA/QRIS and payment is pending
      console.log(`[Midtrans] Order ${order_id} pending payment`);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("Midtrans webhook error:", error);
    return NextResponse.json(
      { error: error?.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
