"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Lock,
  MessageCircle,
  Camera,
  CheckCircle2,
  X,
  BookOpen
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

// Clean vector silhouette for locked companions
const SilhouetteIcon = ({ className = "w-24 h-24" }: { className?: string }) => (
  <svg
    viewBox="0 0 100 120"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="50" cy="38" r="20" />
    <path d="M16 112 C16 80, 28 68, 50 68 C72 68, 84 80, 84 112 Z" />
  </svg>
);

interface LockedModalInfo {
  title: string;
  category: string;
  desc: string;
}

export default function Home() {
  const [lockedModal, setLockedModal] = useState<LockedModalInfo | null>(null);

  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col selection:bg-brand-100 selection:text-brand-900">
      <Navbar />

      {/* ─── Hero Section (Direct, Punchy, Value-Focused) ─── */}
      <section className="pt-28 pb-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full text-center">
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

        {/* ─── Link to Learn More About Thrivin ─── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25 }}
          className="mt-8 flex justify-center"
        >
          <Link
            href="/about"
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-brand-50 hover:bg-brand-100 border border-brand-200/90 text-xs sm:text-sm font-bold text-brand-950 transition-all shadow-2xs hover:shadow-sm group cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-accent-dark" />
            <span>Ingin tahu bagaimana sistem pendampingan Thrivin bekerja?</span>
            <span className="text-accent-dark font-extrabold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Pelajari Thrivin Lebih Jauh &rarr;
            </span>
          </Link>
        </motion.div>
      </section>

      {/* ─── 3 Character Portrait Cards (Game Select Style) ─── */}
      <section id="companions" className="py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        <div className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2 font-mono">
            Character Selection
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
            Pilih AI Companion Sesuai Targetmu
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary mt-1.5 max-w-lg mx-auto">
            Klik kartu companion untuk melihat detail dan memulai pendampingan harianmu di WhatsApp.
          </p>
        </div>

        {/* Grid of 3 Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          {/* ─── CARD 1: NINA (ACTIVE & AVAILABLE) — FULL CARD CLICKABLE ─── */}
          <Link
            href="/companion/nina"
            className="group rounded-[2.2rem] bg-brand-950 text-white p-5 sm:p-6 border-2 border-accent shadow-2xl relative flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-glow focus:outline-none focus:ring-4 focus:ring-accent/30"
          >
            {/* Active Status Badge */}
            <div className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-[11px] font-black text-accent tracking-wider uppercase font-mono shadow-xs">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span>TERSEDIA</span>
            </div>

            <div>
              {/* Character Portrait */}
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
                    Wellness & Fitness Companion
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-white flex items-center gap-1.5">
                    <span>Nina</span>
                    <span className="text-sm font-sans font-normal opacity-80">· 24/7 WA</span>
                  </h3>
                </div>
              </div>

              {/* Bio & Pitch */}
              <p className="text-xs text-brand-100/90 leading-relaxed mb-4">
                Teman akuntabilitas harian untuk diet, gym, dan lari. Baca foto makanan untuk hitung kalori & protein, evaluasi record data Strava, dan reach out duluan di WhatsApp.
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
                <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[10px] font-medium">
                  📸 Foto Makanan
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[10px] font-medium">
                  🏃 Record Data Strava
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[10px] font-medium">
                  💬 Reminder Santai
                </span>
              </div>
            </div>

            {/* Direct CTA Button (High Contrast Guaranteed) */}
            <div className="w-full py-3.5 rounded-full bg-accent text-brand-950 group-hover:bg-white group-hover:text-brand-950 font-black text-xs sm:text-sm text-center transition-all shadow-glow flex items-center justify-center gap-2">
              <span>Pilih Nina & Mulai</span>
              <ArrowRight className="w-4 h-4 text-brand-950 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* ─── CARD 2: MINDSET, HABIT & READING (SILUET ORANG, ABU-ABU HOVER, FULL CLICKABLE) ─── */}
          <div
            onClick={() =>
              setLockedModal({
                category: "Mindset, Habit & Reading",
                title: "AI Mindset, Habit & Reading Companion",
                desc: "Pendamping refleksi harian, journaling kilat via WhatsApp, reading companion untuk buku self-development & rangkuman esensial, serta pembongkar mental block untuk membangun konsistensi yang tahan lama.",
              })
            }
            className="group rounded-[2.2rem] bg-slate-900 text-slate-200 p-5 sm:p-6 border-2 border-slate-800 hover:border-slate-600 hover:bg-slate-850 hover:scale-[1.02] shadow-lg hover:shadow-2xl relative flex flex-col justify-between cursor-pointer transition-all duration-300"
          >
            <div className="absolute top-4 right-4 z-20 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 tracking-wider uppercase font-mono shadow-xs">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>COMING SOON</span>
            </div>

            <div>
              {/* Silhouette Portrait */}
              <div className="relative w-full aspect-4/5 rounded-2xl overflow-hidden mb-5 bg-gradient-to-b from-slate-800 to-slate-950 flex flex-col items-center justify-center border border-white/5 group-hover:border-slate-700 transition-colors">
                <SilhouetteIcon className="w-32 h-32 text-slate-700 group-hover:text-slate-600 transition-colors duration-300" />
                <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-transparent to-transparent opacity-70" />
                <div className="absolute bottom-3 left-3 right-3 text-left">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                    Companion 02
                  </span>
                  <h3 className="font-serif text-xl font-bold text-white">
                    Mindset, Habit & Reading
                  </h3>
                </div>
              </div>

              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">
                Daily Journaling & Reading Companion
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Pendamping refleksi harian, journaling kilat via WhatsApp, reading companion untuk buku self-development, serta pembongkar mental block untuk membangun konsistensi diri.
              </p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-medium">
                  #DailyJournal
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-medium">
                  #HabitStacking
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-medium">
                  #ReadingCompanion
                </span>
              </div>
            </div>

            {/* Action Button (High Contrast Guaranteed) */}
            <div className="w-full py-3.5 rounded-full bg-slate-800 group-hover:bg-slate-700 text-slate-200 group-hover:text-white font-bold text-xs sm:text-sm text-center transition-colors flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Segera Hadir · Klik Info</span>
            </div>
          </div>

          {/* ─── CARD 3: PARENTING & FAMILY (SILUET ORANG, ABU-ABU HOVER, FULL CLICKABLE) ─── */}
          <div
            onClick={() =>
              setLockedModal({
                category: "Parenting & Family Care",
                title: "AI Parenting & Family Companion",
                desc: "Teman diskusi tenang untuk orang tua. Solusi tantrum berbasis sains, ide stimulasi anak, dan dukungan emosional ayah-ibu saat lelah.",
              })
            }
            className="group rounded-[2.2rem] bg-slate-900 text-slate-200 p-5 sm:p-6 border-2 border-slate-800 hover:border-slate-600 hover:bg-slate-850 hover:scale-[1.02] shadow-lg hover:shadow-2xl relative flex flex-col justify-between cursor-pointer transition-all duration-300"
          >
            <div className="absolute top-4 right-4 z-20 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 tracking-wider uppercase font-mono shadow-xs">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>COMING SOON</span>
            </div>

            <div>
              {/* Silhouette Portrait */}
              <div className="relative w-full aspect-4/5 rounded-2xl overflow-hidden mb-5 bg-gradient-to-b from-slate-800 to-slate-950 flex flex-col items-center justify-center border border-white/5 group-hover:border-slate-700 transition-colors">
                <SilhouetteIcon className="w-32 h-32 text-slate-700 group-hover:text-slate-600 transition-colors duration-300" />
                <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-transparent to-transparent opacity-70" />
                <div className="absolute bottom-3 left-3 right-3 text-left">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                    Companion 03
                  </span>
                  <h3 className="font-serif text-xl font-bold text-white">
                    Parenting & Family
                  </h3>
                </div>
              </div>

              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">
                Parenting Sains & Emosional
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Teman diskusi tenang untuk orang tua. Solusi tantrum berbasis sains, ide stimulasi anak, dan dukungan emosional ayah-ibu saat lelah.
              </p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-medium">
                  #ParentingSains
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-medium">
                  #TantrumSolution
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-medium">
                  #FamilyCalm
                </span>
              </div>
            </div>

            {/* Action Button (High Contrast Guaranteed) */}
            <div className="w-full py-3.5 rounded-full bg-slate-800 group-hover:bg-slate-700 text-slate-200 group-hover:text-white font-bold text-xs sm:text-sm text-center transition-colors flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Segera Hadir · Klik Info</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Interactive Modal for Locked Companions ─── */}
      <AnimatePresence>
        {lockedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-surface-border text-left relative"
            >
              <button
                onClick={() => setLockedModal(null)}
                className="absolute top-4 right-4 p-2 text-text-muted hover:text-brand-950 transition-colors rounded-full hover:bg-surface-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-700">
                  {lockedModal.category} · Segera Hadir
                </span>
              </div>

              <h3 className="font-serif text-2xl font-bold text-brand-950 mb-2">
                {lockedModal.title}
              </h3>

              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mb-6">
                {lockedModal.desc}
                <br /><br />
                Saat ini tim sains Thrivin sedang mematangkan kurikulum dan persona bot untuk companion ini. Kamu bisa mencoba <strong>Nina (Wellness & Fitness)</strong> yang sudah aktif mendampingi pengguna di WhatsApp hari ini.
              </p>

              <div className="flex flex-col gap-2.5">
                <Link
                  href="/companion/nina"
                  onClick={() => setLockedModal(null)}
                  className="w-full py-3.5 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs sm:text-sm text-center transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-accent" />
                  <span>Pilih Nina (Wellness & Fitness)</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <button
                  type="button"
                  onClick={() => setLockedModal(null)}
                  className="w-full py-2.5 rounded-full text-xs font-semibold text-text-secondary hover:text-brand-950 transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                Kirim Foto & Record Data Strava
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
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-accent text-brand-950 font-black text-sm hover:bg-white hover:text-brand-950 transition-all shadow-glow hover:scale-105 cursor-pointer"
              >
                <span>Mulai Bersama Nina Sekarang</span>
                <ArrowRight className="w-4 h-4 text-brand-950" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
