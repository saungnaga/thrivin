import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { planId, planName, amount, customerName, customerPhone } = body;

    const serverKey =
      process.env.MIDTRANS_SERVER_KEY || "Mid-server-X-YtdEZ4XuC7foCcW74MJMVH";
    if (!serverKey) {
      return NextResponse.json(
        { error: "MIDTRANS_SERVER_KEY is not configured" },
        { status: 500 }
      );
    }

    const isProduction =
      process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION !== "false" &&
      !serverKey.startsWith("SB-");
    const snapUrl = isProduction
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

    // Generate readable unique order_id
    const orderId = `THRIVIN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Prepare payload for Midtrans Snap
    const payload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: Math.round(Number(amount)),
      },
      customer_details: {
        first_name: customerName ? String(customerName).substring(0, 50) : "Kawan Thrivin",
        phone: customerPhone ? String(customerPhone).replace(/\D/g, "") : "081234567890",
      },
      item_details: [
        {
          id: planId || "plan-thrivin",
          price: Math.round(Number(amount)),
          quantity: 1,
          name: (planName || "Paket Thrivin").substring(0, 50),
        },
      ],
    };

    const authHeader = `Basic ${Buffer.from(serverKey + ":").toString("base64")}`;

    const response = await fetch(snapUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("Midtrans Snap error:", responseData);
      return NextResponse.json(
        { error: responseData.error_messages || "Failed to create transaction with Midtrans" },
        { status: response.status }
      );
    }

    return NextResponse.json({
      token: responseData.token,
      redirectUrl: responseData.redirect_url,
      orderId,
    });
  } catch (error: any) {
    console.error("Midtrans API exception:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
