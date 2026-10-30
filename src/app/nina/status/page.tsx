"use client";

/**
 * /nina/status — cek status langganan WA-first (TANPA OTP).
 *
 * Keputusan owner 20/10: nomor WhatsApp diketik → server cek database → satu
 * dari tiga cabang. Tidak ada kode verifikasi, tidak ada hitung mundur, tidak
 * ada "kode sudah dikirim".
 *
 *   new      → lanjut onboarding seperti biasa
 *   active   → "langganan aktif, sisa N hari" + CTA perpanjang
 *   inactive → "langganan berakhir N hari lalu" (+ penawaran TEMENANLAGI kalau
 *              sudah lewat 7 hari)
 *
 * Aksesibilitas: setiap input punya <label> eksplisit, form dikirim dengan
 * Enter/`type="submit"`, error & status diumumkan lewat aria-live, tombol
 * minimal 44px, target sentuh penuh lebar di layar kecil.
 */
import { useState } from "react";
import { TEMANBARU_PROMO } from "@/lib/pricing-copy";

type LookupResult =
  | { ok: true; status: "new" }
  | { ok: true; status: "active"; planName: string | null; daysLeft: number | null }
  | { ok: true; status: "inactive"; daysSinceExpiry: number | null; renewalPromo: boolean };

const cardClass =
  "w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6";
const inputClass =
  "mt-1 w-full min-h-11 rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20";
const buttonClass =
  "mt-4 w-full min-h-11 rounded-xl bg-neutral-900 px-4 py-2 text-base font-medium text-white disabled:opacity-50";

const ONBOARDING_URL = "/nina/onboarding/1";

function dayLabel(value: number | null, suffix: string): string {
  return value === null ? "-" : `${value} hari ${suffix}`;
}

export default function WaStatusPage() {
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/wa/session/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.error || "Status nomor tidak bisa dicek. Coba lagi.");
        return;
      }
      setResult(body as LookupResult);
    } catch {
      setError("Status nomor tidak bisa dicek. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setResult(null);
    setPhone("");
    setError("");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-start gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold text-neutral-900">Status Langganan Nina</h1>

      {/* Satu wilayah live untuk pengumuman status & error (dibaca screen reader). */}
      <div aria-live="polite" className="w-full max-w-md">
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      {result === null ? (
        <form className={cardClass} onSubmit={lookup} noValidate>
          <p className="text-sm text-neutral-600">
            Masukkan nomor WhatsApp yang kamu pakai untuk Nina. Kami cek statusnya dulu — tanpa
            menunggu pesan apa pun.
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
            Nomor hanya dipakai untuk mengecek status langganan.
          </p>
          <button className={buttonClass} type="submit" disabled={pending}>
            {pending ? "Mengecek…" : "Cek status"}
          </button>
        </form>
      ) : null}

      {result?.status === "new" ? (
        <section className={cardClass} aria-label="Status langganan">
          <p className="text-lg font-semibold text-neutral-900">Nomor belum terdaftar</p>
          <p className="mt-1 text-sm text-neutral-700">
            Nomor ini belum punya langganan Nina. Lanjut isi data untuk mulai.
          </p>
          <a className={`${buttonClass} block text-center no-underline`} href={ONBOARDING_URL}>
            Mulai langganan
          </a>
          <button
            className="mt-3 min-h-11 w-full text-sm underline underline-offset-4"
            type="button"
            onClick={reset}
          >
            Ganti nomor
          </button>
        </section>
      ) : null}

      {result?.status === "active" ? (
        <section className={cardClass} aria-label="Status langganan">
          <p className="text-lg font-semibold text-neutral-900">Langganan aktif</p>
          <p className="mt-1 text-sm text-neutral-700">
            Sisa masa aktif: {dayLabel(result.daysLeft, "lagi")}.
          </p>
          <a className={`${buttonClass} block text-center no-underline`} href={ONBOARDING_URL}>
            Perpanjang langganan
          </a>
          <button
            className="mt-3 min-h-11 w-full text-sm underline underline-offset-4"
            type="button"
            onClick={reset}
          >
            Ganti nomor
          </button>
        </section>
      ) : null}

      {result?.status === "inactive" ? (
        <section className={cardClass} aria-label="Status langganan">
          <p className="text-lg font-semibold text-neutral-900">Langganan sudah berakhir</p>
          <p className="mt-1 text-sm text-neutral-700">
            Berakhir {dayLabel(result.daysSinceExpiry, "lalu")}.
          </p>
          {result.renewalPromo ? (
            <div className="mt-3 rounded-xl bg-neutral-50 p-3">
              <p className="text-sm font-medium text-neutral-900">
                Ada penawaran {TEMANBARU_PROMO.code}: diskon{" "}
                {TEMANBARU_PROMO.discountPercent}% untuk perpanjangan.
              </p>
            </div>
          ) : null}
          <a className={`${buttonClass} block text-center no-underline`} href={ONBOARDING_URL}>
            Perpanjang langganan
          </a>
          <button
            className="mt-3 min-h-11 w-full text-sm underline underline-offset-4"
            type="button"
            onClick={reset}
          >
            Ganti nomor
          </button>
        </section>
      ) : null}
    </main>
  );
}
