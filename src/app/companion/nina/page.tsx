"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  BellRing,
  BrainCircuit,
  MessageCircle,
  Smartphone,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";

const fadeInUp = {
  hidden: { opacity: 0, y: 25 } as const,
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } } as const,
};

const staggerContainer = {
  hidden: { opacity: 0 } as const,
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  } as const,
};

const ROTATING_WORDS = [
  { text: "nemenin", color: "#38AEC8" },       // Cyan
  { text: "ngingetin", color: "#5ED6F0" },     // Light Cyan
  { text: "nyatetin", color: "#7DD3FC" },      // Sky Blue
  { text: "nyemangatin", color: "#A5F3FC" },   // Ice Cyan
  { text: "ngertiin", color: "#38BDF8" },      // Vivid Sky
  { text: "evaluasi bareng", color: "#2DD4BF" }, // Soft Teal
  { text: "jagain ritme lo", color: "#06B6D4" }, // Deep Cyan
];

// Reusable WhatsApp Mockup
const WAMockup = ({ children }: { children: React.ReactNode }) => (
  <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[360px] rounded-[2.5rem] bg-slate-100 ring-8 ring-brand-900 shadow-2xl overflow-hidden flex flex-col h-[520px]">
    {/* WA Header */}
    <div className="bg-[#075E54] px-4 py-3.5 flex items-center justify-between text-white z-10 shrink-0 shadow-md">
      <div className="flex items-center gap-3">
        <ArrowLeft className="w-5 h-5 text-white/90" />
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
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
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
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
        </svg>
      </div>
    </div>
  </div>
);

const BubbleNina = ({ children, time = "08:15" }: { children: React.ReactNode; time?: string }) => (
  <motion.div 
    variants={fadeInUp}
    className="bg-[#DCF8C6] rounded-2xl rounded-tl-none px-3.5 py-2.5 text-[14px] text-gray-800 shadow-xs self-start max-w-[88%] relative z-10 leading-snug"
  >
    <div>{children}</div>
    <span className="text-[10px] text-gray-500 block text-right mt-1 opacity-70 font-mono">
      {time}
    </span>
  </motion.div>
);

const BubbleUser = ({ children, time = "08:14" }: { children: React.ReactNode; time?: string }) => (
  <motion.div 
    variants={fadeInUp}
    className="bg-white rounded-2xl rounded-tr-none px-3.5 py-2.5 text-[14px] text-gray-800 shadow-xs self-end max-w-[88%] relative z-10 leading-snug"
  >
    <div>{children}</div>
    <span className="text-[10px] text-gray-500 block text-right mt-1 opacity-70 font-mono">
      {time}
    </span>
  </motion.div>
);

export default function NinaPage() {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-surface font-sans text-brand-900 selection:bg-brand-100 selection:text-brand-900">
      {/* ─── 1. Header (Sticky) ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-surface-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="text-xs sm:text-sm font-semibold text-text-secondary hover:text-brand-900 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Beranda</span>
          </Link>
          <Link href="/" className="font-serif font-black text-lg sm:text-xl tracking-[0.2em] text-gradient">
            THRIVIN
          </Link>
          <Link
            href="/onboarding"
            className="text-xs sm:text-sm font-bold bg-brand-900 text-white px-5 py-2 rounded-full hover:bg-brand-800 transition-all shadow-glow hover:-translate-y-0.5"
          >
            Mulai Perjalanan
          </Link>
        </div>
      </header>

      <main>
        {/* ─── 2. Hero Section: Direct "Never Grow Alone" + Vertical Rolling Words ─── */}
        <section className="relative min-h-[92vh] flex flex-col items-center justify-center bg-gradient-dark py-20 px-4 sm:px-6 text-white overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[650px] h-[650px] bg-accent/12 rounded-full blur-[140px] pointer-events-none" />

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="max-w-4xl mx-auto text-center relative z-10"
          >
            {/* Tagline Badge */}
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 text-accent text-xs sm:text-sm font-black uppercase tracking-[0.25em] mb-8 border border-white/15 backdrop-blur-md shadow-xs">
              <Sparkles className="w-4 h-4 text-accent" />
              NEVER GROW ALONE
            </motion.div>

            {/* Main Headline with Vertical Scrolling Words */}
            <motion.h1 variants={fadeInUp} className="font-serif text-4xl sm:text-6xl lg:text-7xl text-white font-medium leading-[1.15] mb-6 tracking-tight">
              Meet Nina. <br />
              <span className="text-white/90">Teman yang bakal </span>
              <div className="inline-flex h-[1.35em] overflow-hidden align-bottom">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={wordIndex}
                    initial={{ y: 55, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -55, opacity: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    style={{ color: ROTATING_WORDS[wordIndex].color }}
                    className="font-serif font-bold inline-block"
                  >
                    {ROTATING_WORDS[wordIndex].text}
                  </motion.span>
                </AnimatePresence>
              </div>
            </motion.h1>
            
            {/* Subtitle */}
            <motion.p variants={fadeInUp} className="text-lg sm:text-2xl text-brand-100 font-medium max-w-2xl mx-auto leading-relaxed mb-10">
              Always-on companion, selalu ada di <strong className="text-accent font-bold">WHATSAPP</strong> lo 24/7.
            </motion.p>
            
            {/* CTA Button & Small Helper */}
            <motion.div variants={fadeInUp} className="flex flex-col items-center gap-3">
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center gap-2.5 px-9 py-5 text-base sm:text-lg font-black text-white bg-accent-dark hover:bg-accent hover:text-brand-950 rounded-full transition-all shadow-glow hover:scale-105 active:scale-95 cursor-pointer"
              >
                <span>Mulai Perjalanan Lo Bareng Nina</span>
                <ArrowRight className="w-5 h-5 text-white group-hover:text-brand-950" />
              </Link>
              <span className="text-xs sm:text-sm text-brand-200/80 font-medium">
                gaperlu install, cukup whatsapp
              </span>
            </motion.div>

            {/* Scroll Indicator */}
            <motion.div variants={fadeInUp} className="pt-14">
              <a
                href="#filosofi"
                className="inline-flex flex-col items-center gap-2 text-brand-200 hover:text-white transition-colors cursor-pointer"
              >
                <span className="text-xs font-semibold tracking-wider uppercase">Pelajari Filosofi & Riset Sains</span>
                <ChevronDown className="w-5 h-5 animate-bounce text-accent" />
              </a>
            </motion.div>
          </motion.div>
        </section>

        {/* ─── 3. Section: Filosofi Thrivin ─── */}
        <section id="filosofi" className="py-20 sm:py-28 bg-surface-muted px-4 sm:px-6 border-b border-surface-border">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
            >
              <motion.span variants={fadeInUp} className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-3">
                Filosofi Pertumbuhan
              </motion.span>
              <motion.h2 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-6 leading-snug">
                Pertumbuhan yang paling sering gagal bukan karena rencananya buruk. <br />
                <span className="text-accent-dark">Tapi karena dijalani sendirian.</span>
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-base sm:text-lg text-text-secondary leading-relaxed mb-6">
                Lo pernah di titik itu. Niat udah bulat, plan udah ada, tapi minggu ketiga semuanya mulai kendor. Bukan karena lo lemah. Karena manusia memang tidak dirancang untuk konsisten dalam ruang kosong — tanpa siapa pun yang tahu apa yang sedang lo perjuangkan.
              </motion.p>
              <motion.div variants={fadeInUp} className="p-6 rounded-2xl bg-brand-50 border border-brand-100">
                <p className="font-serif text-lg text-brand-900 font-semibold italic">
                  &ldquo;Thrivin percaya satu hal sederhana: pertumbuhan bukan sesuatu yang harus dijalani sendiri.&rdquo;
                </p>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ─── 4. Section: Riset — The Proof ─── */}
        <section id="riset" className="py-24 sm:py-32 bg-surface px-4 sm:px-6 border-b border-surface-border">
          <div className="max-w-6xl mx-auto">
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
              className="text-center max-w-2xl mx-auto mb-16"
            >
              <motion.span variants={fadeInUp} className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-3">
                The Proof · Riset Ilmiah
              </motion.span>
              <motion.h2 variants={fadeInUp} className="font-serif text-3xl sm:text-5xl font-bold text-brand-950 mb-4">
                Ini bukan opini. Ini yang ditemukan sains.
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-text-secondary text-sm sm:text-base">
                Kenapa kehadiran seorang &ldquo;teman&rdquo; mengubah segalanya dalam psikologi komitmen manusia.
              </motion.p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16">
              {/* Left: Research Cards */}
              <motion.div 
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="flex flex-col gap-6"
              >
                {/* Stat Card 1: Matthews Study */}
                <motion.div variants={fadeInUp} className="bg-surface-muted p-7 sm:p-8 rounded-3xl border border-surface-border shadow-xs hover:border-brand-200 transition-colors">
                  <div className="flex items-baseline gap-4 mb-3">
                    <span className="text-4xl sm:text-5xl font-bold text-gray-300 line-through decoration-red-400">43%</span>
                    <span className="text-4xl sm:text-5xl font-black text-accent-dark">76%</span>
                  </div>
                  <h3 className="font-serif font-bold text-lg text-brand-900 mb-2">
                    Dominican University (Dr. Gail Matthews)
                  </h3>
                  <p className="text-text-secondary text-sm leading-relaxed mb-3">
                    Meneliti 267 orang dari berbagai profesi. Orang yang cuma memikirkan tujuannya hanya <strong className="text-brand-900">43%</strong> yang berhasil. Namun orang yang menuliskan tujuan dan melapor progres ke orang lain secara rutin berhasil mencapai <strong className="text-accent-dark">76%</strong> targetnya.
                  </p>
                  <p className="text-xs text-text-muted italic border-t border-surface-border pt-3">
                    Hampir dua kali lipat. Bukan karena orangnya berbeda, tapi karena ada yang tahu — dan itu saja cukup mengubah cara otak kita memperlakukan komitmen.
                  </p>
                </motion.div>

                {/* Stat Card 2: Duke University */}
                <motion.div variants={fadeInUp} className="bg-surface-muted p-7 sm:p-8 rounded-3xl border border-surface-border shadow-xs hover:border-brand-200 transition-colors">
                  <div className="text-4xl sm:text-5xl font-black text-accent-dark mb-3">
                    3,5× Lebih Besar
                  </div>
                  <h3 className="font-serif font-bold text-lg text-brand-900 mb-2">
                    Duke University Study
                  </h3>
                  <p className="text-text-secondary text-sm leading-relaxed mb-3">
                    Menyebut bahwa individu dengan dukungan akuntabilitas eksternal punya kemungkinan 3,5 kali lebih besar untuk berhasil keluar dari kebiasaan buruk, dibanding yang mengandalkan motivasi internal sepenuhnya.
                  </p>
                  <p className="text-xs text-text-muted italic border-t border-surface-border pt-3">
                    Bukan soal lo kurang niat. Soal lo butuh orang yang tahu lo sedang berjuang apa.
                  </p>
                </motion.div>
              </motion.div>

              {/* Right: Mockup WA (Daily Push Check-in) with CTA Button Below */}
              <motion.div 
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="flex flex-col items-center"
              >
                <WAMockup>
                  <BubbleNina time="08:20">
                    Eh, gimana progres latihan hari ini? Kemarin sempat bilang mau coba naikin repetisi kan? 💪
                  </BubbleNina>
                  <BubbleUser time="08:24">
                    Belum sempet nih Nina, keburu capek meeting seharian di kantor 😅
                  </BubbleUser>
                  <BubbleNina time="08:25">
                    Santai, wajar banget kok! Hari kerja emang suka padat. Hari ini istirahat dulu biar badan pulih, besok kita mulai lagi dari yang ringan ya. Nanti pas push harian aku sapa lagi 🔥
                  </BubbleNina>
                  <BubbleUser time="08:26">
                    Sip Nina, thanks pengertiannya! Gak bikin ngerasa bersalah 🙏
                  </BubbleUser>
                </WAMockup>

                {/* CTA Button Under WhatsApp Mockup */}
                <div className="mt-5 w-full max-w-[340px] sm:max-w-[360px] flex flex-col items-center">
                  <Link
                    href="/onboarding"
                    className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm transition-all shadow-glow hover:-translate-y-0.5"
                  >
                    <span>Mulai Ngobrol Bareng Nina</span>
                    <ArrowRight className="w-4 h-4 text-accent" />
                  </Link>
                  <span className="text-[11px] text-text-muted mt-1.5">
                    gaperlu install, cukup whatsapp
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Closing Line */}
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
              className="max-w-3xl mx-auto text-center p-8 rounded-3xl bg-brand-50 border border-brand-100"
            >
              <p className="text-lg sm:text-xl text-brand-900 leading-relaxed font-serif">
                &ldquo;Bukan motivasi yang mengubah hidup. Bukan juga informasi. Yang mengubah hidup adalah ketika ada seseorang yang tahu apa yang sedang kamu kerjakan — dan secara konsisten hadir di sana.&rdquo;
              </p>
            </motion.div>
          </div>
        </section>

        {/* ─── 5. Section: The Gap ─── */}
        <section className="py-24 sm:py-32 bg-surface-muted px-4 sm:px-6 border-b border-surface-border">
          <div className="max-w-6xl mx-auto">
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="text-center max-w-2xl mx-auto mb-16"
            >
              <motion.span variants={fadeInUp} className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-3">
                The Reality Gap
              </motion.span>
              <motion.h2 variants={fadeInUp} className="font-serif text-3xl sm:text-5xl font-bold text-brand-950 mb-4">
                Masalahnya, hidup modern tidak dirancang untuk itu.
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-text-secondary text-sm sm:text-base">
                Kenapa mencari pendampingan konsistensi terasa begitu sulit di kehidupan sehari-hari:
              </motion.p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left Mockup (Personal Memory Check-in) with CTA Button Below */}
              <motion.div 
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="order-2 lg:order-1 flex flex-col items-center"
              >
                <WAMockup>
                  <BubbleNina time="07:15">
                    Pagi! Hari ini sempatin gerak tipis-tipis ya. Oh iya, lutut yang kemarin sempat agak ngilu sehabis latihan kaki gimana, udah lebih enakan?
                  </BubbleNina>
                  <BubbleUser time="07:18">
                    Udah mendingan banget kok Nina, aman!
                  </BubbleUser>
                  <BubbleNina time="07:19">
                    Mantap, tapi jangan langsung dipaksa ya. Hari ini fokus peregangan atau upper body dulu biar sendinya pulih maksimal 🌿
                  </BubbleNina>
                  <BubbleUser time="07:21">
                    Noted, aku ikut panduanmu 👍
                  </BubbleUser>
                </WAMockup>

                {/* CTA Button Under WhatsApp Mockup */}
                <div className="mt-5 w-full max-w-[340px] sm:max-w-[360px] flex flex-col items-center">
                  <Link
                    href="/onboarding"
                    className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm transition-all shadow-glow hover:-translate-y-0.5"
                  >
                    <span>Dapatkan Pendampingan Nina</span>
                    <ArrowRight className="w-4 h-4 text-accent" />
                  </Link>
                  <span className="text-[11px] text-text-muted mt-1.5">
                    gaperlu install, cukup whatsapp
                  </span>
                </div>
              </motion.div>

              {/* Right: Pain Points */}
              <div className="order-1 lg:order-2 flex flex-col justify-center">
                <motion.div 
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={staggerContainer}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8"
                >
                  {[
                    {
                      title: "Teman dekat sibuk",
                      desc: "Punya rutinitas & masalah sendiri, canggung jika harus terus diminta laporan."
                    },
                    {
                      title: "Personal Trainer mahal",
                      desc: "Biaya jutaan per bulan dan cuma ada di jam tertentu di gym."
                    },
                    {
                      title: "Aplikasi tracking dingin",
                      desc: "Hanya mencatat angka, tidak pernah benar-benar tahu kenapa lo skip tiga hari berturut-turut."
                    },
                    {
                      title: "Komunitas terlalu ramai",
                      desc: "Suaramu tenggelam di grup besar tanpa ada yang benar-benar mengenal kondisi lo."
                    }
                  ].map((pain, i) => (
                    <motion.div key={i} variants={fadeInUp} className="bg-white p-5 rounded-2xl shadow-xs border border-surface-border">
                      <div className="w-2 h-2 rounded-full bg-accent mb-2" />
                      <h4 className="font-serif font-bold text-sm text-brand-900 mb-1">{pain.title}</h4>
                      <p className="text-xs text-text-secondary leading-relaxed">{pain.desc}</p>
                    </motion.div>
                  ))}
                </motion.div>

                <motion.div 
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeInUp}
                  className="p-6 rounded-2xl bg-white border border-surface-border shadow-xs"
                >
                  <p className="text-base text-brand-900 leading-relaxed font-serif">
                    Lo butuh sesuatu yang ada setiap saat, mengenal kondisi lo, dan cukup jujur untuk bilang ketika lo perlu didorong — atau ketika lo perlu istirahat.
                  </p>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 6. Section: Introducing Nina ─── */}
        <section className="py-24 sm:py-32 bg-gradient-dark px-4 sm:px-6 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/15 rounded-full blur-[140px] pointer-events-none" />
          
          <div className="max-w-6xl mx-auto relative z-10">
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="text-center max-w-2xl mx-auto mb-16 sm:mb-20"
            >
              <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-accent text-xs font-bold uppercase tracking-[0.2em] mb-6 border border-white/10 backdrop-blur-sm">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                Meet Your Companion
              </motion.div>
              <motion.h2 variants={fadeInUp} className="font-serif text-4xl sm:text-6xl font-bold mb-4">
                Meet <span className="text-accent">Nina.</span>
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg sm:text-xl text-brand-100 font-medium mb-6">
                Teman yang tumbuh bareng lo, ada di WhatsApp lo.
              </motion.p>
              <motion.p variants={fadeInUp} className="text-sm sm:text-base text-brand-200/90 leading-relaxed">
                Bukan aplikasi baru yang harus lo buka setiap hari. Bukan tracker yang cuma nyimpen angka. Nina ada di tempat yang sudah lo buka setiap hari — dan dia ingat apa yang pernah lo ceritakan, bukan cuma menunggu lo lapor.
              </motion.p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left: Capability List */}
              <motion.div 
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="flex flex-col gap-6"
              >
                {[
                  {
                    icon: Camera,
                    title: "Bisa Baca Foto Makanan & Strava",
                    desc: "Tinggal kirim foto piring makan siang atau screenshot lari Strava di WA — Nina estimasi nutrisi dan evaluasi pace pemulihanmu."
                  },
                  {
                    icon: BellRing,
                    title: "Proaktif Reach Out Duluan",
                    desc: "Push harian santai yang menyapa dan mengingatkan konsistensi di jam-jam genting sebelum kamu menyerah."
                  },
                  {
                    icon: BrainCircuit,
                    title: "Memori Personal Jangka Panjang",
                    desc: "Ingat cedera lama, makanan favorit, ritme lelahmu, dan progres tanpa perlu kamu jelaskan ulang."
                  },
                  {
                    icon: MessageCircle,
                    title: "Bahasa Hangat & Empatik",
                    desc: "Lo cerita, dia dengar. Lo stuck, dia bantu cari kenapa. Lo hilang seminggu, dia sambut balik tanpa membuat lo merasa bersalah."
                  },
                  {
                    icon: Smartphone,
                    title: "100% Hidup di WhatsApp",
                    desc: "Bebas dari kerumitan login atau buka aplikasi baru. Praktis langsung dari WhatsApp pribadimu."
                  }
                ].map((feature, i) => (
                  <motion.div key={i} variants={fadeInUp} className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                    <div className="w-11 h-11 rounded-xl bg-accent/20 flex items-center justify-center shrink-0 border border-accent/30 text-accent">
                      <feature.icon className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white mb-1">{feature.title}</h3>
                      <p className="text-xs sm:text-sm text-brand-100/80 leading-relaxed">{feature.desc}</p>
                    </div>
                  </motion.div>
                ))}

                <motion.div variants={fadeInUp} className="pt-2">
                  <div className="font-serif italic text-accent text-lg">
                    &ldquo;Never Grow Alone.&rdquo;
                  </div>
                </motion.div>
              </motion.div>

              {/* Right: Mockup WA (Photo analysis of Real Nasi Padang: Ayam, Telur, Perkedel) with CTA Below */}
              <motion.div 
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="flex flex-col items-center"
              >
                <WAMockup>
                  <BubbleUser time="12:30">
                    {/* Real Nasi Padang Image */}
                    <div className="relative w-full h-36 rounded-xl overflow-hidden mb-2 border border-brand-900/20 shadow-xs">
                      <Image
                        src="/nasi-padang.webp"
                        alt="Nasi Padang dengan ayam, telur, dan perkedel"
                        fill
                        className="object-cover"
                      />
                    </div>
                    Makan siang Nasi Padang nih Nina! 🍛
                  </BubbleUser>
                  <BubbleNina time="12:31">
                    Wah Nasi Padang! Ada ayam, telur, sama perkedel ya 😍 Aku estimasi nutrisinya:<br /><br />
                    • Ayam: ~25g protein<br />
                    • Telur: ~7g protein<br />
                    • Perkedel: ~3g protein + karbo<br />
                    • Nasi & daun singkong: energi & serat<br /><br />
                    Total sekitar ~680 kkal, 35g protein. Asupan protein siang ini mantap banget! Sisa kebutuhan tinggal porsi ringan makan malam ya 💪
                  </BubbleNina>
                  <BubbleUser time="12:32">
                    Wah praktis banget, makasih Nina! 🙏
                  </BubbleUser>
                </WAMockup>

                {/* CTA Button Under WhatsApp Mockup */}
                <div className="mt-5 w-full max-w-[340px] sm:max-w-[360px] flex flex-col items-center">
                  <Link
                    href="/onboarding"
                    className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-full bg-accent text-brand-950 hover:bg-white font-black text-sm transition-all shadow-glow hover:-translate-y-0.5"
                  >
                    <span>Coba Bareng Nina Sekarang</span>
                    <ArrowRight className="w-4 h-4 text-brand-950" />
                  </Link>
                  <span className="text-[11px] text-brand-200/80 mt-1.5">
                    gaperlu install, cukup whatsapp
                  </span>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ─── 7. Section: CTA — Commitment ─── */}
        <section className="py-24 sm:py-32 bg-accent px-4 sm:px-6 relative overflow-hidden text-brand-950">
          <div className="max-w-3xl mx-auto text-center relative z-10">
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
            >
              <motion.span variants={fadeInUp} className="text-xs font-black uppercase tracking-[0.2em] text-brand-900 block mb-3">
                Langkah Berikutnya
              </motion.span>
              <motion.h2 variants={fadeInUp} className="font-serif text-3xl sm:text-5xl font-extrabold leading-tight mb-6 text-brand-950">
                Riset itu jelas: konsistensi naik hampir dua kali lipat ketika ada yang menemani prosesnya.
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-base sm:text-xl text-brand-900/90 font-medium mb-10 max-w-xl mx-auto">
                Sekarang tinggal satu langkah — komitmen sederhana bersama Nina.
              </motion.p>
              
              <motion.div variants={fadeInUp} className="flex flex-col items-center gap-3">
                <Link 
                  href="/onboarding" 
                  className="inline-flex items-center justify-center gap-2 px-9 py-5 text-base sm:text-lg font-black text-white bg-brand-950 rounded-full hover:bg-brand-900 hover:scale-105 transition-all shadow-2xl"
                >
                  <span>Mulai Perjalanan Lo Bareng Nina</span>
                  <Sparkles className="w-5 h-5 text-accent" />
                </Link>
                <div className="text-xs sm:text-sm font-semibold text-brand-950/80 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-900" />
                  <span>gaperlu install, cukup whatsapp</span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* ─── 8. Footer ─── */}
      <footer className="bg-brand-950 text-brand-200/60 py-10 px-4 sm:px-6 border-t border-white/10 text-center text-xs">
        <p>© 2026 Thrivin. Never Grow Alone.</p>
      </footer>
    </div>
  );
}
