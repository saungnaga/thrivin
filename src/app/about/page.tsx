"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Compass,
  Target,
  TrendingUp,
  CheckCircle2,
  Lock,
  Smartphone,
  HeartHandshake
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const journeyStages = [
  {
    num: "01",
    title: "DISCOVER",
    desc: "Kenali masalah dan kebutuhanmu dalam konteks yang lebih luas. Menemukan titik awal yang jujur tanpa menghakimi diri sendiri.",
    icon: Compass,
  },
  {
    num: "02",
    title: "LEARN",
    desc: "Akses kurikulum terstruktur berbasis sains. Konsep esensial yang dipadatkan tanpa jargon berbelit agar mudah dipahami.",
    icon: Sparkles,
  },
  {
    num: "03",
    title: "APPLY",
    desc: "Terapkan pengetahuan ke dalam kehidupan nyatamu lewat aksi mikro harian yang realistis sesuai jadwal dan energimu.",
    icon: Target,
  },
  {
    num: "04",
    title: "GROW",
    desc: "Didampingi oleh AI Companion yang mengenal konteks, riwayat, dan menjagamu tetap konsisten setiap hari di WhatsApp.",
    icon: TrendingUp,
  },
];

const problemCards = [
  {
    num: "01",
    question: "Harus mulai dari mana?",
    explanation: "Informasi di internet terlalu banyak dan sering kali saling bertentangan. Kamu bingung memilih langkah pertama yang paling aman.",
  },
  {
    num: "02",
    question: "Mana yang relevan untuk kondisi saya?",
    explanation: "Tips umum di media sosial tidak mempertimbangkan cedera lamamu, jam lembur kerjamu, atau menu makanan lokal yang kamu santap.",
  },
  {
    num: "03",
    question: "Sudah baca banyak, tapi bagaimana menerapkannya?",
    explanation: "Tahu teorinya tapi selalu kendor di minggu ketiga karena berjuang sendirian tanpa ada rekan yang menanyakan progresmu.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col selection:bg-brand-100 selection:text-brand-900">
      <Navbar />

      <main className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-brand-900 transition-colors mb-8 py-1.5 px-3 rounded-full bg-surface-muted border border-surface-border w-fit shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Beranda</span>
        </Link>

        {/* ─── Hero / Manifest ─── */}
        <div className="space-y-4 mb-16 text-center sm:text-left">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-accent-dark uppercase tracking-wider font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            Filosofi & Pendekatan Thrivin
          </span>
          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold text-brand-950 tracking-tight leading-[1.12]">
            Kami Percaya: Kamu Tidak Dirancang untuk Tumbuh Sendirian.
          </h1>
          <p className="text-base sm:text-xl text-text-secondary leading-relaxed max-w-3xl">
            Thrivin adalah platform penyedia AI Companion spesifik untuk setiap pilar pertumbuhan hidupmu — hidup langsung di WhatsApp, hadir setiap hari, dan menjagamu konsisten pada janji yang kamu buat untuk dirimu sendiri.
          </p>
        </div>

        {/* ─── The Gap Between Knowing & Doing ─── */}
        <section className="mb-20">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2 font-mono">
              The Gap Between Knowing & Doing
            </span>
            <h2 className="font-serif text-2xl sm:text-4xl font-bold text-brand-950 leading-tight">
              Internet memberi lautan informasi melimpah. Masalahnya bukan lagi &ldquo;Di mana saya bisa belajar?&rdquo;
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {problemCards.map((card) => (
              <div
                key={card.num}
                className="p-6 sm:p-7 rounded-3xl bg-surface-muted border border-surface-border flex flex-col justify-between shadow-2xs hover:shadow-sm transition-all"
              >
                <div>
                  <span className="text-accent-dark font-mono font-black text-2xl block mb-3">
                    {card.num}
                  </span>
                  <h3 className="font-serif text-xl font-bold text-brand-950 mb-2 leading-snug">
                    {card.question}
                  </h3>
                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                    {card.explanation}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 rounded-3xl bg-brand-50 border border-brand-200 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs sm:text-sm text-brand-950 font-medium leading-relaxed">
              <strong>Kesimpulan Sederhana:</strong> Kita tidak kekurangan informasi latihan atau diet. Kita kekurangan struktur, relevansi personal, dan kehadiran partner yang menemani.
            </p>
            <span className="shrink-0 text-xs font-bold text-accent-dark uppercase tracking-wider font-mono">
              Akuntabilitas &gt; Sekadar Teori
            </span>
          </div>
        </section>

        {/* ─── The Thrivin Experience: 4-Stage Journey ─── */}
        <section className="mb-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2 font-mono">
              The Thrivin Experience
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
              Bertumbuh, Satu Langkah yang Berarti.
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mt-2">
              Bukan tentang bergerak lebih cepat. Tentang bergerak ke arah yang tepat.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {journeyStages.map((stage) => {
              const IconComp = stage.icon;
              return (
                <div
                  key={stage.num}
                  className="p-6 rounded-3xl bg-white border border-surface-border shadow-xs hover:border-brand-300 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-accent-dark">
                        <IconComp className="w-5 h-5" />
                      </div>
                      <span className="font-mono text-xs font-bold text-text-muted">
                        STEP {stage.num}
                      </span>
                    </div>

                    <h3 className="font-serif text-lg font-bold text-brand-950 mb-2">
                      {stage.title}
                    </h3>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {stage.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── The Philosophy Quote Card ─── */}
        <section className="mb-20">
          <div className="p-8 sm:p-12 rounded-[2.5rem] bg-brand-950 text-white text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-2xl mx-auto space-y-5">
              <div className="text-accent text-3xl font-serif">✳</div>
              
              <div className="font-serif text-2xl sm:text-4xl font-bold leading-tight">
                Mengetahui apa yang harus dilakukan tidak sama dengan mampu melakukannya sendirian.
              </div>

              <div className="space-y-1.5 text-xs sm:text-base text-brand-100/90 leading-relaxed font-sans max-w-lg mx-auto pt-2">
                <p>Sistem belajar memberi arah.</p>
                <p>Pengetahuan memberi pemahaman.</p>
                <p>Companion memberi konteks, akuntabilitas, dan kehadiran.</p>
              </div>

              <p className="text-xs text-brand-200 pt-2">
                Dan kamu tetap menjadi orang yang menjalani pertumbuhanmu sendiri.
              </p>

              <div className="font-mono font-bold text-accent uppercase tracking-[0.25em] text-sm pt-4">
                — NEVER GROW ALONE.
              </div>
            </div>
          </div>
        </section>

        {/* ─── The Science Behind Companion ─── */}
        <section className="mb-20">
          <div className="p-8 rounded-3xl bg-brand-50 border border-brand-200 shadow-xs">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                  Bukti Sains
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 mb-3">
                  Akuntabilitas Mengubah Peluang dari 43% ke 76%
                </h3>
                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mb-4">
                  Dr. Gail Matthews (Dominican University) meneliti ratusan peserta: mereka yang hanya memikirkan tujuan menyelesaikan 43% target. Mereka yang memiliki companion akuntabilitas harian menyelesaikan <strong>76% target mereka</strong>.
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-brand-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Duke University: 3.5× lebih mungkin konsisten jangka panjang.</span>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-brand-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-950 uppercase tracking-wider font-mono">
                  <Smartphone className="w-4 h-4 text-accent-dark" />
                  <span>Mengapa di WhatsApp?</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Aplikasi baru sering diabaikan setelah 2 minggu karena terkubur notifikasi. WhatsApp adalah ruang percakapan yang kamu buka setiap hari. Nina hadir tanpa hambatan instalasi baru.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Ekosistem Companion Thrivin ─── */}
        <section className="mb-20">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950">
              Keluarga AI Companion Thrivin
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary mt-1">
              Setiap companion dirancang dengan karakter spesifik dan kurikulum teruji:
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5">
            {/* Nina */}
            <div className="p-5 rounded-3xl bg-brand-950 text-white border border-accent shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-[10px] font-mono font-bold text-accent uppercase">
                    Aktif Sekarang
                  </span>
                </div>
                <h4 className="font-serif text-lg font-bold mb-1">
                  Nina (Wellness & Fitness)
                </h4>
                <p className="text-xs text-brand-200 leading-relaxed mb-4">
                  Baca foto makanan, evaluasi record data Strava, dan reminder akuntabilitas harian di WhatsApp.
                </p>
              </div>
              <Link
                href="/companion/nina"
                className="w-full py-2.5 rounded-full bg-accent hover:bg-accent-dark text-white font-black text-xs text-center transition-colors block shadow-xs"
              >
                Kenali Nina &rarr;
              </Link>
            </div>

            {/* Mindset */}
            <div className="p-5 rounded-3xl bg-surface-muted border border-surface-border flex flex-col justify-between opacity-80">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Lock className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-[10px] font-mono font-bold text-text-muted uppercase">
                    Coming Soon
                  </span>
                </div>
                <h4 className="font-serif text-lg font-bold text-brand-950 mb-1">
                  Mindset, Habit & Reading
                </h4>
                <p className="text-xs text-text-secondary leading-relaxed mb-4">
                  Refleksi harian, journaling kilat, reading companion untuk buku pengembangan diri, dan pembongkar mental block.
                </p>
              </div>
              <span className="text-center text-xs font-bold text-text-muted py-2">
                Segera Hadir
              </span>
            </div>

            {/* Parenting */}
            <div className="p-5 rounded-3xl bg-surface-muted border border-surface-border flex flex-col justify-between opacity-80">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Lock className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-[10px] font-mono font-bold text-text-muted uppercase">
                    Coming Soon
                  </span>
                </div>
                <h4 className="font-serif text-lg font-bold text-brand-950 mb-1">
                  Parenting & Family Care
                </h4>
                <p className="text-xs text-text-secondary leading-relaxed mb-4">
                  Solusi tantrum sains, stimulasi bermain anak, dan dukungan emosional ayah-ibu saat lelah.
                </p>
              </div>
              <span className="text-center text-xs font-bold text-text-muted py-2">
                Segera Hadir
              </span>
            </div>
          </div>
        </section>

        {/* ─── Closing CTA to Nina ─── */}
        <section className="p-8 sm:p-12 rounded-[2.5rem] bg-brand-900 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-glow">
          <div className="space-y-2 text-center sm:text-left">
            <h3 className="font-serif text-2xl sm:text-3xl font-bold">
              Siap Memulai Bersama Nina?
            </h3>
            <p className="text-xs sm:text-sm text-brand-100 max-w-md">
              Setup 5 menit, langsung aktif di WhatsApp hari ini dengan garansi 3 hari uang kembali.
            </p>
          </div>
          <Link
            href="/companion/nina"
            className="px-8 py-4 rounded-full bg-accent hover:bg-accent-dark text-white font-black text-sm transition-all shadow-glow hover:scale-105 shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <span className="text-white font-black drop-shadow-xs">Mulai Bersama Nina</span>
            <ArrowRight className="w-4 h-4 text-white" />
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}
