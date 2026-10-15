"use client";

import { useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

/**
 * Kritik & saran form (A8).
 *
 * Boundary rules live on the server (src/lib/feedback.ts + /api/feedback) — this
 * component only mirrors the length bounds and never renders submitted content
 * back into the DOM: the thank-you screen is static text, so a stored `<script>`
 * cannot become markup.
 *
 * The request token is generated once per page and reused on every retry, which
 * is what makes a retry after a failed/duplicated send land on ONE row.
 */
const MAX_CHARS = 2000;
const MIN_CHARS = 10;

function newRequestToken(): string {
  // 32 hex chars — matches FEEDBACK_REQUEST_TOKEN_PATTERN on the server.
  return crypto.randomUUID().replace(/-/g, "");
}

export function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const successRef = useRef<HTMLHeadingElement | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    setError(null);
    setState("sending");
    tokenRef.current ??= newRequestToken();

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          contact,
          request_token: tokenRef.current,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // Same draft + same token stay on screen: sending again cannot duplicate.
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Kritik/saran kamu belum tersimpan. Coba kirim ulang."
        );
        setState("idle");
        return;
      }
      setState("sent");
      setMessage("");
      setContact("");
      requestAnimationFrame(() => successRef.current?.focus());
    } catch {
      setError("Koneksi terputus. Coba kirim ulang.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2
          ref={successRef}
          tabIndex={-1}
          className="text-lg font-semibold text-emerald-900 outline-none"
        >
          Makasih, kritik/saran kamu sudah tersimpan.
        </h2>
        <p className="mt-2 text-sm text-emerald-900/80">
          Nina dan tim Thrivin baca semuanya satu per satu. Kami tidak bisa membalas tiap
          pesan, tapi catatanmu benar-benar dipakai buat memperbaiki Thrivin.
        </p>
      </div>
    );
  }

  // Code points, the way the server and Postgres `char_length` count them: `.length`
  // would count an emoji as 2 and show the user a number the server does not use (F-4).
  const remaining = MAX_CHARS - [...message].length;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-900">
          Kritik atau saran{" "}
          <span className="font-normal text-gray-500">
            (wajib, {MIN_CHARS}–{MAX_CHARS} karakter)
          </span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={MIN_CHARS}
          maxLength={MAX_CHARS}
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby="message-help message-count"
          className="mt-2 w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          placeholder="Ceritakan apa yang bikin kamu bingung, kesal, atau kepikiran soal Nina & Thrivin…"
        />
        <p id="message-help" className="mt-1 text-xs text-gray-500">
          Kami menyimpan tulisanmu sebagai teks biasa dan membacanya manual.
        </p>
        <p id="message-count" aria-live="polite" className="mt-1 text-xs text-gray-500">
          {remaining} karakter tersisa
        </p>
      </div>

      <div>
        <label htmlFor="contact" className="block text-sm font-medium text-gray-900">
          Nomor WhatsApp <span className="font-normal text-gray-500">(opsional)</span>
        </label>
        <input
          id="contact"
          name="contact"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          aria-describedby="contact-help"
          className="mt-2 w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          placeholder="08xxxxxxxxxx"
        />
        <p id="contact-help" className="mt-1 text-xs text-gray-500">
          Isi hanya kalau kamu mau kami hubungi. Nomor ini belum kami verifikasi.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {state === "sending" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Mengirim…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden="true" />
            Kirim
          </>
        )}
      </button>
    </form>
  );
}

export default FeedbackForm;
