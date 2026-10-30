import type { Metadata } from "next";
import Link from "next/link";
import { NINA_WA_LINK, OFFICIAL_WA_NUMBER } from "@/lib/wa-cloud";

export const metadata: Metadata = {
  title: "Pembayaran diterima",
  description: "Langkah selanjutnya setelah pembayaran paket Nina.",
  alternates: { canonical: "/pembayaran/sukses" },
  robots: { index: false, follow: false },
};

/**
 * Post-payment landing page (Scalev redirect target).
 *
 * SAFE ON DIRECT ACCESS: this page is pure copy. It never reads the query
 * string and never calls an API, so opening it (or forwarding the link) cannot
 * activate a subscription or claim a payment. Activation only happens in the
 * verified Scalev webhook.
 */
export default function PaymentSuccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-start gap-5 px-4 py-10">
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">Terima kasih!</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">
          Kalau pembayaranmu sudah masuk, akses Nina dikirim ke nomor WhatsApp yang kamu
          daftarkan. Biasanya cuma butuh beberapa detik.
        </p>

        <h2 className="mt-6 text-base font-semibold text-neutral-900">Langkah selanjutnya</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-700">
          <li>Buka WhatsApp dan chat Nina di nomor resmi Thrivin.</li>
          <li>Kirim pesan apa saja — misalnya &ldquo;Halo Nina&rdquo;.</li>
          <li>Nina akan menyapa dan mulai nemenin program kamu.</li>
        </ol>

        <a
          href={NINA_WA_LINK}
          className="mt-6 flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-3 text-base font-medium text-white"
        >
          Chat Nina di WhatsApp
        </a>
        <p className="mt-2 text-center text-xs text-neutral-500">
          Nomor resmi Nina: {OFFICIAL_WA_NUMBER}
        </p>

        <p className="mt-6 text-sm leading-relaxed text-neutral-600">
          Belum dapat pesan setelah beberapa menit?{" "}
          <Link className="font-medium text-neutral-900 underline" href="/nina/status">
            Cek status langgananmu
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
