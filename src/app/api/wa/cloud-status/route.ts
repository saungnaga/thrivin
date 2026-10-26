/**
 * Callback status delivery WhatsApp Cloud untuk sapaan pertama Nina
 * (kartu t_22ccd958). Jalur ini melengkapi `first_greeting_status='sent'`:
 * `sent` cuma berarti "Meta menerima panggilan kirim", sedangkan delivery
 * sebenarnya datang BELAKANGAN di webhook `statuses` Meta, di-key oleh `wamid`.
 *
 * Aturan:
 * - Fail CLOSED. Tanpa `WHATSAPP_CLOUD_APP_SECRET` semua POST ditolak (503).
 *   Webhook ini menulis ke tabel pelanggan, jadi tidak boleh tanpa signature.
 * - Signature `X-Hub-Signature-256` = HMAC-SHA256 body mentah, format `sha256=<hex>`.
 * - Korelasi HANYA lewat wamid yang tersimpan. Receipt untuk pesan yang bukan
 *   milik kita → nol baris berubah (bukan error; Meta akan retry kalau non-2xx).
 * - Selalu 200 untuk payload sah, walaupun nol baris match.
 *
 * Env: WHATSAPP_CLOUD_APP_SECRET, WHATSAPP_CLOUD_VERIFY_TOKEN.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { recordGreetingDelivery, redactError } from "@/lib/onboarding-store";
import { greetingStatusFromReceipt } from "@/lib/wa-cloud";

export const dynamic = "force-dynamic";

function verifyMetaSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(header.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verifikasi langganan webhook Meta (dipanggil sekali saat owner mendaftarkan URL). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const expected = String(process.env.WHATSAPP_CLOUD_VERIFY_TOKEN || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "verify token not configured" }, { status: 503 });
  }
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  if (mode !== "subscribe" || token !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return new NextResponse(url.searchParams.get("hub.challenge") || "", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: Request) {
  try {
    const secret = String(process.env.WHATSAPP_CLOUD_APP_SECRET || "").trim();
    if (!secret) {
      console.error(
        "[WaCloudStatus] WHATSAPP_CLOUD_APP_SECRET tidak diset — receipt ditolak (fail closed)"
      );
      return NextResponse.json({ error: "status webhook not configured" }, { status: 503 });
    }

    const raw = await req.text();
    if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
    }

    let updated = 0;
    let ignored = 0;
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const statuses = change?.value?.statuses;
        if (!Array.isArray(statuses)) continue;
        for (const receipt of statuses) {
          const status = greetingStatusFromReceipt(receipt?.status, receipt?.errors);
          if (!status) {
            ignored++;
            continue;
          }
          const matched = await recordGreetingDelivery(String(receipt?.id || ""), status);
          if (matched) updated++;
          else ignored++;
        }
      }
    }

    // Tanpa PII: hanya hitungan.
    console.log(`[WaCloudStatus] receipts updated=${updated} ignored=${ignored}`);
    return NextResponse.json({ ok: true, updated, ignored });
  } catch (error: any) {
    console.error("[WaCloudStatus] Unhandled exception:", redactError(error));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
