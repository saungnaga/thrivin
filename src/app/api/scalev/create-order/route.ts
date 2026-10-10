import { NextResponse } from "next/server";

const DEFAULT_SCALEV_API_KEY =
  "sk_d9aoSFp3FUKA8qyG6J0JpOTM3909cTqwvwF5cVr775g4b1YHashK99q4i2sb4twu";
const DEFAULT_SCALEV_STORE_ID = "store_ius5tpSzfbS8SlB8GTjdGaBA";

// Default variant mapping from store_ius5tpSzfbS8SlB8GTjdGaBA (Thrivin.id)
const FALLBACK_VARIANTS: Record<
  string,
  { uniqueId: string; price: number }
> = {
  month: {
    uniqueId: "variant_vF4j4Pwv1wIizRu3VP6FVOgt", // Checkout Nina 1 Bulan
    price: 99000,
  },
  quarter: {
    uniqueId: "variant_HQdTVIe99NfKi4yjdryOprFc", // Checkout Nina 3 Bulan
    price: 219000,
  },
  half: {
    uniqueId: "variant_f_rx-DoyHQGghKA9LCQsaoz9", // Checkout Nina 6 Bulan
    price: 359000,
  },
  year: {
    uniqueId: "variant_f_rx-DoyHQGghKA9LCQsaoz9", // Checkout Nina 6 Bulan (x2 = 12 Bulan fallback)
    price: 359000,
  },
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { planId, planName, amount, customerName, customerPhone } = body;

    const apiKey = process.env.SCALEV_API_KEY || DEFAULT_SCALEV_API_KEY;
    const storeId = process.env.SCALEV_STORE_ID || DEFAULT_SCALEV_STORE_ID;

    const rawAmount = Math.round(Number(amount) || 184800);
    // Scalev E-Payment / PayLink enforces a strict minimum gross_revenue of Rp 10.000
    const targetAmount = Math.max(10000, rawAmount);

    // 1. Dynamically resolve variants from Scalev Store (with fast fallback)
    let selectedVariant = FALLBACK_VARIANTS[planId] || FALLBACK_VARIANTS.quarter;

    try {
      const prodRes = await fetch(
        `https://api.scalev.com/v3/stores/${storeId}/products`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          next: { revalidate: 60 },
        }
      );

      if (prodRes.ok) {
        const prodJson = await prodRes.json();
        const products: any[] = prodJson?.data || [];

        const matchKeyword =
          planId === "month"
            ? ["1 bulan", "30 hari"]
            : planId === "quarter"
            ? ["3 bulan", "90 hari"]
            : planId === "half"
            ? ["6 bulan", "180 hari"]
            : ["1 tahun", "12 bulan", "365 hari"];

        const matchedProduct = products.find((p) => {
          const nameLower = String(p.name || "").toLowerCase();
          return matchKeyword.some((kw) => nameLower.includes(kw));
        });

        if (matchedProduct?.variants?.[0]) {
          const v = matchedProduct.variants[0];
          selectedVariant = {
            uniqueId: v.unique_id,
            price: Math.round(Number(v.price) || selectedVariant.price),
          };
        }
      }
    } catch (lookupErr) {
      console.warn("Scalev dynamic product lookup fallback used:", lookupErr);
    }

    // 2. Calculate quantity & product_discount so final price on Scalev matches targetAmount 100%
    const unitPrice = selectedVariant.price;
    const quantity =
      targetAmount > unitPrice ? Math.ceil(targetAmount / unitPrice) : 1;
    const grossVariantTotal = unitPrice * quantity;
    const productDiscount = Math.max(0, grossVariantTotal - targetAmount);

    // 3. Normalize phone number to 628... format
    let cleanPhone = String(customerPhone || "").replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "62" + cleanPhone.slice(1);
    } else if (cleanPhone.length > 0 && !cleanPhone.startsWith("62")) {
      cleanPhone = "62" + cleanPhone;
    }
    if (cleanPhone.length < 10) {
      cleanPhone = "6281234567890";
    }

    const cleanName = customerName
      ? String(customerName).trim().substring(0, 60)
      : "Kawan Thrivin";

    // 4. Create Order in Scalev via POST /v3/orders with PayLink
    const orderPayload = {
      store_unique_id: storeId,
      customer_name: cleanName,
      customer_phone: cleanPhone,
      ordervariants: [
        {
          variant_unique_id: selectedVariant.uniqueId,
          quantity,
        },
      ],
      product_discount: productDiscount,
      payment_method: "payment_link",
      notes: `Onboarding Thrivin - ${planName || planId} (Rp ${targetAmount.toLocaleString("id-ID")})`,
    };

    const orderRes = await fetch("https://api.scalev.com/v3/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      console.error("Scalev order creation failed:", orderData);
      return NextResponse.json(
        {
          error:
            orderData?.message ||
            orderData?.error ||
            "Gagal membuat link pembayaran di Scalev",
        },
        { status: orderRes.status }
      );
    }

    let paymentUrl: string =
      orderData?.pg_payment_info?.payment_url ||
      orderData?.payment_url ||
      orderData?.public_order_url ||
      "";

    // Automatically check if custom domain SSL (checkout.thrivin.id) is active;
    // if SSL certificate is still provisioning/failing handshake, fallback to thrivin.myscalev.com
    if (paymentUrl.includes("checkout.thrivin.id")) {
      try {
        await fetch(paymentUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(1500),
        });
      } catch {
        paymentUrl = paymentUrl.replace(
          "checkout.thrivin.id",
          "thrivin.myscalev.com"
        );
      }
    }

    return NextResponse.json({
      orderId: orderData.order_id,
      uuid: orderData.id,
      paymentUrl,
      publicOrderUrl: orderData.public_order_url,
      amount: orderData.gross_revenue,
    });
  } catch (error: any) {
    console.error("Scalev API exception:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
