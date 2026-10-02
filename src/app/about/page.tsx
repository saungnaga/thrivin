"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles, MessageCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function AboutPage() {
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

        {/* Hero */}
        <div className="space-y-4 mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-accent-dark uppercase tracking-wider font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            Tentang Thrivin
          </span>
          <h1 className="font-serif text-3xl sm:text-5xl font-bold text-brand-950 tracking-tight leading-tight">
            Kami Percaya: Kamu Tidak Dirancang untuk Tumbuh Sendirian.
          </h1>
          <p className="text-base sm:text-lg text-text-secondary leading-relaxed">
            Thrivin adalah platform penyedia AI Companion spesifik untuk setiap pilar kehidupanmu — dirancang untuk hidup di WhatsApp, hadir setiap hari, dan menjagamu tetap konsisten pada apa yang kamu janjikan ke dirimu sendiri.
          </p>
        </div>

        {/* Quote Cards */}
        <div className="space-y-6 mb-12">
          <div className="p-6 sm:p-8 rounded-3xl bg-brand-950 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
            <span className="text-accent text-3xl sm:text-4xl font-serif block mb-2">&ldquo;</span>
            <p className="font-serif text-xl sm:text-2xl font-bold text-white leading-relaxed mb-4">
              Pertumbuhan yang paling sering gagal bukan karena rencananya buruk. Tapi karena dijalani dalam ruang kosong — tanpa siapa pun yang tahu apa yang sedang kamu perjuangkan.
            </p>
            <span className="text-xs tracking-wider uppercase text-brand-200 font-mono font-semibold">
              — Prinsip Inti Thrivin
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-6 rounded-3xl bg-surface-muted border border-surface-border">
              <span className="text-accent-dark text-2xl font-serif block mb-1">&ldquo;</span>
              <p className="text-sm sm:text-base font-semibold text-brand-950 leading-relaxed mb-3">
                Informasi dan rencana latihan ada jutaan di Google. Yang langka adalah seseorang yang menanyakan progresmu di jam 7 pagi dan mengecek piring makanmu di jam 12 siang.
              </p>
              <span className="text-xs text-text-muted font-medium block">
                Akuntabilitas &gt; Sekadar Informasi
              </span>
            </div>

            <div className="p-6 rounded-3xl bg-surface-muted border border-surface-border">
              <span className="text-accent-dark text-2xl font-serif block mb-1">&ldquo;</span>
              <p className="text-sm sm:text-base font-semibold text-brand-950 leading-relaxed mb-3">
                Aplikasi terbaik adalah aplikasi yang tidak perlu kamu unduh. Kami memilih WhatsApp karena di sanalah tempat kamu membuka mata dan memulai hari.
              </p>
              <span className="text-xs text-text-muted font-medium block">
                Zero Friction Experience
              </span>
            </div>
          </div>
        </div>

        {/* Pillar Companions Overview */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-brand-200/90 shadow-xs mb-12">
          <h2 className="font-serif text-2xl font-bold text-brand-950 mb-3">
            4 Pilar Companion Thrivin
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mb-6">
            Kami tidak membangun AI serba tahu yang dingin. Kami merancang AI spesifik karakter dengan kurikulum sains teruji untuk mendampingimu:
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-xs sm:text-sm">
            <div className="p-4 rounded-2xl bg-brand-50 border border-brand-200 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-900 text-accent flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                N
              </div>
              <div>
                <span className="font-bold text-brand-950 block">Nina · Wellness & Fitness (Aktif)</span>
                <span className="text-text-secondary">Foto makanan, Strava, kurasi form video YouTube, dan reminder santai.</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-surface-muted border border-surface-border flex items-start gap-3 opacity-75">
              <div className="w-8 h-8 rounded-xl bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                K
              </div>
              <div>
                <span className="font-bold text-brand-950 block">Kai · Mindset & Self-Dev (Coming Soon)</span>
                <span className="text-text-secondary">Refleksi harian, journaling cepat, dan pembongkar mental block.</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-surface-muted border border-surface-border flex items-start gap-3 opacity-75">
              <div className="w-8 h-8 rounded-xl bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                M
              </div>
              <div>
                <span className="font-bold text-brand-950 block">Maya · Parenting & Family (Coming Soon)</span>
                <span className="text-text-secondary">Solusi tantrum sains, stimulasi bermain, dan dukungan tenang untuk orang tua.</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-surface-muted border border-surface-border flex items-start gap-3 opacity-75">
              <div className="w-8 h-8 rounded-xl bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                L
              </div>
              <div>
                <span className="font-bold text-brand-950 block">Leo · Career & Skills (Coming Soon)</span>
                <span className="text-text-secondary">Simulasi wawancara, bedah tulisan, dan akselerasi karir profesional.</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA to Nina */}
        <div className="p-8 rounded-3xl bg-brand-900 text-white text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 shadow-glow">
          <div>
            <h3 className="font-serif text-2xl font-bold mb-1">
              Siap Memulai dengan Nina?
            </h3>
            <p className="text-xs sm:text-sm text-brand-100">
              Setup 5 menit, langsung aktif mendampingimu di WhatsApp hari ini.
            </p>
          </div>
          <Link
            href="/companion/nina"
            className="px-6 py-3.5 rounded-full bg-accent text-brand-950 font-black text-sm hover:bg-white transition-all shadow-md shrink-0 flex items-center gap-2"
          >
            <span>Kenali Nina</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
