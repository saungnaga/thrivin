"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Utensils,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  REFUND_GUARANTEE_TEXT,
  REFUND_GUARANTEE_TITLE,
  TEMANBARU_PROMO,
} from "@/lib/pricing-copy";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const ROTATING_WORDS = [
  "menjaga konsistensimu",
  "mengingatkan jadwalmu",
  "menemani dietmu",
  "membaca piringmu",
  "mengevaluasi larimu",
];

const BubbleNina = ({ children, time = "08:15" }: { children: React.ReactNode; time?: string }) => (
  <div className="bg-[#DCF8C6] rounded-2xl rounded-tl-none px-3.5 py-2 text-[12px] sm:text-[13px] text-gray-800 shadow-2xs self-start max-w-[90%] relative z-10 leading-snug">
    <div>{children}</div>
    <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">
      {time}
    </span>
  </div>
);

const BubbleUser = ({ children, time = "08:14" }: { children: React.ReactNode; time?: string }) => (
  <div className="bg-white rounded-2xl rounded-tr-none px-3.5 py-2 text-[12px] sm:text-[13px] text-gray-800 shadow-2xs self-end max-w-[88%] relative z-10 leading-snug border border-slate-100">
    <div>{children}</div>
    <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">
      {time}
    </span>
  </div>
);

// Reusable WhatsApp Mockup - Full Height, No Scrollbar
const WAMockup = ({ 
  children, 
  headerSubtitle = "Online · Personal Companion" 
}: { 
  children: React.ReactNode; 
  headerSubtitle?: string;
}) => (
  <div className="relative mx-auto w-full max-w-[360px] sm:max-w-[390px] rounded-[2.5rem] bg-slate-100 ring-8 ring-brand-900 shadow-2xl overflow-hidden flex flex-col min-h-[580px] sm:min-h-[640px]">
    {/* WA Header */}
    <div className="bg-[#075E54] px-4 py-3 sm:py-3.5 flex items-center justify-between text-white z-10 shrink-0 shadow-md">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden bg-brand-900 border border-white/40 shrink-0">
          <Image
            src="/nina-pp.webp"
            alt="Nina"
            fill
            className="object-cover object-top"
          />
        </div>
        <div>
          <div className="font-semibold text-sm leading-tight text-white flex items-center gap-1.5">
            <span>Nina · Thrivin</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <div className="text-[11px] text-white/80">{headerSubtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
      </div>
    </div>
    
    {/* Chat Area - Full Chat Without Scroll */}
    <div className="relative flex-1 bg-[#efeae2] p-3 sm:p-4 flex flex-col justify-end z-0 bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-blend-soft-light bg-center overflow-hidden">
      <div className="absolute inset-0 bg-[#efeae2]/85 z-0 pointer-events-none" />
      <div className="relative z-10 flex flex-col gap-2 sm:gap-2.5">
        {children}
      </div>
    </div>

    {/* Input Area */}
    <div className="p-2.5 bg-[#f0f2f5] flex items-center gap-2 z-10 shrink-0 border-t border-slate-200">
      <div className="flex-1 bg-white rounded-full h-9 sm:h-10 px-4 flex items-center text-gray-400 text-xs sm:text-sm shadow-xs font-sans">
        Ketik pesan...
      </div>
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#00A884] flex items-center justify-center text-white shadow-xs shrink-0">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </div>
    </div>
  </div>
);

// WhatsApp Full-Chat Feature Showcase Slides (From Onboarding Features)
const CHAT_SLIDES = [
  {
    id: "food",
    tabTitle: "Foto Piring",
    icon: Camera,
    category: "Foto Piring · Analisis Nutrisi & Kalori",
    headerSubtitle: "Online · Evaluasi Nutrisi Piring",
    content: (
      <>
        <BubbleUser time="12:30">
          <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden mb-1 border border-brand-900/15 shadow-2xs">
            <Image
              src="/nasi-padang.webp"
              alt="Nasi Padang"
              fill
              className="object-cover"
            />
          </div>
          Makan siang Nasi Padang nih Nin! 🍛
        </BubbleUser>

        <BubbleNina time="12:31">
          <p className="font-semibold text-[#075E54] mb-0.5">Wah nasi padang! 😍 Aku hitungin ya:</p>
          <div className="text-[11px] sm:text-xs text-slate-700 space-y-0.5 my-1">
            <div>• Rendang sapi (~80g): <strong>~24g protein</strong></div>
            <div>• Daun singkong & sambal: <strong>serat bagus!</strong></div>
            <div>• Nasi putih (~150g): ~180 kkal</div>
          </div>
          <p className="mt-1">
            Total <strong>~480 kkal, ~27g protein</strong>. Sisa target proteinmu 43g lagi, malam nanti tambahin telur atau tempe ya! 💪
          </p>
        </BubbleNina>

        <BubbleUser time="12:32">
          Praktis banget tinggal foto gini, ga ribet nimbang gram 🔥
        </BubbleUser>

        <BubbleNina time="12:32">
          Itu kuncinya! Yang penting konsisten dicatat tiap hari 😊
        </BubbleNina>
      </>
    ),
  },
  {
    id: "reminder",
    tabTitle: "Reminder Proaktif",
    icon: BellRing,
    category: "Reminder Proaktif · Pantau Jadwal Workout",
    headerSubtitle: "Online · Check-in Proaktif",
    content: (
      <>
        <BubbleNina time="07:30">
          Pagi Ari! 🌅 Hari ini jadwal workout upper body ya. Mau mulai jam berapa nanti? Aku ingetin ya 💪
        </BubbleNina>

        <BubbleUser time="07:32">
          Jam 5 sore ya Nin, baru beres meeting kantor
        </BubbleUser>

        <BubbleNina time="07:32">
          Siap! Nanti jam 4:45 aku reminder ya biar sempat pemanasan & stretching 🔥
        </BubbleNina>

        <BubbleNina time="16:45">
          Tok tok! ⏰ Udah jam 4:45 nih, yuk siap-siap! 40 menit fokus chest & back hari ini 🏋️
        </BubbleNina>

        <BubbleUser time="16:47">
          Untung lo nanya duluan, hampir mager kelamaan duduk haha. Otw ganti baju! 🚀
        </BubbleUser>
      </>
    ),
  },
  {
    id: "memory",
    tabTitle: "Memori Cedera",
    icon: BrainCircuit,
    category: "Memori Personal · Riwayat Cedera & Progres",
    headerSubtitle: "Online · Ingat Riwayat Pribadimu",
    content: (
      <>
        <BubbleNina time="16:15">
          Eh minggu lalu kan lutut kiri lo agak ngilu sehabis squat, hari ini kita skip squat dulu ya.
        </BubbleNina>

        <BubbleNina time="16:15">
          Ganti leg press sama Romanian deadlift aja gimana? Bebannya tetap kena paha tapi lutut lo aman terlindungi 😊
        </BubbleNina>

        <BubbleUser time="16:18">
          Wah gila, kok lo inget sih Nin 😂 Padahal gue sendiri hampir maksain tadi
        </BubbleUser>

        <BubbleNina time="16:19">
          Ingat dong! Kunci konsistensi itu tanpa cedera. Nanti malam jangan lupa kompres hangat atau foam roll 5 menit ya 🧘‍♀️
        </BubbleNina>
      </>
    ),
  },
  {
    id: "strava",
    tabTitle: "Data Strava",
    icon: Activity,
    category: "Integrasi Strava · Evaluasi Kardio & Pace",
    headerSubtitle: "Online · Integrasi Aktivitas Strava",
    content: (
      <>
        <BubbleUser time="06:40">
          <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden mb-1 border border-brand-900/15 shadow-2xs">
            <Image
              src="/strava.webp"
              alt="Strava Activity"
              fill
              className="object-cover"
            />
          </div>
          Kelar lari pagi bareng komunitas nih Nin! 👟
        </BubbleUser>

        <BubbleNina time="06:41">
          <p className="font-semibold text-[#075E54] mb-0.5">Lari 5.2 km yang solid pagi ini! 🔥</p>
          <p className="my-1 text-[11px] sm:text-xs">
            Pace <strong>5&apos;45&quot;</strong> stabil di Zone 2 aerobik. Heart rate 148 bpm nunjukin adaptasi kardio lo makin efisien dibanding 2 minggu lalu!
          </p>
          <p className="mt-1">
            Jangan lupa rehidrasi 500ml air & sarapan tinggi protein ya 🥛
          </p>
        </BubbleNina>

        <BubbleUser time="06:43">
          Pantesan nafas kerasa jauh lebih enteng dibanding biasa 🙌
        </BubbleUser>
      </>
    ),
  },
  {
    id: "whatsapp",
    tabTitle: "100% WhatsApp",
    icon: MessageCircle,
    category: "100% di WhatsApp · Tanpa Instal Aplikasi",
    headerSubtitle: "Online · 100% di WhatsApp",
    content: (
      <>
        <BubbleNina time="09:00">
          Lo ga perlu download aplikasi apapun lagi. Aku langsung ada di WhatsApp lo. Chat aja santai kayak ngobrol sama teman akrab 😊
        </BubbleNina>

        <BubbleUser time="09:02">
          Gampang banget sih, ga bikin memori HP penuh aplikasi baru
        </BubbleUser>

        <BubbleNina time="09:03">
          Itu kuncinya! Kunci konsistensi itu akses yang paling gampang. Ga ada aplikasi baru yang ribet, ga ada notifikasi tenggelam. Kapanpun butuh, aku selalu ada di sini 💬
        </BubbleNina>

        <BubbleUser time="09:04">
          Cocok banget buat yang jadwalnya padat 👍
        </BubbleUser>
      </>
    ),
  },
];

export default function NinaPage() {
  const [wordIndex, setWordIndex] = useState(0);
  const [chatSlide, setChatSlide] = useState(0);
  const [isChatPaused, setIsChatPaused] = useState(false);
  const touchStartXRef = useRef<number>(0);
  const touchEndXRef = useRef<number>(0);

  const nextSlide = () => {
    setChatSlide((prev) => (prev + 1) % CHAT_SLIDES.length);
  };

  const prevSlide = () => {
    setChatSlide((prev) => (prev - 1 + CHAT_SLIDES.length) % CHAT_SLIDES.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = e.touches[0].clientX;
    setIsChatPaused(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartXRef.current - touchEndXRef.current;
    if (diff > 40) {
      nextSlide();
    } else if (diff < -40) {
      prevSlide();
    }
    setTimeout(() => setIsChatPaused(false), 4000);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  // Auto-slide WhatsApp mockup showcase every 4.5 seconds (1s faster)
  useEffect(() => {
    if (isChatPaused) return;
    const timer = setInterval(() => {
      setChatSlide((prev) => (prev + 1) % CHAT_SLIDES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isChatPaused]);

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
                href="/nina/onboarding/1"
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#082132] hover:bg-[#041622] border-2 border-accent text-white font-sans font-semibold text-sm transition-all shadow-glow hover:scale-105 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="text-white font-semibold">
                  Mulai Onboarding Bersama Nina
                </span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </Link>

              <Link
                href="/nina/learning"
                className="w-full sm:w-auto px-6 py-4 rounded-full bg-white hover:bg-slate-100 border border-slate-300 text-[#071F2D] font-bold text-sm transition-all flex items-center justify-center gap-2.5 shadow-xs cursor-pointer group"
              >
                <BookOpen className="w-4 h-4 text-accent-dark" />
                <span className="text-[#071F2D] font-bold">Knowledge Base</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Science Proven
                </span>
              </Link>
            </div>

            {/* Micro Trust Points */}
            <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs font-semibold text-text-secondary">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>{REFUND_GUARANTEE_TITLE}</span>
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

          {/* Right Column: Hero WA Mockup with Auto-Slide Feature Showcase */}
          <div 
            className="lg:col-span-5 flex flex-col items-center justify-center w-full"
            onMouseEnter={() => setIsChatPaused(true)}
            onMouseLeave={() => setIsChatPaused(false)}
          >
            {/* Category Title Above Chat */}
            <div className="flex items-center justify-center mb-3 h-7 text-center px-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={chatSlide}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold font-sans text-brand-900 tracking-wide"
                >
                  {React.createElement(CHAT_SLIDES[chatSlide].icon, { className: "w-4 h-4 text-accent shrink-0" })}
                  <span>{CHAT_SLIDES[chatSlide].category}</span>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Phone Shell with Swipe Gestures (Mobile) & Minimalist Controls (Desktop/Laptop) */}
            <div 
              className="relative w-full max-w-[340px] sm:max-w-[360px] flex items-center justify-center select-none"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Minimalist Left Chevron Button (Laptop / Desktop) */}
              <button
                type="button"
                onClick={prevSlide}
                aria-label="Slide sebelumnya"
                className="hidden sm:flex absolute -left-5 lg:-left-12 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 hover:bg-white border border-slate-200 shadow-md text-brand-900 items-center justify-center transition-all hover:scale-110 active:scale-95 z-20 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5 text-brand-900" />
              </button>

              {/* Phone Shell */}
              <WAMockup headerSubtitle={CHAT_SLIDES[chatSlide].headerSubtitle}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={chatSlide}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="flex flex-col gap-2 sm:gap-2.5"
                  >
                    {CHAT_SLIDES[chatSlide].content}
                  </motion.div>
                </AnimatePresence>
              </WAMockup>

              {/* Minimalist Right Chevron Button (Laptop / Desktop) */}
              <button
                type="button"
                onClick={nextSlide}
                aria-label="Slide berikutnya"
                className="hidden sm:flex absolute -right-5 lg:-right-12 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 hover:bg-white border border-slate-200 shadow-md text-brand-900 items-center justify-center transition-all hover:scale-110 active:scale-95 z-20 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5 text-brand-900" />
              </button>
            </div>

            {/* Bottom Indicators */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {CHAT_SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setChatSlide(idx)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    chatSlide === idx ? "w-8 bg-accent" : "w-2 bg-slate-300 hover:bg-slate-400"
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
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
            {/* Rule 2 & 4: Sub-headline Inter Regular.
                Marketing TIDAK menampilkan nominal (keputusan owner 20/10/2026:
                "gausah kasih harga"). Nominal hanya di langkah checkout.
                Promo (kode + %) tetap tampil. */}
            <p className="text-xs sm:text-sm text-brand-200 leading-relaxed font-sans font-normal">
              Sekali bayar untuk 1 bulan — tanpa tagihan otomatis. Kode promo{" "}
              <span className="bg-accent/20 text-accent px-1.5 py-0.5 rounded font-sans font-bold">
                {TEMANBARU_PROMO.code}
              </span>{" "}
              diskon {TEMANBARU_PROMO.discountPercent}% di paket {TEMANBARU_PROMO.minMonths} bulan ke
              atas.
            </p>

            {/* Guarantee Box (Rule 3: Lora Regular) — satu sumber teks di pricing-copy.ts,
                tidak boleh lebih kuat dari kebijakan /privacy §3 */}
            <div
              role="note"
              className="p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-400/40 text-left inline-flex items-start gap-3 text-xs sm:text-sm text-white font-sans"
            >
              <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <strong className="font-extrabold text-white">{REFUND_GUARANTEE_TITLE}.</strong>{" "}
                {REFUND_GUARANTEE_TEXT}
              </span>
            </div>

            {/* Bottom CTA with Guaranteed White Text Contrast on Deep Accent/Navy (Rule 8: Inter Semibold) */}
            <div className="pt-2">
              <Link
                href="/nina/onboarding/1"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#082132] hover:bg-[#041622] border-2 border-accent text-white font-sans font-semibold text-sm transition-all shadow-glow hover:scale-105 cursor-pointer"
              >
                <span className="text-white font-semibold">
                  Mulai Onboarding Personal (5 Menit)
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
