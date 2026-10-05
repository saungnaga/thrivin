"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  BellRing,
  BrainCircuit,
  Smartphone,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Activity,
  BookOpen,
  CheckCircle2,
  Utensils
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";

const ROTATING_WORDS = [
  "menjaga konsistensimu",
  "mengingatkan jadwalmu",
  "menemani dietmu",
  "membaca piringmu",
  "mengevaluasi larimu",
];

// Reusable WhatsApp Mockup
const WAMockup = ({ children }: { children: React.ReactNode }) => (
  <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[360px] rounded-[2.5rem] bg-slate-100 ring-8 ring-brand-900 shadow-2xl overflow-hidden flex flex-col h-[500px]">
    {/* WA Header */}
    <div className="bg-[#075E54] px-4 py-3.5 flex items-center justify-between text-white z-10 shrink-0 shadow-md">
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-brand-900 border border-white/40 shrink-0">
          <Image
            src="/nina-pp.webp"
            alt="Nina"
            fill
            className="object-cover object-top"
          />
        </div>
        <div>
          <div className="font-semibold text-sm leading-tight text-white">Nina · Thrivin</div>
          <div className="text-[11px] text-white/80">Online · Personal Companion</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
      </div>
    </div>
    
    {/* Chat Area */}
    <div className="relative flex-1 bg-[#efeae2] p-4 flex flex-col gap-3 overflow-y-auto z-0 bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-blend-soft-light bg-center">
      <div className="absolute inset-0 bg-[#efeae2]/85 z-0 pointer-events-none" />
      <div className="relative z-10 flex flex-col gap-3 mt-auto">
        {children}
      </div>
    </div>

    {/* Input Area */}
    <div className="p-2.5 bg-[#f0f2f5] flex items-center gap-2 z-10 shrink-0 border-t border-slate-200">
      <div className="flex-1 bg-white rounded-full h-10 px-4 flex items-center text-gray-400 text-xs sm:text-sm shadow-xs">
        Ketik pesan...
      </div>
      <div className="w-10 h-10 rounded-full bg-[#00A884] flex items-center justify-center text-white shadow-xs shrink-0">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </div>
    </div>
  </div>
);

const BubbleNina = ({ children, time = "08:15" }: { children: React.ReactNode; time?: string }) => (
  <div className="bg-[#DCF8C6] rounded-2xl rounded-tl-none px-3.5 py-2.5 text-[13px] sm:text-[14px] text-gray-800 shadow-xs self-start max-w-[88%] relative z-10 leading-snug">
    <div>{children}</div>
    <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">
      {time}
    </span>
  </div>
);

const BubbleUser = ({ children, time = "08:14" }: { children: React.ReactNode; time?: string }) => (
  <div className="bg-white rounded-2xl rounded-tr-none px-3.5 py-2.5 text-[13px] sm:text-[14px] text-gray-800 shadow-xs self-end max-w-[88%] relative z-10 leading-snug">
    <div>{children}</div>
    <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">
      {time}
    </span>
  </div>
);

export default function NinaPage() {
  const { user } = useAuth();
  const hasNina = Boolean(user && user.activeCompanion === "nina");
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 1600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col selection:bg-brand-100 selection:text-brand-900 overflow-x-hidden">
      <Navbar />

      {/* ─── Hero Section: Direct & Selling Focus on Nina ─── */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Copywriting & Pitch */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            {/* Rule 5: Label Kecil / Badge: Inter Semibold uppercase */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-xs font-semibold text-accent-dark uppercase tracking-wider font-sans shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span>AI Wellness & Fitness Companion · WhatsApp</span>
            </div>

            {/* Rule 1: Hero Headline: Inter Bold/Extrabold */}
            <h1 className="font-sans text-2xl xs:text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-brand-950 leading-[1.25] sm:leading-[1.15]">
              Meet Nina. Teman akrab yang{" "}
              {/* ─── Flash Speed-Dash Effect (Same Color, No Underline, Ghost Echo Trails, Mobile-Safe) ─── */}
              <span className="inline-block max-w-full relative px-1 py-0.5 align-baseline">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={wordIndex}
                    initial={{ x: -28, opacity: 0, skewX: -14, filter: "blur(3px)" }}
                    animate={{
                      x: 0,
                      opacity: 1,
                      skewX: 0,
                      filter: "blur(0px)",
                      transition: {
                        type: "spring",
                        stiffness: 380,
                        damping: 24,
                        mass: 0.8,
                      },
                    }}
                    exit={{
                      x: 30,
                      opacity: 0,
                      skewX: 14,
                      filter: "blur(4px)",
                      transition: { duration: 0.18, ease: "easeIn" },
                    }}
                    className="relative inline-block text-accent font-sans font-extrabold whitespace-nowrap"
                  >
                    {/* Ghost Echo Trail 1 */}
                    <motion.span
                      initial={{ opacity: 0.7, x: -10 }}
                      animate={{ opacity: 0, x: -22 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="absolute inset-0 text-accent/60 blur-[1.5px] pointer-events-none select-none"
                      aria-hidden="true"
                    >
                      {ROTATING_WORDS[wordIndex]}
                    </motion.span>

                    {/* Ghost Echo Trail 2 */}
                    <motion.span
                      initial={{ opacity: 0.45, x: -18 }}
                      animate={{ opacity: 0, x: -40 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="absolute inset-0 text-accent-light/40 blur-[3px] pointer-events-none select-none"
                      aria-hidden="true"
                    >
                      {ROTATING_WORDS[wordIndex]}
                    </motion.span>

                    {/* Main Sharp Text */}
                    <span className="relative z-10 text-accent drop-shadow-[0_0_16px_rgba(56,174,200,0.5)]">
                      {ROTATING_WORDS[wordIndex]}
                    </span>
                  </motion.span>
                </AnimatePresence>
              </span>
              {", tiap hari."}
            </h1>

            {/* Rule 2: Sub-headline / Deskripsi: Inter Regular */}
            <p className="text-base sm:text-lg text-text-secondary max-w-xl mx-auto lg:mx-0 leading-relaxed font-sans font-normal">
              Foto piring makan lo, Nina hitungin kalori dan proteinnya. Screenshot lari Strava lo, Nina baca pace-nya. Dan kalau lo mulai kendor, dia yang duluan nanya kabar.
            </p>

            {/* CTAs with Guaranteed Clear White Font & Crisp Contrast (Rule 8: Inter Semibold) */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
              <Link
                href={hasNina ? "/dashboard" : "/companion/nina/onboarding/1"}
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#082132] hover:bg-[#041622] border-2 border-accent text-white font-sans font-semibold text-sm transition-all shadow-glow hover:scale-105 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="text-white font-semibold">
                  {hasNina ? "Buka Dashboard Nina" : "Mulai Onboarding Bersama Nina"}
                </span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </Link>

              <Link
                href="/companion/nina/learning"
                className="w-full sm:w-auto px-6 py-4 rounded-full bg-white hover:bg-slate-100 border border-slate-300 text-[#071F2D] font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-accent-dark" />
                <span className="text-[#071F2D] font-bold">Buka Learning Hub (100% Free)</span>
              </Link>
            </div>

            {/* Micro Trust Points */}
            <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs font-semibold text-text-secondary">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Garansi Uang Kembali 3 Hari</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-brand-900" />
                <span>Tanpa instal aplikasi baru</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-accent-dark" />
                <span>Setup 5 menit</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero WA Mockup */}
          <div className="lg:col-span-5 flex justify-center">
            <WAMockup>
              <BubbleUser time="12:15">
                <div className="relative w-full h-32 rounded-xl overflow-hidden mb-1.5 border border-brand-900/20 shadow-2xs">
                  <Image
                    src="/nasi-padang.webp"
                    alt="Nasi Padang"
                    fill
                    className="object-cover"
                  />
                </div>
                Makan siang Nasi Padang nih Nina! 🍛
              </BubbleUser>

              <BubbleNina time="12:16">
                Wah lauk ayam & telur! 😍 Estimasi nutrisinya:<br />
                • Ayam: ~25g protein<br />
                • Telur: ~7g protein<br />
                • Nasi & sayur: ~450 kkal<br />
                Total ~680 kkal, ~32g protein. Target protein harianmu sisa 40g lagi, nanti malam tambahkan tahu/tempe ya! 💪
              </BubbleNina>

              <BubbleUser time="12:18">
                Siap Nina! Praktis banget tinggal foto gini 🔥
              </BubbleUser>
            </WAMockup>
          </div>
        </div>
      </section>

      {/* ─── Nina's Core Superpowers Grid ─── */}
      <section className="py-16 bg-brand-950 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12">
            {/* Rule 5: Label Kecil / Badge: Inter Semibold uppercase */}
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent font-sans block mb-2">
              Superpowers
            </span>
            {/* Rule 7: Judul Section: Inter Bold */}
            <h2 className="font-sans text-3xl sm:text-4xl font-bold leading-tight">
              Kenapa Nina Bisa Bikin Kamu Konsisten?
            </h2>
            <p className="text-xs sm:text-sm text-brand-200 mt-2 max-w-lg mx-auto font-sans font-normal">
              Bukan sekadar asisten teks. Nina dibekali kapabilitas spesifik yang terintegrasi langsung dengan keseharianmu.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-accent/40 transition-colors space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </div>
              <h3 className="font-sans font-bold text-lg text-white">
                Baca Foto Makanan & Porsi
              </h3>
              {/* Rule 3: Body Text: Lora Regular */}
              <p className="text-xs sm:text-sm text-brand-100/80 leading-relaxed font-serif font-normal">
                Gak perlu pusing timbang gram. Cukup kirim foto piring di WhatsApp, Nina mengenali lauk lokal dan mengestimasi kalori serta proteinnya.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-accent/40 transition-colors space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="font-sans font-bold text-lg text-white">
                Record Data Strava & Smartwatch
              </h3>
              <p className="text-xs sm:text-sm text-brand-100/80 leading-relaxed font-serif font-normal">
                Kirim screenshot hasil lari atau aktivitas smartwatch. Nina baca pace, detak jantung, dan memberi saran pemulihan yang pas.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-accent/40 transition-colors space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
                <Utensils className="w-5 h-5" />
              </div>
              <h3 className="font-sans font-bold text-lg text-white">
                Rekomendasi Makronutrisi Personal
              </h3>
              <p className="text-xs sm:text-sm text-brand-100/80 leading-relaxed font-serif font-normal">
                Menyesuaikan target kalori harian (TDEE) dan target protein secara fleksibel tanpa membuatmu merasa tersiksa saat makan di luar.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-accent/40 transition-colors space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
                <BellRing className="w-5 h-5" />
              </div>
              <h3 className="font-sans font-bold text-lg text-white">
                Proaktif Reminder Santai Duluan
              </h3>
              <p className="text-xs sm:text-sm text-brand-100/80 leading-relaxed font-serif font-normal">
                Bukan bot pasif yang menunggu. Nina menyapa pagi dan sore hari di jam kritis saat rasa malas mulai menggoda.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-accent/40 transition-colors space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <h3 className="font-sans font-bold text-lg text-white">
                Memori Jangka Panjang
              </h3>
              <p className="text-xs sm:text-sm text-brand-100/80 leading-relaxed font-serif font-normal">
                Ingat cedera lutut lamamu, makanan favoritmu, dan jadwal lemburmu tanpa perlu kamu ulang ceritanya setiap hari.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-accent/40 transition-colors space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="font-sans font-bold text-lg text-white">
                100% Hidup di WhatsApp
              </h3>
              <p className="text-xs sm:text-sm text-brand-100/80 leading-relaxed font-serif font-normal">
                Bebas dari kerumitan unduh aplikasi baru yang memberatkan memori HP. Langsung aktif di aplikasi yang paling sering kamu buka.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Social Proof & Dominican University Research ─── */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full text-center">
        <div className="p-8 sm:p-10 rounded-3xl bg-brand-50 border border-brand-200 shadow-xs">
          {/* Rule 5: Label Kecil / Badge: Inter Semibold uppercase */}
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-dark font-sans block mb-2">
            The Science of Accountability
          </span>
          {/* Rule 7: Judul Section: Inter Bold */}
          <h2 className="font-sans text-2xl sm:text-3xl font-bold text-brand-950 mb-3">
            Bukan Niat yang Kurang. Kamu Hanya Butuh Rekan Akuntabilitas.
          </h2>
          {/* Rule 3: Body Text: Lora Regular */}
          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xl mx-auto mb-6 font-serif font-normal">
            Riset klinis Dr. Gail Matthews (Dominican University) pada 267 orang: mereka yang melaporkan progres harian ke companion menyelesaikan <strong className="font-sans font-extrabold text-brand-950">76% target</strong>, dibanding hanya <strong className="font-sans font-extrabold text-brand-950">43%</strong> yang berjuang sendirian.
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-brand-200 text-xs font-semibold text-brand-900 shadow-2xs font-sans">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Nina dirancang persis dengan protokol akuntabilitas sains ini.</span>
          </div>
        </div>
      </section>

      {/* ─── Direct Pricing Preview & Guarantee CTA ─── */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        <div className="rounded-[2.5rem] bg-brand-950 text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden text-center">
          <div className="absolute top-0 right-0 w-80 h-80 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            {/* Rule 5: Label Kecil / Badge: Inter Semibold uppercase */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent text-xs font-semibold uppercase tracking-wider font-sans">
              <Sparkles className="w-3.5 h-3.5" />
              Mulai Perjalananmu
            </span>
            {/* Rule 7: Judul Section: Inter Bold */}
            <h2 className="font-sans text-3xl sm:text-4xl font-bold leading-tight">
              Siap Bangun Kebiasaan Sehat Bersama Nina?
            </h2>
            {/* Rule 2 & 4: Sub-headline Inter Regular + Angka Inter Extrabold */}
            <p className="text-xs sm:text-sm text-brand-200 leading-relaxed font-sans font-normal">
              Mulai dari <strong className="font-sans font-extrabold text-white">Rp 39.000/bulan</strong>. Masukkan kode promo <span className="bg-accent/20 text-accent px-1.5 py-0.5 rounded font-sans font-bold">TEMANBARU</span> untuk diskon 20% khusus pengguna baru!
            </p>

            {/* Guarantee Box (Rule 3: Lora Regular) */}
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15 inline-flex items-center gap-2 text-xs text-white/90 font-serif font-normal">
              <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
              <span>Garansi uang kembali dalam 3 hari apabila tidak puas dengan AI companion-mu.</span>
            </div>

            {/* Bottom CTA with Guaranteed White Text Contrast on Deep Accent/Navy (Rule 8: Inter Semibold) */}
            <div className="pt-2">
              <Link
                href={hasNina ? "/dashboard" : "/companion/nina/onboarding/1"}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#082132] hover:bg-[#041622] border-2 border-accent text-white font-sans font-semibold text-sm transition-all shadow-glow hover:scale-105 cursor-pointer"
              >
                <span className="text-white font-semibold">
                  {hasNina ? "Buka Dashboard Nina" : "Mulai Onboarding Personal (5 Menit)"}
                </span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
