"use client";

/**
 * /companion/nina/status — cek status langganan WA-first (kartu W3).
 *
 * Urutannya sengaja: nomor dulu, kode verifikasi kedua, baru data. Sebelum
 * kepemilikan nomor terbukti, layar ini TIDAK meminta dan TIDAK menampilkan
 * apa pun tentang langganan — dan jawaban langkah pertama selalu sama
 * ("kalau nomornya terdaftar…") supaya tidak jadi alat menebak nomor.
 *
 * Aksesibilitas: setiap input punya <label> eksplisit, form dikirim dengan
 * Enter/`type="submit"`, error & status diumumkan lewat aria-live, tombol
 * minimal 44px, target sentuh penuh lebar di layar kecil.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Step = "phone" | "code" | "status";

interface RenewalPlan {
  key: string;
  name: string;
  price: number;
  durationDays: number;
}
interface StatusPayload {
  state: "none" | "active" | "expired";
  expiresAt: string | null;
  remainingMs: number | null;
  lastPlanKey: string | null;
  maskedPhone: string;
  renewal: {
    eligible: boolean;
    candidate: { code: string; discountType: string; amount: number; planKeys: string[] } | null;
    plans: RenewalPlan[];
  } | null;
  renewalActivationEnabled: boolean;
}

const cardClass =
  "w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6";
const inputClass =
  "mt-1 w-full min-h-11 rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20";
const buttonClass =
  "mt-4 w-full min-h-11 rounded-xl bg-neutral-900 px-4 py-2 text-base font-medium text-white disabled:opacity-50";

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days} hari ${hours} jam`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours} jam ${minutes} menit` : `${minutes} menit`;
}

function formatIdr(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

export default function WaStatusPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/wa/subscription", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.error || "Status tidak bisa dimuat. Coba lagi.");
        setStatus(null);
        return;
      }
      setStatus(body as StatusPayload);
      setStep("status");
    } catch {
      setError("Status tidak bisa dimuat. Coba lagi.");
      setStatus(null);
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    // Sesi yang masih hidup langsung lanjut ke layar status.
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/wa/session/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.error || "Permintaan kode gagal. Coba lagi.");
        return;
      }
      setNotice(body.message || "Kode verifikasi sudah dikirim.");
      setCode("");
      setStep("code");
    } catch {
      setError("Permintaan kode gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/wa/session/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.error || "Kode verifikasi tidak valid atau sudah kedaluwarsa.");
        return;
      }
      setNotice("");
      await loadStatus();
    } catch {
      setError("Kode verifikasi tidak valid atau sudah kedaluwarsa.");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await fetch("/api/wa/session", { method: "DELETE" }).catch(() => null);
    setStatus(null);
    setPhone("");
    setCode("");
    setNotice("");
    setError("");
    setStep("phone");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-start gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold text-neutral-900">Status Langganan Nina</h1>

      {/* Satu wilayah live untuk pengumuman status & error (dibaca screen reader). */}
      <div aria-live="polite" className="w-full max-w-md">
        {notice ? <p className="text-sm text-neutral-700">{notice}</p> : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      {step === "phone" ? (
        <form className={cardClass} onSubmit={requestCode} noValidate>
          <p className="text-sm text-neutral-600">
            Masukkan nomor WhatsApp yang kamu pakai untuk Nina. Kami kirim kode verifikasi dulu.
          </p>
          <label className="mt-4 block text-sm font-medium text-neutral-900" htmlFor="wa-phone">
            Nomor WhatsApp
          </label>
          <input
            id="wa-phone"
            className={inputClass}
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            autoFocus
            required
            aria-describedby="wa-phone-hint"
            placeholder="0812xxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p id="wa-phone-hint" className="mt-1 text-xs text-neutral-500">
            Nomor dipakai hanya untuk verifikasi kepemilikan.
          </p>
          <button className={buttonClass} type="submit" disabled={pending}>
            {pending ? "Mengirim…" : "Kirim kode verifikasi"}
          </button>
        </form>
      ) : null}

      {step === "code" ? (
        <form className={cardClass} onSubmit={submitCode} noValidate>
          <label className="block text-sm font-medium text-neutral-900" htmlFor="wa-code">
            Kode verifikasi 6 digit
          </label>
          <input
            id="wa-code"
            ref={codeRef}
            className={inputClass}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button className={buttonClass} type="submit" disabled={pending || code.length !== 6}>
            {pending ? "Memeriksa…" : "Verifikasi"}
          </button>
          <div className="mt-3 flex flex-wrap gap-3">
            <button className="min-h-11 underline underline-offset-4" type="submit" disabled={pending}>
              Kirim ulang kode
            </button>
            <button
              className="min-h-11 underline underline-offset-4"
              type="button"
              disabled={pending}
              onClick={() => {
                setStep("phone");
                setCode("");
              }}
            >
              Ganti nomor
            </button>
          </div>
        </form>
      ) : null}

      {step === "status" && status ? (
        <section className={cardClass} aria-label="Status langganan">
          <p className="text-sm text-neutral-500">Nomor terverifikasi</p>
          <p className="text-base font-medium text-neutral-900">{status.maskedPhone}</p>

          {status.state === "active" ? (
            <>
              <p className="mt-4 text-lg font-semibold text-neutral-900">Langganan aktif</p>
              <p className="text-sm text-neutral-700">
                Sisa masa aktif: {formatDuration(status.remainingMs)}
              </p>
              {status.expiresAt ? (
                <p className="text-xs text-neutral-500">
                  Aktif sampai {new Date(status.expiresAt).toLocaleDateString("id-ID")}
                </p>
              ) : null}
            </>
          ) : null}

          {status.state === "expired" ? (
            <>
              <p className="mt-4 text-lg font-semibold text-neutral-900">
                Langganan sudah berakhir
              </p>
              <p className="text-sm text-neutral-700">
                Pemakaian terakhir kamu tercatat.
                {status.lastPlanKey ? ` Paket terakhir: ${status.lastPlanKey}.` : ""}
              </p>
              {status.renewal?.eligible ? (
                <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                  <p className="text-sm font-medium text-neutral-900">
                    Kamu bisa perpanjang sekarang.
                  </p>
                  {status.renewal.candidate ? (
                    <p className="text-sm text-neutral-700">
                      Kandidat promo {status.renewal.candidate.code} (
                      {status.renewal.candidate.discountType === "percentage"
                        ? `${status.renewal.candidate.amount}%`
                        : formatIdr(status.renewal.candidate.amount)}
                      ) — berlaku untuk paket{" "}
                      {status.renewal.candidate.planKeys.join(", ") || "yang memenuhi syarat"}.
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-700">
                      Ada program reaktivasi; detail kodenya menunggu keputusan owner.
                    </p>
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {status.state === "none" ? (
            <>
              <p className="mt-4 text-lg font-semibold text-neutral-900">Belum ada langganan</p>
              <p className="text-sm text-neutral-700">
                Nomor ini belum terhubung ke langganan Nina.
              </p>
            </>
          ) : null}

          {status.state !== "none" ? (
            <ul className="mt-4 space-y-2" aria-label="Paket langganan">
              {status.renewal?.plans.map((plan) => (
                <li
                  key={plan.key}
                  className="flex items-center justify-between text-sm text-neutral-800"
                >
                  <span>{plan.name}</span>
                  <span className="font-medium">{formatIdr(plan.price)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <a
            className={`${buttonClass} block text-center no-underline`}
            href="/companion/nina/onboarding"
          >
            {status.state === "active" ? "Perpanjang langganan" : "Mulai langganan"}
          </a>
          {status.state === "expired" && !status.renewalActivationEnabled ? (
            <p className="mt-2 text-xs text-neutral-500">
              Aktivasi promo reaktivasi belum diaktifkan sampai keputusan owner selesai.
            </p>
          ) : null}

          <button
            className="mt-3 min-h-11 w-full text-sm underline underline-offset-4"
            type="button"
            onClick={logout}
          >
            Keluar dari sesi ini
          </button>
        </section>
      ) : null}
    </main>
  );
}
