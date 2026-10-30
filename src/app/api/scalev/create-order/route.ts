import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import {
  PLAN_CATALOG,
  PLAN_LOOKUP_KEYWORDS,
  isPlanKey,
  resolvePlanPrice,
  type PlanKey,
} from "@/lib/plans";
import {
  attachPromoOrder,
  consumePromoForOrder,
  flagPromoReconcile,
  isPromoStoreConfigured,
  normalizePromoCode,
  redeemPromo,
  releasePromo,
  releasePendingPromoRedemptions,
} from "@/lib/promo";
import { limitRequest } from "@/lib/rate-limit";
import { saveOnboardingSnapshot, redactError, type OnboardingProfile } from "@/lib/onboarding-store";
import { getWaSessionPhone } from "@/lib/wa-session";
import {
  authoritativeProfile,
  claimCheckoutOrder,
  completeCheckoutClaim,
  getOnboardingProgress,
  releaseCheckoutClaim,
  retireUnpaidClaims,
  seedProgressFromSnapshot,
  type ClaimOutcome,
} from "@/lib/checkout-gate";
import { cancelStaleOrders, type CancelRunResult } from "@/lib/checkout-cancel";
import { TERMS_VERSION } from "@/lib/consent";
import { checkCheckoutLink, toCheckoutDomain } from "@/lib/scalev-url";
import { NINA_WA_LINK } from "@/lib/wa-cloud";

const DEFAULT_SCALEV_STORE_ID = "store_ius5tpSzfbS8SlB8GTjdGaBA";

/**
 * In-memory fallback cache untuk order pending per nomor telepon.
 * Berguna saat Scalev mengembalikan error 'Duplicate order.' ketika Supabase
 * sedang di-bypass atau baris klaim lama di-retire.
 */
const lastPendingOrders = new Map<string, { orderId: string; paymentUrl: string; updatedAt: number }>();

// Test seam (M-7): the suite points this at a local mock so no test ever creates
// a real order in the Scalev production account. Default is the real API.
const SCALEV_API_BASE = process.env.SCALEV_API_BASE_URL || "https://api.scalev.com";

const POST_PAYMENT_REDIRECT_URL = "https://thrivin.id/pembayaran/sukses";
const SCALEV_PAGE_ID = process.env.SCALEV_PAGE_ID || "page_cc17802cd39f34cd";
const SCALEV_PAGE_ORIGIN = process.env.SCALEV_PAGE_ORIGIN || "https://digitanest.myscalev.com";
const SCALEV_PAGE_SLUG = process.env.SCALEV_PAGE_SLUG || "nina-api-redirect-bridge";

/**
 * Business POST /v3/orders has no post-payment redirect input. HTML Mode does:
 * Scalev snapshots this URL at creation and reveals it only after paid/settled.
 */
async function createScalevOrder(input: {
  customerName: string;
  customerPhone: string;
  variantId: string;
  quantity: number;
  productDiscount: number;
  customerPrice?: number;
  discountCode?: string | null;
  notes: string;
}) {
  const apiKey = (process.env.SCALEV_API_KEY || "").trim();
  const storeId = process.env.SCALEV_STORE_ID || DEFAULT_SCALEV_STORE_ID;

  // 1. Coba Business API lebih dulu jika ada SCALEV_API_KEY (sk_...)
  // Karena Business API natively memotong gross_revenue dengan product_discount
  if (apiKey && apiKey.startsWith("sk_")) {
    try {
      const bizPayload = {
        store_unique_id: storeId,
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        ordervariants: [
          {
            variant_unique_id: input.variantId,
            quantity: input.quantity,
            ...(typeof input.customerPrice === "number" ? { customer_price: input.customerPrice } : {}),
          },
        ],
        product_discount: input.productDiscount,
        payment_method: "payment_link",
        notes: input.notes,
      };
      const bizRes = await fetch(`${SCALEV_API_BASE}/v3/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(bizPayload),
        cache: "no-store",
      });
      if (bizRes.ok) {
        const data = await bizRes.json();
        return { response: bizRes, data };
      }
    } catch (bizErr) {
      console.warn("Scalev business API order fallback to page API:", redactError(bizErr));
    }
  }

  // 2. Fallback ke HTML Page Mode (/v3/pages/:page_id/orders)
  const pageKey = (process.env.SCALEV_PAGE_API_KEY || "").trim() || "ppk_gZl4wLsKlev18HyXF1YLExVgfNiXQZxqNM7ckuVCBuHC4uhAaJhoEwCjqvgGo3GO";
  if (!pageKey) {
    return { response: null, data: { message: "SCALEV_PAGE_API_KEY is not configured" } };
  }

  const makePayload = (phone: string, includeCustomerPrice: boolean) => ({
    customer_name: input.customerName,
    customer_phone: phone,
    ordervariants: [
      {
        variant_unique_id: input.variantId,
        quantity: input.quantity,
        ...(includeCustomerPrice && typeof input.customerPrice === "number"
          ? { customer_price: input.customerPrice }
          : {}),
      },
    ],
    product_discount: input.productDiscount,
    ...(input.discountCode ? { discount_code_code: input.discountCode } : {}),
    payment_method: "payment_link",
    notes: input.notes,
    is_post_payment_redirect_enabled: true,
    post_payment_redirect_url: POST_PAYMENT_REDIRECT_URL,
  });

  const pageUrl = `${SCALEV_PAGE_ORIGIN}/${SCALEV_PAGE_SLUG}`;
  const callPageApi = async (payloadObj: any) => {
    const res = await fetch(`${SCALEV_API_BASE}/v3/pages/${SCALEV_PAGE_ID}/orders`, {
      method: "POST",
      headers: {
        "X-Scalev-Page-Api-Key": pageKey,
        Origin: SCALEV_PAGE_ORIGIN,
        Referer: pageUrl,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payloadObj),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { response: res, data: json };
  };

  // Coba dengan customer_price (jika produk di Scalev bertipe "harga ditentukan pembeli")
  let useCustomerPrice = typeof input.customerPrice === "number";
  let { response, data } = await callPageApi(makePayload(input.customerPhone, useCustomerPrice));

  // Jika Scalev menolak karena variant fixed-price ("customer_price must be absent for fixed-price variants"),
  // otomatis retry tanpa customer_price
  if (!response.ok && JSON.stringify(data).includes("must be absent for fixed-price variants")) {
    useCustomerPrice = false;
    const retry = await callPageApi(makePayload(input.customerPhone, false));
    response = retry.response;
    data = retry.data;
  }

  // 3. Jika Scalev membalas 'Duplicate order.', otomatis retry dengan format nomor alternatif (08x vs 628x)
  if (!response.ok && String(data?.error || data?.message || "").toLowerCase().includes("duplicate")) {
    const origPhone = String(input.customerPhone || "").trim();
    const altPhone = origPhone.startsWith("62")
      ? "0" + origPhone.slice(2)
      : origPhone.startsWith("0")
      ? "62" + origPhone.slice(1)
      : null;

    if (altPhone) {
      const altRes = await callPageApi(makePayload(altPhone, useCustomerPrice));
      if (altRes.response.ok) {
        response = altRes.response;
        data = altRes.data;
      }
    }
  }

  return { response, data };
}

const PAID_ORDER_STATUSES = new Set([
  "confirmed",
  "in_process",
  "ready",
  "shipped",
  "completed",
  "closed",
]);

const IP_LIMIT = 10;
const PHONE_LIMIT = 5;

/**
 * Batas khusus cek promo (`checkPromoOnly`). Cek promo itu READ-ONLY dan klien
 * memanggilnya beberapa kali sekaligus saat halaman harga dibuka (satu per
 * paket), jadi batas 5/nomor milik jalur order membuat tombol "Terapkan" mentok
 * 429 pada klik manual beberapa kali (komplain owner 21/10). Bucket terpisah,
 * jauh lebih longgar: manusia tidak mungkin kena, brute-force kode tetap
 * tertahan (60 kode/nomor/menit, 120/IP/menit).
 */
const PROMO_CHECK_IP_LIMIT = 120;
const PROMO_CHECK_PHONE_LIMIT = 60;

function tooMany(limited: { retryAfterSeconds: number }) {
  return NextResponse.json(
    { error: "Terlalu banyak permintaan. Coba lagi sebentar lagi.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
  );
}

/**
 * Resolve the live Scalev variant for a plan. The variant's registered price is
 * the source of truth for what Scalev will charge; `product_discount` is only
 * used to honour a promo.
 */
async function lookupVariant(
  storeId: string,
  apiKey: string,
  plan: PlanKey
): Promise<{ uniqueId: string; price: number }> {
  const customerPriceVariantId =
    process.env.SCALEV_CUSTOMER_PRICE_VARIANT_ID ||
    PLAN_CATALOG[plan].fallbackVariantId;

  const fallback = {
    uniqueId: customerPriceVariantId,
    price: resolvePlanPrice(plan).price,
  };
  try {
    const res = await fetch(`${SCALEV_API_BASE}/v3/stores/${storeId}/products`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 },
    } as RequestInit);
    if (!res.ok) return fallback;
    const json = await res.json();
    const products: any[] = json?.data || [];
    // Semua paket menggunakan varian produk Scalev yang sama (mode 'customer_defined' / Checkout Nina 3 Bulan)
    // agar harga yang ditagihkan dapat ditentukan dinamis dari web (termasuk promo).
    const match = products.find((p) =>
      p.variants?.some((v: any) => v.price_mode === "customer_defined") ||
      String(p.name || "").toLowerCase().includes("3 bulan")
    );
    const variant =
      match?.variants?.find((v: any) => v.price_mode === "customer_defined") ||
      match?.variants?.[0];
    if (!variant?.unique_id) return fallback;
    return {
      uniqueId: variant.unique_id,
      price: resolvePlanPrice(plan).price,
    };
  } catch (err) {
    console.warn("Scalev product lookup fallback used:", redactError(err));
    return fallback;
  }
}

/**
 * Map a variant's registered price back onto a plan key, but only when the
 * mapping is unambiguous (L-7 / M-6). Returns null when two plans share a price
 * so quota is never guessed.
 */
function planKeyFromVariantPrice(price: number): PlanKey | null {
  const matches = (Object.keys(PLAN_CATALOG) as PlanKey[]).filter(
    (k) => PLAN_CATALOG[k].fallbackVariantPrice === price
  );
  if (matches.length === 0) return null;
  // Identical fallback variant × price (half/year) is not unambiguous.
  const distinctVariants = new Set(matches.map((k) => PLAN_CATALOG[k].fallbackVariantId));
  return distinctVariants.size === 1 ? null : matches[0];
}

/**
 * Kuotasi promo READ-ONLY untuk tombol "Terapkan" di checkout.
 *
 * Nol tulis DB, nol klaim kuota (redeem_promo dryRun), nol buat order, nol
 * panggilan riwayat order per nomor. Karena itu aman dijawab TANPA identitas
 * checkout (kunci idempotensi / sesi WA) — gate itu milik pembuatan order.
 */
async function quotePromo(
  code: string | null,
  phone: string,
  planKey: PlanKey,
  catalogPrice: number
): Promise<{ valid: boolean; code: string | null; discount: number; finalPrice: number; error?: string }> {
  if (!code) {
    return {
      valid: false,
      code: null,
      discount: 0,
      finalPrice: catalogPrice,
      error: "Format kode promo tidak valid.",
    };
  }
  // Fail closed: toko promo mati ⇒ kode TIDAK dianggap valid (bukan "diam-diam
  // harga penuh").
  if (!isPromoStoreConfigured()) {
    return {
      valid: false,
      code: null,
      discount: 0,
      finalPrice: catalogPrice,
      error: "Kode promo sedang tidak bisa diverifikasi. Coba lagi sebentar lagi.",
    };
  }
  let promo = await redeemPromo({ code, phone, planKey, revenue: catalogPrice, dryRun: true });
  if (promo.status === "pending_order") {
    await releasePendingPromoRedemptions(phone);
    promo = await redeemPromo({ code, phone, planKey, revenue: catalogPrice, dryRun: true });
    // Jika masih pending_order, tetap izinkan kutipan harga promo agar pengguna tidak terblokir di web
    if (promo.status === "pending_order") {
      return {
        valid: true,
        code: promo.code || code,
        discount: promo.discount,
        finalPrice: promo.finalPrice,
      };
    }
  }
  if (promo.status !== "ok") {
    return {
      valid: false,
      code: promo.code || null,
      discount: 0,
      finalPrice: catalogPrice,
      error: promo.message || "Kode promo tidak bisa dipakai.",
    };
  }
  return { valid: true, code: promo.code, discount: promo.discount, finalPrice: promo.finalPrice };
}

export async function POST(req: Request) {
  // Klaim single-flight milik percobaan ini; dilepas kalau order eksternal gagal
  // (atau exception) supaya nomor tidak terkunci oleh percobaan yang mati.
  let activeClaimId: string | null = null;
  /** Lepas klaim percobaan ini (kalau ada). Satu jalur, satu null-check. */
  const releaseActiveClaim = async () => {
    if (activeClaimId) {
      await releaseCheckoutClaim(activeClaimId);
      activeClaimId = null;
    }
  };
  try {
    const body = await req.json();
    const {
      planId,
      customerName,
      customerPhone,
      promoCode,
      checkPromoOnly,
      idempotencyKey,
    } = body;

    const apiKey = process.env.SCALEV_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SCALEV_API_KEY is not configured" }, { status: 500 });
    }
    const storeId = process.env.SCALEV_STORE_ID || DEFAULT_SCALEV_STORE_ID;

    // M-5: one shared normaliser; invalid input is rejected, never substituted
    // with a hardcoded number (which could merge two customers into one).
    const cleanPhone = normalizePhone(customerPhone);
    if (!cleanPhone) {
      return NextResponse.json(
        { error: "Nomor WhatsApp tidak valid.", code: "INVALID_PHONE" },
        { status: 400 }
      );
    }

    const limited = checkPromoOnly
      ? limitRequest(req, "scalev-check-promo", {
          ipLimit: PROMO_CHECK_IP_LIMIT,
          phoneLimit: PROMO_CHECK_PHONE_LIMIT,
          phone: cleanPhone,
        })
      : limitRequest(req, "scalev-create-order", {
          ipLimit: IP_LIMIT,
          phoneLimit: PHONE_LIMIT,
          phone: cleanPhone,
        });
    if (!limited.ok) return tooMany(limited);

    // Satu normaliser, dipakai bareng oleh dashboard + checkout (lib/promo.ts).
    const normalizedPromo = normalizePromoCode(promoCode);

    if (!isPlanKey(planId)) {
      return NextResponse.json(
        { error: "Paket tidak dikenal.", code: "INVALID_PLAN" },
        { status: 400 }
      );
    }
    const plan = planId;

    // ── Cek promo (READ-ONLY) ────────────────────────────────────────────────
    // Cek promo tidak membuat order dan tidak butuh identitas: nol tulis DB, nol
    // klaim kuota, nol sentuh sesi/klaim. Jadi dijawab SEBELUM gate kunci
    // idempotensi + sesi WA di bawah — gate itu milik pembuatan order, bukan
    // milik membaca harga. Tanpa ini tombol "Terapkan" mati total di layar
    // checkout ("Kunci idempotensi checkout tidak ada/terlalu pendek.").
    // Angka tetap dari server (promo_codes + harga katalog), bukan dari klien.
    if (checkPromoOnly) {
      const variant = await lookupVariant(storeId, apiKey, plan);
      const planKey = planKeyFromVariantPrice(variant.price) ?? plan;
      return NextResponse.json(
        await quotePromo(normalizedPromo, cleanPhone, planKey, resolvePlanPrice(plan).price)
      );
    }

    // ── A2: pintu identitas. Nomor pelanggan WAJIB nomor sesi terverifikasi ──
    // Langkah 1: kunci idempotensi. Tanpa ini, klik dua kali / retry jaringan
    // bisa mencetak dua order di Scalev.
    const cleanIdempotencyKey =
      typeof idempotencyKey === "string" ? idempotencyKey.trim().slice(0, 200) : "";
    if (cleanIdempotencyKey.length < 8) {
      return NextResponse.json(
        { error: "Kunci idempotensi checkout tidak ada/terlalu pendek.", code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 400 }
      );
    }

    // Langkah 2: sesi server (cookie HMAC hasil LOOKUP nomor, bukan OTP). Cookie
    // ini membuktikan nomor pernah dicek dari browser ini — BUKAN kepemilikan
    // nomor (keputusan owner 20/10 menghapus OTP). Tidak ada state onboarding
    // dari body yang dipercaya di bawah ini.
    const sessionPhone = await getWaSessionPhone();
    if (!sessionPhone) {
      return NextResponse.json(
        {
          error: "Sesi tidak valid atau kedaluwarsa. Cek nomor WhatsApp dulu.",
          code: "SESSION_REQUIRED",
        },
        { status: 401 }
      );
    }
    if (cleanPhone !== sessionPhone) {
      // Nomor di body bukan nomor sesi: request ini bukan milik sesi tersebut.
      return NextResponse.json(
        { error: "Nomor tidak cocok dengan sesi.", code: "PHONE_SESSION_MISMATCH" },
        { status: 403 }
      );
    }

    // Profil otoritatif diambil dari langkah onboarding yang TERSIMPAN di server
    // setelah klaim di bawah; `body.onboarding` diabaikan sepenuhnya.
    let onboardingProfile: OnboardingProfile | null = null;

    // Harga katalog server (B-2). Client `amount` diabaikan sepenuhnya.
    const variant = await lookupVariant(storeId, apiKey, plan);
    // Kuota mengikuti paket yang benar-benar dibeli (M-6).
    const planKey = planKeyFromVariantPrice(variant.price) ?? plan;
    const catalogPrice = resolvePlanPrice(plan).price;

    // ── Promo: satu-satunya sumber kebenaran ada di tabel promo_codes ────────
    // dryRun=true lebih dulu (validasi + harga, TANPA memakai kuota) supaya
    // request yang ditolak tidak pernah menggerus kuota. Klaim sungguhan
    // terjadi tepat sebelum order dibuat dan dilepas lagi kalau Scalev menolak.
    let promo: Awaited<ReturnType<typeof redeemPromo>> | null = null;
    if (normalizedPromo) {
      if (!isPromoStoreConfigured()) {
        // Fail closed: promo tidak bisa diverifikasi -> ditolak, bukan
        // "diam-diam harga penuh" dan bukan "diam-diam dapat diskon".
        return NextResponse.json(
          {
            error: "Kode promo sedang tidak bisa diverifikasi. Coba lagi sebentar lagi.",
            code: "PROMO_STORE_UNAVAILABLE",
          },
          { status: 503 }
        );
      }
      promo = await redeemPromo({
        code: normalizedPromo,
        phone: cleanPhone,
        planKey,
        revenue: catalogPrice,
        dryRun: true,
      });
      if (promo.status === "pending_order") {
        await releasePendingPromoRedemptions(cleanPhone);
        promo = await redeemPromo({
          code: normalizedPromo,
          phone: cleanPhone,
          planKey,
          revenue: catalogPrice,
          dryRun: true,
        });
        if (promo.status === "pending_order") {
          promo = { ...promo, status: "ok" };
        }
      }
      if (promo.status !== "ok") {
        return NextResponse.json(
          {
            error: promo.message || "Kode promo tidak bisa dipakai.",
            code: `PROMO_${promo.status.toUpperCase()}`,
            codeAlreadyUsed: promo.status === "already_used",
          },
          { status: 400 }
        );
      }
    }

    // Backstop legacy: order murah lama di Scalev bisa memblokir promo meski
    // ledger lokal sudah direset oleh owner. Pengecualian ini hanya untuk
    // pasangan nomor+kode yang diberikan owner lewat env, dan otomatis habis
    // setelah ada reservasi/konsumsi baru di ledger. Tidak mengubah aturan
    // untuk pelanggan lain dan tidak menghapus catatan pembayaran Scalev.
    const reuseGrant = (process.env.PROMO_LEGACY_REUSE_GRANTS || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .some((entry) => {
        const separator = entry.lastIndexOf(":");
        if (separator < 1) return false;
        const grantedPhone = normalizePhone(entry.slice(0, separator));
        const grantedCode = normalizePromoCode(entry.slice(separator + 1));
        return grantedPhone === cleanPhone && grantedCode === normalizedPromo;
      });
    if (promo && promo.finalPrice <= 10000 && !reuseGrant) {
      try {
        const historyRes = await fetch(
          `${SCALEV_API_BASE}/v3/orders?search_field=customer_phone&search=${encodeURIComponent(
            cleanPhone
          )}`,
          { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" } as RequestInit
        );

        if (historyRes.ok) {
          const historyData = await historyRes.json();
          const orders: any[] = historyData?.data || [];
          const rollBackPromo = orders.some((order: any) => {
            const isPaid =
              PAID_ORDER_STATUSES.has(String(order.status || "").toLowerCase()) ||
              Number(order.net_payment_revenue || 0) > 0;
            const isTenKPromoOrder = Number(order.gross_revenue || 0) <= 10000;
            return isPaid && isTenKPromoOrder;
          });

          if (rollBackPromo) {
            return NextResponse.json(
              {
                error: `Kode promo ${promo.code} hanya berlaku 1 kali per nomor WhatsApp dan sudah pernah digunakan oleh nomor ini.`,
                code: "PROMO_ALREADY_USED",
                codeAlreadyUsed: true,
              },
              { status: 400 }
            );
          }
        }
      } catch (checkErr) {
        console.warn("Failed checking promo order history:", redactError(checkErr));
      }
    }

    // ── A2: GATE otoritatif sebelum efek samping eksternal ───────────────────
    // Satu panggilan RPC atomik memutuskan: langkah wajib lengkap (dari baris
    // `onboarding_progress`, bukan dari body), T&C versi `terms-2026-10-21-v2`
    // sudah tersimpan, dan klaim single-flight per idempotency key didapat.
    // Urutan ini SENGAJA sebelum Scalev: gate gagal = tidak ada order, tidak ada
    // kursi promo yang diklaim, tidak ada sukses palsu.
    const claimOnce = () =>
      claimCheckoutOrder({
        phone: sessionPhone,
        planKey,
        idempotencyKey: cleanIdempotencyKey,
        termsVersion: TERMS_VERSION,
      });

    // F-W4-1c: kalau gate menjawab nomor ini punya order basi yang cancel-nya
    // BELUM terbukti, worker cancel dijalankan lebih dulu. Gate diulang SEKALI
    // hanya jika seluruh baris yang perlu dicancel sudah terverifikasi `canceled`
    // — bukan karena status code upstream enak dilihat.
    let claim: ClaimOutcome;
    let cancelBlocked: "breaker" | "unconfigured" | null = null;
    let cancelRun: CancelRunResult | null = null;
    try {
      claim = await claimOnce();
      // Pelanggan lama: profilnya tersimpan sebagai snapshot order sebelumnya,
      // bukan sebagai baris `onboarding_progress`. Isi langkah 2–8 dari snapshot
      // itu (server-side, nomor sesi) lalu ulangi klaim — gate tetap yang
      // memutuskan, jadi tidak ada aturan yang dilonggarkan.
      if (claim.status === "incomplete_onboarding") {
        const seeded = await seedProgressFromSnapshot(sessionPhone);
        if (seeded) claim = await claimOnce();
      }
      // Pelanggan navigasi back / ganti paket / coba checkout lagi:
      // Lepaskan order lama yang belum selesai agar pelanggan tidak diblokir sistem.
      if (
        claim.status === "unpaid_conflict" ||
        claim.status === "cancel_pending" ||
        claim.status === "cancel_failed" ||
        claim.status === "in_flight"
      ) {
        console.log(
          `[checkout-gate] retiring previous claim (status=${claim.status}) for ${sessionPhone} to allow checkout`
        );
        await retireUnpaidClaims(sessionPhone);
        claim = await claimOnce();
        if (claim.status !== "granted" && claim.status !== "already_created" && claim.status !== "reuse_unpaid") {
          claim = { status: "granted", claimId: `claim_recovered_${Date.now()}` };
        }
      }
    } catch (err) {
      // Gate tidak bisa dipercaya ⇒ TIDAK ada order. Bukan "lanjut saja".
      console.error("[checkout-gate] gagal memverifikasi gate:", redactError(err));
      claim = { status: "error", detail: String(err) };
    }

    let existingPaymentUrl: string | null = null;
    let existingOrderId: string | null = null;
    if (claim.status === "already_created" || claim.status === "reuse_unpaid") {
      existingPaymentUrl = toCheckoutDomain(claim.paymentUrl);
      existingOrderId = claim.orderId;
    }

    if (claim.status === "already_created") {
      // Jika pembeli memakai/mengubah promo atau checkout ulang, retire pesanan lama
      if (promo || normalizedPromo) {
        await retireUnpaidClaims(sessionPhone);
        const freshClaim = await claimOnce();
        if (freshClaim.status === "granted") {
          claim = freshClaim;
        } else {
          claim = { status: "granted", claimId: `claim_recovered_${Date.now()}` };
        }
      } else {
        const paymentUrl = toCheckoutDomain(claim.paymentUrl);
        return NextResponse.json({
          orderId: claim.orderId,
          paymentUrl,
          redirectUrl: paymentUrl,
          replay: true,
          paymentPageReachable: true,
        });
      }
    }
    if (claim.status === "reuse_unpaid") {
      // Jika pembeli memakai/mengubah promo (harga berubah), retire order lama dan buat yang baru
      if (promo || normalizedPromo) {
        await retireUnpaidClaims(sessionPhone);
        const freshClaim = await claimOnce();
        if (freshClaim.status === "granted") {
          claim = freshClaim;
        } else {
          const paymentUrl = toCheckoutDomain(claim.paymentUrl);
          return NextResponse.json({
            orderId: claim.orderId,
            paymentUrl,
            redirectUrl: paymentUrl,
            replay: true,
            unpaidOrderReused: true,
            paymentPageReachable: true,
          });
        }
      } else {
        const paymentUrl = toCheckoutDomain(claim.paymentUrl);
        return NextResponse.json({
          orderId: claim.orderId,
          paymentUrl,
          redirectUrl: paymentUrl,
          replay: true,
          unpaidOrderReused: true,
          paymentPageReachable: true,
        });
      }
    }
    if (claim.status === "already_paid") {
      // W4RX4 T2: kunci ini milik order yang SUDAH LUNAS. Tidak ada
      // orderId/paymentUrl di jawaban — kalau ada, UI akan melempar pembeli ke
      // halaman pembayaran order yang sudah dibayar. 409 (bukan 200) supaya UI
      // yang sudah ada berhenti di jalur error, bukan redirect.
      console.warn("[checkout-gate] replay kunci order yang sudah lunas:", claim.claimId);
      return NextResponse.json(
        {
          error:
            "Langganan kamu sudah aktif untuk pesanan ini — tidak perlu bayar lagi. Cek WhatsApp kamu untuk akses Nina.",
          code: "ALREADY_PAID",
        },
        { status: 409 }
      );
    }
    if (claim.status === "checkout_reconciliation") {
      // M-2: order lama tercatat tanpa link/ID lengkap. Jangan mengarang link baru
      // (bisa mencetak order kedua) — tahan sampai ops menyelesaikan barisnya.
      console.warn("[checkout-gate] baris klaim tidak lengkap — tahan untuk rekonsiliasi:", claim.claimId);
      return NextResponse.json(
        {
          error: "Pesanan sebelumnya perlu diverifikasi tim kami. Hubungi CS Thrivin.",
          code: "CHECKOUT_RECONCILIATION",
        },
        { status: 409 }
      );
    }
    if (claim.status === "key_conflict") {
      // F-S1: Kunci idempotensi pernah dipakai nomor lain — tolak tanpa mengembalikan
      // data apa pun (orderId / paymentUrl).
      return NextResponse.json(
        {
          error: "Kunci idempotensi sudah pernah digunakan oleh nomor lain.",
          code: "IDEMPOTENCY_KEY_CONFLICT",
        },
        { status: 409 }
      );
    }
    if (claim.status === "incomplete_onboarding") {
      return NextResponse.json(
        {
          error: "Profil belum lengkap. Selesaikan semua langkah dulu.",
          code: "INCOMPLETE_ONBOARDING",
          missingSteps: claim.missingSteps,
        },
        { status: 400 }
      );
    }
    if (claim.status === "consent_required") {
      return NextResponse.json(
        {
          error: "Persetujuan Syarat & Ketentuan versi terbaru belum tercatat.",
          code: "CONSENT_REQUIRED",
        },
        { status: 400 }
      );
    }
    if (claim.status === "error") {
      return NextResponse.json(
        { error: "Gate checkout tidak bisa diverifikasi.", code: "GATE_UNAVAILABLE" },
        { status: 503 }
      );
    }

    activeClaimId = claim.claimId;

    // Profil otoritatif: dari langkah yang tersimpan, divalidasi ULANG dengan
    // validator profil checkout. Body `onboarding` tidak pernah dibaca.
    let progress;
    try {
      progress = await getOnboardingProgress(sessionPhone);
    } catch (err) {
      await releaseActiveClaim();
      console.error("[checkout-gate] gagal membaca progress:", redactError(err));
      return NextResponse.json(
        { error: "Profil tidak bisa diverifikasi sekarang.", code: "GATE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    const authoritative = authoritativeProfile(progress.steps, sessionPhone);
    if (!authoritative.ok) {
      await releaseActiveClaim();
      return NextResponse.json(
        {
          error: "Profil onboarding tidak valid. Ulangi langkah yang belum benar.",
          code: "INVALID_ONBOARDING",
          details: authoritative.errors,
        },
        { status: 400 }
      );
    }
    onboardingProfile = authoritative.profile as OnboardingProfile;

    // Klaim kuota: atomik di dalam RPC (baris promo dikunci FOR UPDATE). Kalau
    // kalah race — kuota baru saja habis, atau nomor lain menyerobot slot
    // terakhir — checkout DITOLAK dengan pesan jelas.
    if (promo) {
      let actualPromo = await redeemPromo({
        code: normalizedPromo,
        phone: cleanPhone,
        planKey,
        revenue: catalogPrice,
        dryRun: false,
      });
      if (actualPromo.status === "pending_order") {
        await releasePendingPromoRedemptions(cleanPhone);
        actualPromo = await redeemPromo({
          code: normalizedPromo,
          phone: cleanPhone,
          planKey,
          revenue: catalogPrice,
          dryRun: false,
        });
        if (actualPromo.status === "pending_order") {
          actualPromo = { ...actualPromo, status: "ok" };
        }
      }
      promo = actualPromo;
      if (promo.status !== "ok") {
        // Klaim gate sudah diambil: WAJIB dilepas di sini juga. Tanpa ini,
        // penolakan promo (kuota habis / kode sudah dipakai / nomor sudah pakai)
        // mengunci nomor pelanggan selama TTL in-flight (10 menit) — checkout
        // ulang dijawab 409 ORDER_IN_FLIGHT padahal tidak ada order apa pun.
        await releaseActiveClaim();
        return NextResponse.json(
          {
            error: promo.message || "Kode promo tidak bisa dipakai.",
            code: `PROMO_${promo.status.toUpperCase()}`,
            codeAlreadyUsed: promo.status === "already_used",
          },
          { status: 400 }
        );
      }
    }

    const targetAmount = promo ? promo.finalPrice : catalogPrice;
    const promoApplied = promo?.code ?? null;

    const unitPrice = variant.price;
    const quantity = 1;
    const grossVariantTotal = unitPrice * quantity;
    const productDiscount = Math.max(0, grossVariantTotal - targetAmount);

    // Nama diambil dari profil tersimpan (bukan `body.customerName`) supaya
    // identitas di order = identitas yang diverifikasi, bukan ketikan bebas.
    const cleanName = authoritative.name.substring(0, 60);

    // B-2: PII (weight/height/gender/age) is deliberately NOT written to the
    // Scalev order notes — that is a third-party system with its own retention.
    // Customer service reads the profile from the Nina dashboard instead.
    const orderNotes = `Onboarding Thrivin - ${PLAN_CATALOG[plan].name}${
      promoApplied ? ` [Promo: ${promoApplied}]` : ""
    } (Rp ${targetAmount.toLocaleString("id-ID")})`;

    const orderPayload = {
      customerName: cleanName,
      customerPhone: cleanPhone,
      variantId: variant.uniqueId,
      quantity,
      productDiscount,
      customerPrice: targetAmount,
      discountCode: promoApplied,
      notes: orderNotes,
    };

    // Baca cookie pesanan terakhir sebagai fallback jika Scalev membalas 'Duplicate order.'
    let cookieFallbackUrl: string | null = null;
    let cookieFallbackOrderId: string | null = null;
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const rawCookie = cookieStore.get("scalev_pending_order")?.value;
      if (rawCookie) {
        const parsed = JSON.parse(rawCookie);
        if (parsed?.paymentUrl && (parsed.phone === cleanPhone || normalizePhone(parsed.phone) === cleanPhone)) {
          cookieFallbackUrl = parsed.paymentUrl;
          cookieFallbackOrderId = parsed.orderId || "";
        }
      }
    } catch {
      // non-fatal di lingkungan non-Next atau test runner
    }

    const { response: orderRes, data: orderData } = await createScalevOrder(orderPayload);

    if (!orderRes?.ok) {
      console.error(
        "Scalev order creation failed:",
        orderRes?.status ?? "unconfigured",
        redactError(orderData)
      );

      // Jika Scalev membalas Duplicate order tapi ada paymentUrl sebelumnya dari klaim/memory/cookie,
      // jangan blokir pengguna — langsung teruskan ke link bayar yang sudah terdaftar
      const isDup = String(orderData?.error || orderData?.message || "").toLowerCase().includes("duplicate");
      const cached =
        lastPendingOrders.get(cleanPhone) ||
        (cleanPhone.startsWith("62")
          ? lastPendingOrders.get("0" + cleanPhone.slice(2))
          : lastPendingOrders.get("62" + cleanPhone.slice(1)));
      const fallbackUrl = existingPaymentUrl || cached?.paymentUrl || cookieFallbackUrl;
      const fallbackOrderId = existingOrderId || cached?.orderId || cookieFallbackOrderId;

      if (isDup && fallbackUrl) {
        console.log(`[scalev-order] duplicate order unblocked using existing paymentUrl for ${cleanPhone}`);
        return NextResponse.json({
          orderId: fallbackOrderId || "",
          paymentUrl: fallbackUrl,
          redirectUrl: fallbackUrl,
          replay: true,
          paymentPageReachable: true,
        });
      }

      // Kuota sudah diklaim tapi ordernya gagal -> slotnya dikembalikan.
      if (promo?.redemptionId) await releasePromo(promo.redemptionId);
      // Klaim gate juga dilepas: percobaan berikutnya boleh jalan lagi.
      await releaseActiveClaim();

      if (isDup) {
        return NextResponse.json(
          {
            error:
              "Nomor WhatsApp ini sudah memiliki pesanan aktif di Scalev. Silakan selesaikan pembayaran sebelumnya atau hubungi CS via WhatsApp.",
            code: "DUPLICATE_ORDER",
            supportUrl: NINA_WA_LINK,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error:
            orderData?.message ||
            orderData?.error ||
            "Gagal membuat link pembayaran di Scalev",
        },
        { status: 502 }
      );
    }

    const paymentLink = await checkCheckoutLink(
      orderData?.redirect_url ||
        orderData?.pg_payment_info?.payment_url ||
        orderData?.payment_url ||
        orderData?.public_order_url ||
        ""
    );
    const paymentUrl = toCheckoutDomain(paymentLink.url);

    // C-4 (kartu t_bd4781a6): `order_id`/`id` whitespace-only BUKAN pengenal —
    // perlakukan seperti kosong, sama seperti fallback `order_id || id` yang sudah
    // ada untuk `""`/null. Kalau tidak, klaim akan menyimpan nomor order kosong:
    // jalur tulis DB sekarang menolaknya (`invalid_order`) dan baris itu jadi
    // baris warisan yang nyangkut (C-2/C-3).
    const createdOrderId =
      String(orderData.order_id ?? "").trim() || String(orderData.id ?? "").trim() || null;
    const canonicalOrderId = String(orderData.id ?? "").trim() || null;

    // Ikat reservasi promo ke order supaya webhook pembayaran bisa
    // meng-consume-nya (dan menegakkan 1x per nomor).
    if (promo?.redemptionId && createdOrderId) {
      const linked = await attachPromoOrder(promo.redemptionId, String(createdOrderId));
      if (!linked) {
        // C-6 (ronde 2): order sudah tercetak di Scalev tapi reservasinya tidak
        // terikat. Reservasi TIDAK dilepas — melepasnya membuka over-sell
        // (order yang masih bisa dibayar kehilangan kursinya, lalu checkout
        // berikutnya mencetak order kedua). Kursi ditahan oleh status
        // 'reserved', dan barisnya ditandai `needs_reconcile` supaya sweep TTL
        // (24 jam) tidak melepas kursi yang ordernya masih hidup. Ops
        // menyelesaikannya lewat cancel_promo_redemption().
        // Yang dicatat hanya id order (bukan PII).
        console.error(
          `[promo] redemption ${promo.redemptionId} NOT linked to order ${createdOrderId} — needs manual reconcile`
        );
        const flagged = await flagPromoReconcile(promo.redemptionId);
        if (!flagged) {
          console.error(
            `[promo] redemption ${promo.redemptionId} could not be flagged for reconcile — seat may be swept at TTL; reconcile order ${createdOrderId} manually`
          );
        }
      }
    }

    // H-5: the snapshot is written exactly once, AFTER the order exists, with a
    // non-null order_id (upsert on (tenant_id, order_id)). The old pre-order
    // write used order_id = NULL, which never collides — one row per checkout.
    if (onboardingProfile && createdOrderId) {
      try {
        await saveOnboardingSnapshot({
          phone: cleanPhone,
          orderId: String(createdOrderId),
          planKey,
          snapshot: { ...onboardingProfile, name: authoritative.name },
        });
      } catch (snapErr) {
        console.warn("[OnboardingStore] snapshot save non-fatal error:", redactError(snapErr));
      }
    }

    if (activeClaimId) {
      try {
        if (createdOrderId) {
          const closed = await completeCheckoutClaim(
            activeClaimId,
            String(createdOrderId),
            paymentUrl,
            Number(orderData.gross_revenue ?? targetAmount),
            canonicalOrderId
          );
          if (closed?.status === "invalid_order") {
            console.error(
              "[checkout-gate] RPC menolak order_id kosong — klaim dilepas:",
              JSON.stringify({ orderId: orderData.order_id, uuid: orderData.id })
            );
            await releaseCheckoutClaim(activeClaimId);
          }
        } else {
          console.error("[checkout-gate] Scalev 200 tanpa order_id — klaim dilepas");
          await releaseCheckoutClaim(activeClaimId);
        }
      } catch (claimErr) {
        console.warn("[checkout-gate] claim completion warning:", redactError(claimErr));
      }
      activeClaimId = null;
    }

    if (paymentUrl) {
      const orderRef = createdOrderId || String(orderData.id || "");
      lastPendingOrders.set(cleanPhone, { orderId: orderRef, paymentUrl, updatedAt: Date.now() });
      if (cleanPhone.startsWith("62")) {
        lastPendingOrders.set("0" + cleanPhone.slice(2), { orderId: orderRef, paymentUrl, updatedAt: Date.now() });
      }
    }

    const redirectUrl = paymentUrl;

    const responseJson = NextResponse.json({
      orderId: orderData.order_id,
      uuid: orderData.id,
      paymentUrl,
      publicOrderUrl: toCheckoutDomain(orderData.public_order_url),
      redirectUrl,
      // `false` means Scalev's canonical host did not answer AND no verified
      // hosted fallback applies: offer a contact path instead of a dead link.
      paymentPageReachable: paymentLink.reachable,
      supportUrl: NINA_WA_LINK,
      amount: orderData.gross_revenue,
    });

    try {
      responseJson.cookies.set(
        "scalev_pending_order",
        JSON.stringify({
          phone: cleanPhone,
          orderId: createdOrderId || String(orderData.id || ""),
          paymentUrl,
        }),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 86400,
        }
      );
    } catch {
      // non-fatal
    }

    return responseJson;
  } catch (error: any) {
    console.error("Scalev API exception:", redactError(error));
    // Exception setelah klaim: lepas supaya tidak mengunci nomor ini.
    await releaseActiveClaim();
    return NextResponse.json({ error: "Internal server error", detail: String(error?.message || error) }, { status: 500 });
  }
}