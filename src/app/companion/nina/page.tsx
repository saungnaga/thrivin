"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MessageCircle,
  Sparkles,
  Camera,
  Activity,
  BellRing,
  BrainCircuit,
  HeartHandshake,
  ShieldCheck,
  Zap,
  HelpCircle,
  X
} from "lucide-react";

export default function NinaSalesPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "quarterly">("quarterly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const CHECKOUT_URL = "https://digitanest.store/checkout-nina";

  const FAQS = [
    {
      q: "Bagaimana cara kerja Nina membaca foto makanan dan Strava?",
      a: "Tinggal kirim foto langsung di ruang obrolan WhatsApp seperti mengirim foto ke teman! Kirim foto piring makan siangmu di warteg atau kafe, dan Nina akan memperkirakan porsi protein dan kalorinya. Kirim screenshot aktivitas lari dari Strava/Garmin, dan Nina akan menganalisis pace, zona detak jantung (HR zone), dan memberi feedback recovery."
    },
    {
      q: "Apa bedanya Nina dengan ChatGPT biasa?",
      a: "ChatGPT adalah kotak teks pasif di website yang menunggu kamu mengetik, lupa konteks begitu sesi berakhir, dan tidak hidup di rutinitas harianmu. Nina adalah pendamping hidup di WhatsApp yang reach out duluan, mengingat riwayat cedera dan energimu berminggu-minggu, serta memahami konteks makanan dan kehidupan nyata di Indonesia."
    },
    {
      q: "Apakah Nina adalah bot kaku yang meminta kita mengetik angka?",
      a: "Sama sekali bukan. Nina berbicara dalam bahasa manusia yang santai, empatik, dan mengerti lelahnya hari kerjamu. Kamu bahkan bisa mengirim voice note di WhatsApp dan Nina akan merespons dengan konteks yang utuh."
    },
    {
      q: "Bagaimana dengan privasi data dan riwayat percakapanku?",
      a: "Privasimu 100% aman. Datamu digunakan hanya untuk membangun memori kontekstual agar saran Nina semakin akurat untukmu. Datamu tidak pernah dibagikan atau dijual ke pihak ketiga, dan kamu bisa meminta penghapusan riwayat kapan saja."
    },
    {
      q: "Bisakah saya membatalkan langganan kapan saja?",
      a: "Tentu saja. Bebas dari kontrak mengikat. Kamu bisa membatalkan kapan saja melalui WhatsApp tanpa syarat berbelit."
    }
  ];

  return (
    <div className="min-h-screen bg-surface-muted text-text-primary selection:bg-brand-100 selection:text-brand-900">
      {/* ─── Top Header ─── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-surface-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Beranda</span>
            </Link>
            <div className="h-4 w-px bg-surface-border hidden sm:block" />
            <Link href="/" className="hidden sm:flex items-center">
              <span className="font-black tracking-[0.2em] text-gradient text-lg">
                THRIVIN
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/path/wellness"
              className="text-xs sm:text-sm font-semibold text-text-secondary hover:text-brand-900 transition-colors"
            >
              Silabus Wellness
            </Link>
            <a
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-brand-900 text-white px-5 py-2 text-xs sm:text-sm font-bold hover:bg-brand-800 transition-all shadow-glow hover:-translate-y-0.5"
            >
              <span className="text-white">Mulai Berlangganan</span>
              <ArrowRight className="w-3.5 h-3.5 text-accent" />
            </a>
          </div>
        </div>
      </header>

      {/* ─── Hero Section with Real Nina Photo ─── */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 px-4 sm:px-6 lg:px-8 overflow-hidden bg-gradient-hero">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-16 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-brand-200 text-xs font-bold uppercase tracking-[0.2em] text-brand-800 shadow-xs mb-6">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                Personal AI Companion · Di WhatsApp Kamu
              </div>

              <h1 className="font-serif text-4xl sm:text-6xl font-bold text-text-primary tracking-tight leading-[1.12] mb-6">
                You&apos;ve met Thrivin. <br />
                Now, meet <span className="text-gradient">Nina.</span>
              </h1>

              <p className="text-base sm:text-lg text-text-secondary leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
                Bukan sekadar ChatGPT atau chatbot pasif. Nina hadir di WhatsApp pribadimu: bisa <strong className="text-brand-900">membaca foto makananmu</strong>, <strong className="text-brand-900">menganalisis screenshot Strava</strong>, <strong className="text-brand-900">reach out duluan</strong> sebagai reminder, dan mengingat kondisimu dengan sangat personal.
              </p>

              {/* Quick Feature Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 mb-10 max-w-md mx-auto lg:mx-0 text-left">
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-brand-100 shadow-xs text-xs font-semibold text-brand-900">
                  <Camera className="w-4 h-4 text-accent shrink-0" />
                  <span>Baca Foto Makanan & Strava</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-brand-100 shadow-xs text-xs font-semibold text-brand-900">
                  <BellRing className="w-4 h-4 text-accent shrink-0" />
                  <span>Proaktif Reach Out Duluan</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-brand-100 shadow-xs text-xs font-semibold text-brand-900">
                  <BrainCircuit className="w-4 h-4 text-accent shrink-0" />
                  <span>Ingat Riwayat & Cedera</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-brand-100 shadow-xs text-xs font-semibold text-brand-900">
                  <MessageCircle className="w-4 h-4 text-accent shrink-0" />
                  <span>Obrolan Hangat di WhatsApp</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <a
                  href="#pricing"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm shadow-glow transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                  <span className="text-white">Pilih Paket Langganan</span>
                  <ArrowRight className="w-4 h-4 text-accent" />
                </a>
                <a
                  href="#differentiation"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-4 rounded-full bg-white border border-brand-200 text-brand-900 font-semibold text-sm hover:border-accent hover:bg-surface-muted transition-all shadow-xs cursor-pointer"
                >
                  Kenapa Nina Berbeda?
                </a>
              </div>

              <p className="mt-4 text-xs text-text-muted">
                ✓ Sapa langsung di WhatsApp · Tanpa download aplikasi baru · Batal kapan saja
              </p>
            </motion.div>

            {/* Right: Real Nina Image Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative flex justify-center"
            >
              <div className="relative w-full max-w-[380px] sm:max-w-[420px] rounded-3xl overflow-hidden shadow-2xl border-4 border-white bg-white group">
                <Image
                  src="/nina-intro.webp"
                  alt="Nina - Personal Wellness Companion Thrivin"
                  width={680}
                  height={1020}
                  priority
                  className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                />

                {/* Floating WhatsApp Live Status Badge */}
                <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-2xl bg-brand-950/85 backdrop-blur-md text-white border border-white/10 shadow-lg flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white leading-tight">Nina · Online di WhatsApp</p>
                      <p className="text-[11px] text-brand-200">Same journey. A kinder way.</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-accent px-2.5 py-1 rounded-full bg-brand-900/80 border border-accent/30">
                    24/7 Saku Celana
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Differentiator Section: Nina vs ChatGPT / Chatbot Lain ─── */}
      <section id="differentiation" className="py-24 px-4 sm:px-6 lg:px-8 bg-surface border-y border-surface-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-2">
              Bukan Sekadar AI Biasa
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-text-primary">
              Kenapa Nina Berbeda Jauh dari Sekadar ChatGPT atau Chatbot Lain?
            </h2>
            <p className="mt-4 text-text-secondary text-base sm:text-lg">
              Sebagian besar orang berhenti berolahraga bukan karena kekurangan teori, melainkan karena tidak ada yang mendampingi dan mengingatkan di dunia nyata.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* Box 1: ChatGPT / Generic Bot */}
            <div className="p-8 rounded-3xl bg-surface-muted border border-surface-border flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                  <X className="w-4 h-4 text-red-500" />
                  <span>ChatGPT & Chatbot Generik</span>
                </div>
                <h3 className="font-serif text-2xl font-bold text-text-primary mb-4">
                  Kotak Teks Pasif di Tab Browser
                </h3>
                <ul className="space-y-4 text-sm text-text-secondary">
                  <li className="flex items-start gap-3">
                    <span className="text-red-500 font-bold">✕</span>
                    <span><strong>100% Pasif:</strong> Tidak pernah menghubungimu duluan. Jika kamu lupa atau malas, dia ikut diam berbulan-bulan.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-500 font-bold">✕</span>
                    <span><strong>Amnesia Sesi:</strong> Begitu percakapan baru dibuka, dia lupa berat badanmu, riwayat cedera lututmu, dan jadwal kerjamu.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-500 font-bold">✕</span>
                    <span><strong>Bahasa Ensiklopedia:</strong> Menjawab dengan artikel panjang 10 paragraf yang kaku dan tidak membumi.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-500 font-bold">✕</span>
                    <span><strong>Terpisah dari Keseharian:</strong> Harus sengaja membuka website atau login ke aplikasi terpisah.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-surface-border text-xs text-text-muted italic">
                Alat bantu riset yang baik, tetapi bukan teman bertumbuh.
              </div>
            </div>

            {/* Box 2: Nina Companion */}
            <div className="p-8 rounded-3xl bg-brand-950 text-white relative overflow-hidden shadow-2xl border-2 border-accent">
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent mb-4">
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span>Nina · AI Companion Thrivin</span>
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-white mb-4">
                    Pendamping Aktif di Saku Celanamu
                  </h3>
                  <ul className="space-y-4 text-sm text-brand-100">
                    <li className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span><strong>Bisa Baca Foto & Strava:</strong> Cukup kirim foto piring warteg atau screenshot lari Strava di WA — Nina langsung baca data dan nutrisinya!</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span><strong>Reach Out Duluan (Proaktif):</strong> Menyapa ringan di pagi hari, mengecek jam workout sore, dan mengingatkan tidur di malam hari.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span><strong>Memori Personal Hidup:</strong> Ingat cedera lama, jadwal lembur hari Rabu, makanan favoritmu, dan rekor angkatan terakhirmu.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span><strong>Bahasa Hangat & Empatik:</strong> Berbicara layaknya manusia asli, santai tanpa penghakiman saat kamu gagal konsisten.</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-6 mt-6 border-t border-brand-800/80 text-xs text-accent font-semibold">
                  Hadir di WhatsApp yang kamu buka setiap hari — tanpa instal aplikasi baru.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Visual Feature Deep-Dive: Foto Makanan & Strava ─── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-muted">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-2">
              Vision & Data Intelligence
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-text-primary">
              Tinggal Jepret Foto. Nina yang Urus Angkanya.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Feature 1: Foto Makanan */}
            <div className="bg-white p-8 rounded-3xl border border-surface-border shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-800 mb-6">
                <Camera className="w-6 h-6 text-brand-800" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-text-primary mb-3">
                1. Foto Makanan Lokal & Estimasi Nutrisi
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed mb-6">
                Tidak perlu menimbang makanan dengan timbangan gram setiap mau makan. Kirim foto piring makanmu — nasi padang, warteg, bekal kantor, atau salad kafe.
              </p>
              <div className="bg-surface-muted p-4 rounded-2xl text-xs space-y-2 border border-surface-border">
                <p className="font-semibold text-brand-900">📲 Kamu kirim foto piring ayam bakar & tempe:</p>
                <p className="text-text-secondary italic bg-white p-3 rounded-xl border border-brand-100">
                  &ldquo;Ayam bakar (~120g) + 2 potong tempe = sekitar ~38g protein. Porsi nasinya pas untuk kebutuhan energi sore ini. Mantap, protein harianmu sisa 40g lagi ya!&rdquo;
                </p>
              </div>
            </div>

            {/* Feature 2: Screenshot Strava & Jam Pintar */}
            <div className="bg-white p-8 rounded-3xl border border-surface-border shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-800 mb-6">
                <Activity className="w-6 h-6 text-brand-800" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-text-primary mb-3">
                2. Baca Screenshot Strava & Smartwatch
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed mb-6">
                Selesai jogging atau treadmill? Kirim screenshot hasil Strava, Garmin, atau Apple Watch-mu ke WhatsApp. Nina membaca pace, detak jantung, dan evaluasi pemulihan.
              </p>
              <div className="bg-surface-muted p-4 rounded-2xl text-xs space-y-2 border border-surface-border">
                <p className="font-semibold text-brand-900">📲 Kamu kirim screenshot lari 5 km:</p>
                <p className="text-text-secondary italic bg-white p-3 rounded-xl border border-brand-100">
                  &ldquo;Lari 5.2 km di pace 6:15 dengan HR rata-rata 142 bpm (Zone 2). Aerobic base-mu makin stabil! Besok jadwal istirahat aktif ya, jangan lupa minum 2.5 liter air.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Comparison: Nina vs Personal Trainer Konvensional ─── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface border-y border-surface-border">
        <div className="max-w-4xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-2">
              Perbandingan Nilai Nyata
            </span>
            <h2 className="font-serif text-3xl font-bold text-text-primary">
              Nina vs Personal Trainer Konvensional
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Nina bukan pengganti total PT gym, namun untuk pendampingan harian yang konsisten di dunia nyata, Nina adalah solusi paling efisien.
            </p>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-surface-border shadow-xs bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted border-b border-surface-border text-text-primary font-semibold">
                <tr>
                  <th className="p-4 sm:p-5">Aspek</th>
                  <th className="p-4 sm:p-5 bg-brand-50/50 text-brand-900 font-bold">
                    Nina (AI Companion)
                  </th>
                  <th className="p-4 sm:p-5 text-text-muted">Personal Trainer Gym</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border text-text-secondary">
                <tr>
                  <td className="p-4 sm:p-5 font-medium text-text-primary">Ketersediaan</td>
                  <td className="p-4 sm:p-5 bg-brand-50/30 text-brand-900 font-semibold">
                    24/7 di WhatsApp saku celana
                  </td>
                  <td className="p-4 sm:p-5">Hanya 1 jam saat sesi gym</td>
                </tr>
                <tr>
                  <td className="p-4 sm:p-5 font-medium text-text-primary">Cek Makanan & Data</td>
                  <td className="p-4 sm:p-5 bg-brand-50/30 text-brand-900 font-semibold">
                    Langsung baca foto piring & screenshot Strava
                  </td>
                  <td className="p-4 sm:p-5">Jarang sempat memantau tiap makan</td>
                </tr>
                <tr>
                  <td className="p-4 sm:p-5 font-medium text-text-primary">Inisiatif Reminder</td>
                  <td className="p-4 sm:p-5 bg-brand-50/30 text-brand-900 font-semibold">
                    Proaktif reach out di jam-jam genting
                  </td>
                  <td className="p-4 sm:p-5">Hanya chat konfirmasi kehadiran</td>
                </tr>
                <tr>
                  <td className="p-4 sm:p-5 font-medium text-text-primary">Biaya Bulanan</td>
                  <td className="p-4 sm:p-5 bg-brand-50/30 text-accent-dark font-black text-base">
                    Mulai Rp 79.000 / bulan
                  </td>
                  <td className="p-4 sm:p-5">Rp 2.000.000 – Rp 4.000.000 / bulan</td>
                </tr>
                <tr>
                  <td className="p-4 sm:p-5 font-medium text-text-primary">Tekanan Mental</td>
                  <td className="p-4 sm:p-5 bg-brand-50/30 text-brand-900 font-semibold">
                    Empatik, tidak menghakimi saat kamu lelah
                  </td>
                  <td className="p-4 sm:p-5">Sering menimbulkan rasa segan/bersalah</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ─── */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-surface-muted relative">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-2">
              Investasi Pertumbuhanmu
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-text-primary">
              Pilih Paket Pendampingan Nina
            </h2>
            <p className="mt-4 text-text-secondary text-base">
              Pengetahuan di website gratis untuk semua orang. Pendampingan personal di WhatsApp adalah akseleratornya.
            </p>

            {/* Billing Toggle */}
            <div className="mt-8 inline-flex items-center p-1 rounded-full bg-white border border-surface-border shadow-xs">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                  billingCycle === "monthly"
                    ? "bg-brand-900 text-white shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className={billingCycle === "monthly" ? "text-white" : ""}>Bulanan</span>
              </button>
              <button
                onClick={() => setBillingCycle("quarterly")}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                  billingCycle === "quarterly"
                    ? "bg-brand-900 text-white shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className={billingCycle === "quarterly" ? "text-white" : ""}>3 Bulan (Rekomendasi)</span>
                <span className="px-1.5 py-0.5 rounded-full bg-accent text-[#041622] text-[10px] font-black">
                  HEMAT 20%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Card 1: Bulanan */}
            <div className="p-8 sm:p-10 rounded-3xl bg-white border border-surface-border shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-2xl font-bold text-text-primary">
                    Paket Bulanan
                  </h3>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-surface-muted text-text-muted">
                    Fleksibel
                  </span>
                </div>
                <p className="text-xs text-text-secondary mb-6">
                  Cocok untuk mencoba adaptasi sistem bersama Nina tanpa komitmen panjang.
                </p>

                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-4xl sm:text-5xl font-black text-brand-900">
                    Rp 99.000
                  </span>
                  <span className="text-text-muted text-sm">/ bulan</span>
                </div>

                <ul className="space-y-3.5 text-sm text-text-secondary mb-8">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Akses WhatsApp penuh ke Nina 24/7</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Bisa kirim foto makanan & screenshot Strava</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Check-in proaktif & pengingat konsistensi harian</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Rekomendasi split latihan mingguan personal</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Batal kapan saja tanpa penalti</span>
                  </li>
                </ul>
              </div>

              <a
                href={CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm transition-all shadow-sm"
              >
                <MessageCircle className="w-4 h-4 text-accent" />
                <span className="text-white">Pilih Paket Bulanan</span>
              </a>
            </div>

            {/* Card 2: 3 Bulan (Featured) */}
            <div className="p-8 sm:p-10 rounded-3xl bg-brand-950 text-white border-2 border-accent shadow-2xl relative flex flex-col justify-between">
              <div className="absolute -top-3.5 right-8 px-4 py-1 rounded-full bg-accent text-[#041622] text-xs font-black tracking-wide uppercase shadow-md">
                Paling Direkomendasikan
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-2xl font-bold text-white">
                    Paket 3 Bulan (Siklus Penuh)
                  </h3>
                </div>
                <p className="text-xs text-brand-100 mb-6">
                  Sesuai Bab 3: tubuh butuh 8–12 minggu pada sistem yang sama untuk membangun adaptasi nyata.
                </p>

                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-4xl sm:text-5xl font-black text-white">
                    Rp 239.000
                  </span>
                  <span className="text-brand-200 text-sm">/ 3 bulan (~Rp 79rb/bln)</span>
                </div>

                <ul className="space-y-3.5 text-sm text-brand-100 mb-8">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-white font-medium">Semua fitur Paket Bulanan</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Membaca foto makanan & Strava tanpa batas</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Audit berkala siklus Plateau & Deload mingguan</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Memori jangka panjang untuk progres 12 minggu penuh</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-accent shrink-0" />
                    <span>Garansi kepuasan 7 hari pertama</span>
                  </li>
                </ul>
              </div>

              <a
                href={CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-full bg-brand-900 hover:bg-brand-800 border-2 border-accent text-white font-bold text-sm transition-all shadow-glow hover:-translate-y-0.5"
              >
                <MessageCircle className="w-4 h-4 text-accent" />
                <span className="text-white font-bold">Mulai Siklus 3 Bulan Sekarang</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface border-t border-surface-border">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-2">
              Pertanyaan yang Sering Diajukan
            </span>
            <h2 className="font-serif text-3xl font-bold text-text-primary">
              FAQ tentang Nina
            </h2>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-surface-border bg-white overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-serif text-base sm:text-lg font-bold text-text-primary hover:text-brand-900 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <span className="p-1 text-text-muted shrink-0 font-mono text-xl">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-sm text-text-secondary leading-relaxed border-t border-surface-border/50 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-brand-950 text-white text-center relative overflow-hidden">
        <div className="max-w-3xl mx-auto relative z-10">
          <span className="text-accent text-3xl mb-4 block">✳</span>
          <h2 className="font-serif text-3xl sm:text-5xl font-bold leading-tight mb-4">
            Tidak ada yang perlu bertumbuh sendirian lagi.
          </h2>
          <p className="text-brand-100 text-base sm:text-lg max-w-xl mx-auto mb-8">
            Hubungkan WhatsApp-mu dengan Nina hari ini. Mulai dari satu percakapan sederhana dan biarkan sistem bekerja untukmu.
          </p>
          <a
            href={CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2.5 px-10 py-5 rounded-full bg-brand-900 hover:bg-brand-800 border-2 border-accent text-white font-bold text-base shadow-glow hover:-translate-y-0.5 transition-all"
          >
            <MessageCircle className="w-5 h-5 text-accent" />
            <span className="text-white font-bold">Mulai Bersama Nina di WhatsApp</span>
          </a>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-surface-border py-8 text-center text-xs text-text-muted bg-surface">
        <p>© 2026 Thrivin. Never Grow Alone.</p>
      </footer>
    </div>
  );
}
