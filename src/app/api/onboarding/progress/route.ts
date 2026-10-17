/**
 * /api/onboarding/progress — state onboarding di SERVER (A2).
 *
 *   POST {step, data}  simpan satu langkah (terikat nomor sesi terverifikasi)
 *   GET                kelengkapan menurut server
 *
 * `localStorage` tetap ada untuk UX, tetapi bukan sumber kebenaran: keputusan
 * "selesai" dibuat dari baris di `onboarding_progress`, dan `create-order`
 * memvalidasi ulang sebelum order eksternal dibuat.
 */
import { NextResponse } from "next/server";
import { getWaSessionPhone } from "@/lib/wa-session";
import { limitRequest } from "@/lib/rate-limit";
import { validateStepInput } from "@/lib/onboarding-steps";
import { getOnboardingProgress, saveOnboardingStep } from "@/lib/checkout-gate";
import { redactError } from "@/lib/onboarding-store";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const phone = await getWaSessionPhone();
  if (!phone) {
    return json({ ok: false, code: "SESSION_REQUIRED", error: "Sesi tidak valid." }, 401);
  }
  try {
    const progress = await getOnboardingProgress(phone);
    return json({
      ok: true,
      stepReached: progress.stepReached,
      complete: progress.complete,
      missingSteps: progress.missingSteps,
      invalidSteps: progress.invalidSteps,
    });
  } catch (err) {
    return json({ ok: false, code: "PROGRESS_UNAVAILABLE", error: redactError(err) }, 503);
  }
}

export async function POST(req: Request) {
  const phone = await getWaSessionPhone();
  if (!phone) {
    return json({ ok: false, code: "SESSION_REQUIRED", error: "Sesi tidak valid." }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Body harus JSON." }, 400);
  }

  const limit = limitRequest(req, "onboarding-progress", { ipLimit: 120, phoneLimit: 90, phone });
  if (!limit.ok) {
    return json({ ok: false, code: "RATE_LIMITED" }, 429);
  }

  const raw = (body ?? {}) as { step?: unknown; data?: unknown };
  const step = Number(raw.step);
  const validation = validateStepInput(step, raw.data);
  if (!validation.ok) {
    return json({ ok: false, code: "INVALID_STEP_DATA", errors: validation.errors }, 400);
  }

  // Langkah 8 memuat nomor: harus nomor yang sama dengan sesi terverifikasi.
  // Kalau berbeda, profil ini milik orang lain — jangan dicampur.
  if (step === 8 && validation.data.whatsappNumber !== phone) {
    return json(
      {
        ok: false,
        code: "SESSION_PHONE_MISMATCH",
        error: "Nomor profil berbeda dengan nomor terverifikasi. Verifikasi ulang nomor itu dulu.",
      },
      409
    );
  }

  try {
    await saveOnboardingStep(phone, step, validation.data);
    const progress = await getOnboardingProgress(phone);
    return json({
      ok: true,
      step,
      complete: progress.complete,
      missingSteps: progress.missingSteps,
      invalidSteps: progress.invalidSteps,
    });
  } catch (err) {
    return json({ ok: false, code: "PROGRESS_SAVE_FAILED", error: redactError(err) }, 503);
  }
}
