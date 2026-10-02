"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Lock,
  MessageCircle,
  Camera,
  Activity,
  Flame,
  CheckCircle2,
  HeartHandshake,
  Check
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col selection:bg-brand-100 selection:text-brand-900">
      <Navbar />

      {/* ─── Hero Section (Direct, Punchy, Value-Focused) ─── */}
      <section className="pt-28 pb-14 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full text-center">
        {/* Top Direct Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200/90 text-xs font-bold text-accent-dark uppercase tracking-wider mb-5 shadow-2xs font-mono"
        >
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span>AI Companion Platform · Langsung di WhatsApp</span>
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-brand-950 max-w-4xl mx-auto leading-[1.12]"
        >
          Pilih AI Companion Pribadimu. Bertumbuh Nyata, 24/7 di WhatsApp.
        </motion.h1>

        {/* Direct Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="mt-5 text-base sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed"
        >
          Bukan sekadar bot tanya-jawab yang dingin. Partner akuntabilitas proaktif yang menyapa duluan, mengingat perjalananmu, dan mendampingi targetmu setiap hari tanpa instal aplikasi baru.
        </motion.p>

        {/* Value Strip */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm font-semibold text-brand-900"
        >
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-accent-dark" />
            <span>100% di WhatsApp</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Garansi 3 Hari Uang Kembali</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-accent-dark" />
            <span>Sekali Bayar (Tanpa Langganan Otomatis)</span>
          </div>
        </motion.div>

        {/* Short Selling Quote */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="mt-8 max-w-xl mx-auto p-4 rounded-2xl bg-surface-muted border border-surface-border text-xs sm:text-sm italic font-serif text-text-secondary"
        >
          &ldquo;Pertumbuhan yang paling sering gagal bukan karena rencananya buruk. Tapi karena dijalani dalam ruang kosong — tanpa siapa pun yang tahu apa yang sedang kamu perjuangkan.&rdquo;
        </motion.div>
      </section>

      {/* ─── 4 Character Portrait Cards (Game Select Style) ─── */}
      <section id="companions" className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2 font-mono">
            Character Selection
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
            Pilih AI Companion Sesuai Targetmu
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary mt-1.5 max-w-lg mx-auto">
            Setiap companion dibekali kurikulum sains spesifik dan persona khusus untuk mendampingimu sampai hasil nyata.
          </p>
        </div>

        {/* Grid of 4 Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {/* Card 1: NINA (ACTIVE & AVAILABLE) */}
          <motion.div
            whileHover={{ y: -6 }}
            transition={{ duration: 0.2 }}
            className="rounded-[2.2rem] bg-brand-950 text-white p-5 sm:p-6 border-2 border-accent shadow-2xl relative flex flex-col justify-between overflow-hidden group"
          >
            {/* Active Status Badge */}
            <div className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-[11px] font-black text-accent tracking-wider uppercase font-mono shadow-xs">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span>TERSEDIA</span>
            </div>

            {/* Character Portrait */}
            <div>
              <div className="relative w-full aspect-4/5 rounded-2xl overflow-hidden mb-5 border border-white/15 bg-brand-900 shadow-md">
                <Image
                  src="/nina-pp.webp"
                  alt="Nina AI Wellness Companion"
                  fill
                  className="object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  priority
                />
                <div className="absolute inset-0 bg-linear-to-t from-brand-950 via-transparent to-transparent opacity-60" />
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-accent font-mono">
                    Pilar Wellness & Fitness
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-white flex items-center gap-1.5">
                    <span>Nina</span>
                    <span className="text-sm font-sans font-normal opacity-80">· 24/7 WA</span>
                  </h3>
                </div>
              </div>

              {/* Bio & Pitch */}
              <p className="text-xs text-brand-100/90 leading-relaxed mb-4">
                Teman akuntabilitas harian untuk diet, gym, dan lari. Baca foto makanan, evaluasi Strava, kurasi video form gerakan YouTube, dan reach out duluan di WhatsApp.
              </p>

              {/* Capabilities Strengths */}
              <div className="space-y-1.5 mb-4 text-[11px] font-mono text-brand-200">
                <div className="flex justify-between">
                  <span>Nutrisi & Foto Makanan</span>
                  <span className="text-accent font-bold">100%</span>
                </div>
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-accent h-full w-full rounded-full" />
                </div>
                <div className="flex justify-between pt-1">
                  <span>Akuntabilitas WhatsApp</span>
                  <span className="text-accent font-bold">99%</span>
                </div>
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-accent h-full w-[99%] rounded-full" />
                </div>
              </div>

              {/* Selling Tags */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white text-[10px] font-medium">
                  📸 Foto Makanan
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white text-[10px] font-medium">
                  🏃 Strava Sync
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white text-[10px] font-medium">
                  📺 YouTube Form
                </span>
              </div>
            </div>

            {/* CTA Button */}
            <Link
              href="/companion/nina"
              className="w-full py-3.5 rounded-full bg-accent hover:bg-white text-brand-950 font-black text-xs sm:text-sm text-center transition-all shadow-glow hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Pilih Nina & Mulai</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          {/* Card 2: KAI (LOCKED / COMING SOON) */}
          <div className="rounded-[2.2rem] bg-slate-100 text-slate-800 p-5 sm:p-6 border-2 border-dashed border-slate-300 relative flex flex-col justify-between opacity-75 hover:opacity-90 transition-opacity">
            <div className="absolute top-4 right-4 z-20 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 tracking-wider uppercase font-mono">
              <Lock className="w-3 h-3" />
              <span>COMING SOON</span>
            </div>

            <div>
              <div className="relative w-full aspect-4/5 rounded-2xl overflow-hidden mb-5 bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center grayscale">
                <div className="text-center p-4">
                  <div className="w-14 h-14 rounded-full bg-slate-400/40 text-slate-700 flex items-center justify-center mx-auto mb-2 font-serif text-2xl font-bold">
                    K
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-600 uppercase tracking-wider block">
                    Pilar Mindset
                  </span>
                  <h3 className="font-serif text-2xl font-bold text-slate-800">
                    Kai
                  </h3>
                </div>
              </div>

              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 font-mono">
                Mindset & Habit Tracker
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Pendamping refleksi harian, journaling kilat via WhatsApp, dan pemecah mental block untuk membangun disiplin yang tidak mudah patah.
              </p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #DailyJournal
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #HabitStacking
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #MentalClarity
                </span>
              </div>
            </div>

            <button
              disabled
              className="w-full py-3.5 rounded-full bg-slate-200 text-slate-400 font-bold text-xs sm:text-sm text-center cursor-not-allowed"
            >
              Segera Hadir
            </button>
          </div>

          {/* Card 3: MAYA (LOCKED / COMING SOON) */}
          <div className="rounded-[2.2rem] bg-slate-100 text-slate-800 p-5 sm:p-6 border-2 border-dashed border-slate-300 relative flex flex-col justify-between opacity-75 hover:opacity-90 transition-opacity">
            <div className="absolute top-4 right-4 z-20 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 tracking-wider uppercase font-mono">
              <Lock className="w-3 h-3" />
              <span>COMING SOON</span>
            </div>

            <div>
              <div className="relative w-full aspect-4/5 rounded-2xl overflow-hidden mb-5 bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center grayscale">
                <div className="text-center p-4">
                  <div className="w-14 h-14 rounded-full bg-slate-400/40 text-slate-700 flex items-center justify-center mx-auto mb-2 font-serif text-2xl font-bold">
                    M
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-600 uppercase tracking-wider block">
                    Pilar Parenting
                  </span>
                  <h3 className="font-serif text-2xl font-bold text-slate-800">
                    Maya
                  </h3>
                </div>
              </div>

              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 font-mono">
                Parenting & Family Care
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Teman diskusi tenang untuk orang tua. Solusi tantrum berbasis sains, ide stimulasi anak, dan dukungan emosional ayah-ibu saat lelah.
              </p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #ParentingSains
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #TantrumSolution
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #FamilyCalm
                </span>
              </div>
            </div>

            <button
              disabled
              className="w-full py-3.5 rounded-full bg-slate-200 text-slate-400 font-bold text-xs sm:text-sm text-center cursor-not-allowed"
            >
              Segera Hadir
            </button>
          </div>

          {/* Card 4: LEO (LOCKED / COMING SOON) */}
          <div className="rounded-[2.2rem] bg-slate-100 text-slate-800 p-5 sm:p-6 border-2 border-dashed border-slate-300 relative flex flex-col justify-between opacity-75 hover:opacity-90 transition-opacity">
            <div className="absolute top-4 right-4 z-20 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 tracking-wider uppercase font-mono">
              <Lock className="w-3 h-3" />
              <span>COMING SOON</span>
            </div>

            <div>
              <div className="relative w-full aspect-4/5 rounded-2xl overflow-hidden mb-5 bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center grayscale">
                <div className="text-center p-4">
                  <div className="w-14 h-14 rounded-full bg-slate-400/40 text-slate-700 flex items-center justify-center mx-auto mb-2 font-serif text-2xl font-bold">
                    L
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-600 uppercase tracking-wider block">
                    Pilar Karir & Skill
                  </span>
                  <h3 className="font-serif text-2xl font-bold text-slate-800">
                    Leo
                  </h3>
                </div>
              </div>

              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 font-mono">
                Career & Communication
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Partner simulasi interview kerja, bedah draft presentasi, dan akselerasi skill komunikasi profesional to-the-point di WhatsApp.
              </p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #MockInterview
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #WritingPolish
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-medium">
                  #CareerGrowth
                </span>
              </div>
            </div>

            <button
              disabled
              className="w-full py-3.5 rounded-full bg-slate-200 text-slate-400 font-bold text-xs sm:text-sm text-center cursor-not-allowed"
            >
              Segera Hadir
            </button>
          </div>
        </div>
      </section>

      {/* ─── Why It Converts: Selling Features Section ─── */}
      <section className="py-14 bg-surface-muted border-y border-surface-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2 font-mono">
              Kenapa Thrivin AI Companion Berbeda?
            </span>
            <h2 className="font-serif text-2xl sm:text-4xl font-bold text-brand-950">
              Dibangun untuk Hasil Nyata, Bukan Sekadar Basa-Basi
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-6 rounded-3xl bg-white border border-surface-border shadow-2xs">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-accent-dark mb-4">
                <Smartphone className="w-5 h-5 text-accent-dark" />
              </div>
              <h3 className="font-bold text-base text-brand-950 mb-1.5">
                100% di WhatsApp
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Tidak ada login aplikasi baru yang membingungkan atau dilupakan. Chatting santai layaknya kontak teman akrab.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-surface-border shadow-2xs">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-accent-dark mb-4">
                <MessageCircle className="w-5 h-5 text-accent-dark" />
              </div>
              <h3 className="font-bold text-base text-brand-950 mb-1.5">
                Reach Out Duluan
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Companion menyapa dan menagih janjimu di jam kritis (pagi & sore), saat kemauanmu sedang diuji rasa malas.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-surface-border shadow-2xs">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-accent-dark mb-4">
                <Camera className="w-5 h-5 text-accent-dark" />
              </div>
              <h3 className="font-bold text-base text-brand-950 mb-1.5">
                Kirim Foto & Strava
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Tinggal jepret piring makan untuk hitung kalori atau kirim screenshot hasil lari untuk dianalisis pace dan detak jantungnya.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-surface-border shadow-2xs">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-accent-dark mb-4">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-base text-brand-950 mb-1.5">
                Garansi Uang Kembali
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Garansi 3 hari uang kembali 100% jika kamu merasa pendampingan AI companion tidak cocok dengan ritmemu.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Social Proof & Science Stat ─── */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full text-center">
        <div className="p-8 sm:p-10 rounded-3xl bg-brand-50 border border-brand-200/90 shadow-xs">
          <div className="text-4xl sm:text-5xl font-black text-brand-900 font-mono mb-2">
            76% vs 43%
          </div>
          <p className="font-serif text-lg sm:text-xl font-bold text-brand-950 mb-2">
            Peluang Keberhasilan Naik Hampir 2 Kali Lipat
          </p>
          <p className="text-xs sm:text-sm text-text-secondary max-w-xl mx-auto leading-relaxed">
            Riset Dr. Gail Matthews (Dominican University) pada 267 orang: mereka yang memiliki rekan akuntabilitas harian menyelesaikan 76% target mereka, dibanding hanya 43% yang berjuang sendirian.
          </p>
        </div>
      </section>

      {/* ─── Direct Pricing & Guarantee CTA ─── */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        <div className="rounded-[2.5rem] bg-brand-950 text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden text-center">
          <div className="absolute top-0 right-0 w-80 h-80 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent text-xs font-bold uppercase tracking-wider font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              Mulai Hari Ini
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold leading-tight">
              Investasi Terbaik untuk Konsistensi Hidupmu.
            </h2>
            <p className="text-xs sm:text-sm text-brand-200 leading-relaxed">
              Mulai dari <strong>~Rp 77.000/bulan</strong> (Paket 3 Bulan Rp 231.000). Gunakan kode promo <span className="bg-accent/20 text-accent px-1.5 py-0.5 rounded font-mono font-bold">TEMANBARU</span> untuk diskon ekstra 20% khusus pengguna baru.
            </p>

            {/* Guarantee Box */}
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15 inline-flex items-center gap-2 text-xs text-white/90">
              <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
              <span>Garansi uang kembali dalam 3 hari apabila tidak puas dengan AI companion-mu.</span>
            </div>

            <div className="pt-2">
              <Link
                href="/companion/nina"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-accent text-brand-950 font-black text-sm hover:bg-white transition-all shadow-glow hover:scale-105 cursor-pointer"
              >
                <span>Mulai Bersama Nina Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
