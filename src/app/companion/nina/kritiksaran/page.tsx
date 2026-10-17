import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FeedbackForm } from "./FeedbackForm";

/**
 * /companion/nina/kritiksaran — A8 (kontrak §6).
 * Link target for the STOP/BERHENTI flow (B2) — URL sudah ditetapkan di kontrak §11.
 *
 * noindex: ini kotak masuk keluhan, bukan halaman marketing.
 */
export const metadata: Metadata = {
  title: "Kritik & Saran — Nina | Thrivin",
  description:
    "Kirim kritik atau saran soal Nina dan Thrivin. Tulisanmu dibaca tim Thrivin dan dipakai buat perbaikan.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/companion/nina/kritiksaran" },
};

export default function KritikSaranPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
        <Link
          href="/companion/nina"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Balik ke Nina
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-gray-900 sm:text-3xl">
          Kritik & Saran
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Ada yang bikin kamu bingung, kesal, atau punya ide buat Nina? Tulis aja di sini.
          Kritik yang keras pun kami baca — tim Thrivin yang menyortir dan menindaklanjuti
          semuanya secara manual.
        </p>

        <div className="mt-8">
          <FeedbackForm />
        </div>

        <p className="mt-8 text-xs leading-relaxed text-gray-500">
          Kami simpan tulisanmu beserta waktu kirim supaya bisa ditindaklanjuti. Nomor
          WhatsApp cuma kamu isi sendiri kalau mau dihubungi, dan belum diverifikasi.
        </p>
      </main>
      <Footer />
    </>
  );
}
