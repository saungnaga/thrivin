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
  type ClaimOutcome,
} from "@/lib/checkout-gate";
import { cancelStaleOrders, type CancelRunResult } from "@/lib/checkout-cancel";
import { TERMS_VERSION } from "@/lib/consent";

const DEFAULT_SCALEV_STORE_ID = "store_ius5tpSzfbS8SlB8GTjdGaBA";

// Test seam (M-7): the suite points this at a local mock so no test ever creates
// a real order in the Scalev production account. Default is the real API.
const SCALEV_API_BASE = process.env.SCALEV_API_BASE_URL || "https://api.scalev.com";

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
  const fallback = {
    uniqueId: PLAN_CATALOG[plan].fallbackVariantId,
    price: PLAN_CATALOG[plan].fallbackVariantPrice,
  };
  try {
    const res = await fetch(`${SCALEV_API_BASE}/v3/stores/${storeId}/products`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 },
    } as RequestInit);
    if (!res.ok) return fallback;
    const json = await res.json();
    const products: any[] = json?.data || [];
    const keywords = PLAN_LOOKUP_KEYWORDS[plan];
    const match = products.find((p) =>
      keywords.some((kw) => String(p.name || "").toLowerCase().includes(kw))
    );
    const variant = match?.variants?.[0];
    if (!variant?.unique_id) return fallback;
    return {
      uniqueId: variant.unique_id,
      price: Math.round(Number(variant.price)) || fallback.price,
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
  const promo = await redeemPromo({ code, phone, planKey, revenue: catalogPrice, dryRun: true });
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

    const limited = limitRequest(req, "scalev-create-order", {
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

    // Backstop legacy: sebelum tabel promo ada, promo "harga jadi <= Rp 10.000"
    // juga dijual lewat Scalev, jadi riwayat order per nomor tetap dicek. Ini
    // TIDAK menggantikan ledger promo — dua-duanya harus lolos.
    if (promo && promo.finalPrice <= 10000) {
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
      if (claim.status === "cancel_pending" || claim.status === "cancel_failed") {
        const run = await cancelStaleOrders({ phone: sessionPhone });
        cancelRun = run;
        if (run.circuitOpen) cancelBlocked = "breaker";
        else if (run.unconfigured) cancelBlocked = "unconfigured";
        else if (claim.status === "cancel_pending" && run.resolvedAll) claim = await claimOnce();
      }
    } catch (err) {
      // Gate tidak bisa dipercaya ⇒ TIDAK ada order. Bukan "lanjut saja".
      console.error("[checkout-gate] gagal memverifikasi gate:", redactError(err));
      claim = { status: "error", detail: String(err) };
    }

    if (claim.status === "already_created") {
      // Replay: kembalikan order yang SAMA. Tidak ada panggilan Scalev kedua.
      return NextResponse.json({
        orderId: claim.orderId,
        paymentUrl: claim.paymentUrl,
        replay: true,
      });
    }
    if (claim.status === "reuse_unpaid") {
      // F-W4-1(a): nomor ini masih punya order BELUM DIBAYAR untuk paket yang
      // sama. Kunci baru dikembalikan ke order/link itu — tidak ada order kedua
      // yang bisa dibayar. Tidak ada panggilan Scalev.
      return NextResponse.json({
        orderId: claim.orderId,
        paymentUrl: claim.paymentUrl,
        replay: true,
        unpaidOrderReused: true,
      });
    }
    if (claim.status === "unpaid_conflict") {
      // F-W4-1(a): paket BEDA dari order yang masih belum dibayar ⇒ blokir
      // eksplisit. Tanpa orderId/paymentUrl: tidak ada data order yang dibocorkan.
      return NextResponse.json(
        {
          error:
            "Masih ada pesanan yang belum dibayar untuk paket lain. Selesaikan atau bayar pesanan itu dulu sebelum ganti paket.",
          code: "UNPAID_ORDER_EXISTS",
        },
        { status: 409 }
      );
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
    if (claim.status === "in_flight") {
      return NextResponse.json(
        {
          error: "Pesanan sebelumnya masih diproses. Tunggu sebentar lalu muat ulang halaman.",
          code: "ORDER_IN_FLIGHT",
        },
        { status: 409 }
      );
    }
    // F-W4-1c: nomor ini punya order basi yang cancel-nya BELUM tuntas. Worker
    // sudah dijalankan di atas; kalau masih di sini, cancel tidak (belum) bisa
    // dipercaya ⇒ JANGAN cetak order kedua. 423 untuk yang terminal (butuh owner),
    // 409 untuk yang masih pending (boleh dicoba lagi nanti).
    if (claim.status === "cancel_pending" || claim.status === "cancel_failed") {
      if (cancelBlocked) {
        // Credential cancel hilang / breaker 401: masalah KONFIGURASI, bukan nomor
        // pelanggan. Fail-closed + alarm; jangan mengunci nomor satu per satu.
        console.error(
          `[checkout-gate] cancel tidak tersedia (${cancelBlocked}) — checkout ditahan (fail-closed)`
        );
        return NextResponse.json(
          {
            error: "Verifikasi pesanan sebelumnya belum bisa diselesaikan. Coba lagi sebentar lagi.",
            code: "CANCEL_UNAVAILABLE",
          },
          { status: 503 }
        );
      }
      if (claim.status === "cancel_failed" || (cancelRun?.failed ?? 0) > 0) {
        // Terminal: worker sudah mencatat `cancel_failed` untuk baris ini (atau
        // barisnya memang sudah terminal sebelum request ini). Butuh owner.
        return NextResponse.json(
          {
            error:
              "Pesanan lama kamu perlu diselesaikan manual dulu sebelum bisa membuat pesanan baru. Hubungi CS Thrivin.",
            code: "ORDER_CANCEL_FAILED",
          },
          { status: 423 }
        );
      }
      return NextResponse.json(
        {
          error:
            "Pesanan lama kamu sedang dibatalkan. Tunggu sebentar lalu muat ulang halaman.",
          code: "ORDER_CANCEL_PENDING",
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
      promo = await redeemPromo({
        code: normalizedPromo,
        phone: cleanPhone,
        planKey,
        revenue: catalogPrice,
        dryRun: false,
      });
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
    const quantity = targetAmount > unitPrice ? Math.ceil(targetAmount / unitPrice) : 1;
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
      store_unique_id: storeId,
      customer_name: cleanName,
      customer_phone: cleanPhone,
      ordervariants: [{ variant_unique_id: variant.uniqueId, quantity }],
      product_discount: productDiscount,
      payment_method: "payment_link",
      notes: orderNotes,
    };

    const orderRes = await fetch(`${SCALEV_API_BASE}/v3/orders`, {
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
      // Klien kita tidak bisa memperbaiki error Scalev -> jangan teruskan status
      // upstream mentah (422 dari Scalev bukan berarti request browser salah).
      // 502 = gateway downstream gagal; pesan aslinya tetap ikut.
      console.error(
        "Scalev order creation failed:",
        orderRes.status,
        redactError(orderData)
      );
      // Kuota sudah diklaim tapi ordernya gagal -> slotnya dikembalikan.
      if (promo?.redemptionId) await releasePromo(promo.redemptionId);
      // Klaim gate juga dilepas: percobaan berikutnya boleh jalan lagi.
      await releaseActiveClaim();
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

    let paymentUrl: string =
      orderData?.pg_payment_info?.payment_url ||
      orderData?.payment_url ||
      orderData?.public_order_url ||
      "";

    // Custom domain SSL (checkout.thrivin.id) may still be provisioning.
    if (paymentUrl.includes("checkout.thrivin.id")) {
      try {
        await fetch(paymentUrl, { method: "HEAD", signal: AbortSignal.timeout(1500) });
      } catch {
        paymentUrl = paymentUrl.replace("checkout.thrivin.id", "thrivin.myscalev.com");
      }
    }

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
      await saveOnboardingSnapshot({
        phone: cleanPhone,
        orderId: String(createdOrderId),
        planKey,
        snapshot: onboardingProfile,
      });
    }

    // Klaim gate ditutup SETELAH order benar-benar ada: `created` menyimpan
    // order_id + payment_url sehingga replay idempotency key mengembalikan
    // order yang sama, bukan mencetak order kedua. Kalau Scalev menjawab 200
    // TANPA order_id (bentuk jawaban tak terduga), klaim DILEPAS — kalau tidak,
    // nomor ini terkunci 10 menit oleh klaim yang tidak pernah ada ordernya.
    if (activeClaimId) {
      if (createdOrderId) {
        const closed = await completeCheckoutClaim(
          activeClaimId,
          String(createdOrderId),
          paymentUrl,
          Number(orderData.gross_revenue ?? targetAmount),
          // F-W4-1c: canonical UUID disimpan terpisah dari nomor bisnis. Endpoint
          // cancel hanya menerima yang ini; webhook tetap join ke `order_id`.
          canonicalOrderId
        );
        if (closed?.status === "invalid_order") {
          // Backstop C-4: RPC menolak menulis nomor order kosong, jadi tidak ada
          // yang tersimpan. Klaim tidak boleh tinggal `in_flight` (nomor terkunci
          // sampai TTL) — dilepas, sama seperti jalur "Scalev 200 tanpa order_id".
          // Route sudah menormalkan `order_id` di atas, jadi jalur ini hanya
          // penjaga; kalau sampai kena, ada bentuk jawaban Scalev yang belum
          // dikenal dan itu harus kelihatan di log.
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
      activeClaimId = null;
    }

    return NextResponse.json({
      orderId: orderData.order_id,
      uuid: orderData.id,
      paymentUrl,
      publicOrderUrl: orderData.public_order_url,
      amount: orderData.gross_revenue,
    });
  } catch (error: any) {
    console.error("Scalev API exception:", redactError(error));
    // Exception setelah klaim: lepas supaya tidak mengunci nomor ini.
    await releaseActiveClaim();
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}