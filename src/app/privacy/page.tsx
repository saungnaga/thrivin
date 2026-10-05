"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col">
      <Navbar />

      <main className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-brand-900 transition-colors mb-8 py-1 px-2.5 rounded-lg bg-surface-muted border border-surface-border w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Beranda</span>
        </Link>

        {/* Title */}
        <div className="space-y-3 mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-accent-dark uppercase tracking-wider font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            Privasi & Keamanan Data
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 tracking-tight">
            Kebijakan Privasi Thrivin
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary">
            Terakhir diperbarui: Oktober 2026. Kami berkomitmen menjaga data pribadimu tetap aman.
          </p>
        </div>

        {/* Policy Content */}
        <div className="bg-white p-6 sm:p-10 rounded-3xl border border-surface-border shadow-xs space-y-8 text-sm sm:text-base text-text-secondary leading-relaxed">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-900 text-xs sm:text-sm">
            <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block mb-0.5">Komitmen Privasi Utama:</strong>
              Data nomor WhatsApp, foto makanan, riwayat olahraga, dan percakapan pribadimu dengan AI Companion 100% aman, dienkripsi, dan tidak pernah dijual atau disebarkan ke pengiklan pihak ketiga mana pun.
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              1. Data Apa Saja yang Kami Kumpulkan?
            </h2>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong>Data Kontak:</strong> Nomor WhatsApp yang kamu daftarkan untuk menghubungkan bot AI Companion.
              </li>
              <li>
                <strong>Data Profil Fisik & Target:</strong> Usia, berat, tinggi, fokus program, dan tingkat aktivitas untuk kalkulasi blueprint metabolisme harian (TDEE dan target protein).
              </li>
              <li>
                <strong>Media yang Kamu Kirim:</strong> Foto makanan untuk estimasi kalori dan tangkapan layar Strava/smartwatch untuk evaluasi olahraga harian.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              2. Bagaimana Kami Menggunakan Data Tersebut?
            </h2>
            <p>
              Data yang kamu kirimkan semata-mata digunakan oleh asisten AI Companion (seperti Nina) untuk:
            </p>
            <ul className="space-y-2 list-disc pl-5">
              <li>Menghitung estimasi gizi dan kalori foto piring makan secara akurat.</li>
              <li>Mengingatkan jadwal aktivitas fisik dan mengecek progres harianmu.</li>
              <li>Mengingat riwayat cedera atau preferensi latihan agar rekomendasi tetap aman.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              3. Garansi Uang Kembali 3 Hari
            </h2>
            <p>
              Kami mengutamakan kepuasan pengguna. Jika dalam 3 hari pertama setelah pembelian kamu merasa pendampingan AI Companion tidak cocok dengan kebutuhanmu, kamu berhak mengajukan klaim garansi pengembalian dana 100% tanpa pertanyaan berbelit.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              4. Hubungi Kami
            </h2>
            <p className="leading-relaxed">
              Jika memiliki pertanyaan mengenai kebijakan privasi, permohonan penghapusan data, atau membutuhkan bantuan akun, silakan{" "}
              <a
                href="https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20punya%20pertanyaan%20seputar%20kebijakan%20privasi%20atau%20data%20akun"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                hubungi Customer Service Thrivin via WhatsApp
              </a>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
