"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Dumbbell,
  Brain,
  Rocket,
  Heart,
  Search,
  Sparkles,
  BookOpen,
  MessageCircle,
  CheckCircle2
} from "lucide-react";

interface DomainItem {
  id: string;
  category: string;
  title: string;
  desc: string;
  icon: typeof Dumbbell;
  topics: string[];
  active: boolean;
  href: string;
  statusText: string;
  curriculumCount?: string;
  highlight?: string;
}

const ALL_DOMAINS: DomainItem[] = [
  {
    id: "wellness",
    category: "Tubuh & Energi",
    title: "Wellness",
    desc: "Bangun fondasi fisik kuat yang membuatmu hadir penuh untuk hal-hal penting dalam hidup. Dari latihan beban, kelenturan tubuh, hingga pola makan terukur.",
    icon: Dumbbell,
    topics: ["Workout & Strength", "Flexibility & Yoga", "Casual Fitness", "Diet & TDEE"],
    active: true,
    href: "/path/wellness",
    statusText: "Buka Learning Path",
    curriculumCount: "8 Bab Tersedia",
    highlight: "Sains kebugaran terstruktur tanpa mitos, dipandu AI Companion Nina."
  },
  {
    id: "self-development",
    category: "Pola Pikir & Kebiasaan",
    title: "Self-Development",
    desc: "Kenali pola diri, bangun kebiasaan otomatis, dan ubah tumpukan buku yang kamu baca menjadi tindakan nyata yang bertahan lama.",
    icon: Brain,
    topics: ["Atomic Habits", "Mental Models", "Deep Work", "Self-Awareness"],
    active: false,
    href: "#",
    statusText: "Segera Hadir",
    curriculumCount: "Dalam Kurasi",
    highlight: "Bukan motivasi instan atau toksik produktivitas — sistem pembentukan karakter bertahap."
  },
  {
    id: "skills-business",
    category: "Kerja & Karya",
    title: "Skills & Business",
    desc: "Pelajari keterampilan modern dan peluang ekonomi dengan ekspektasi realistis tanpa janji sukses instan dalam semalam.",
    icon: Rocket,
    topics: ["Modern Creator", "Digital Leverage", "Pragmatic Problem Solving", "Value Creation"],
    active: false,
    href: "#",
    statusText: "Segera Hadir",
    curriculumCount: "Dalam Kurasi",
    highlight: "Keahlian terapan yang dekat dengan kebutuhan dunia kerja saat ini."
  },
  {
    id: "life-connection",
    category: "Relasi & Keseharian",
    title: "Life & Connection",
    desc: "Keterampilan hidup fundamental yang sering terlewatkan: komunikasi empatik, hubungan sehat, navigasi peran keluarga, dan dinamika sosial.",
    icon: Heart,
    topics: ["Parenting & Keluarga", "Komunikasi Empatik", "Resolusi Konflik", "Keterampilan Sosial"],
    active: false,
    href: "#",
    statusText: "Segera Hadir",
    curriculumCount: "Dalam Kurasi",
    highlight: "Menjadi manusia yang lebih utuh dalam berinteraksi dengan sesama."
  }
];

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDomains = ALL_DOMAINS.filter((d) => {
    const q = searchQuery.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      d.desc.toLowerCase().includes(q) ||
      d.topics.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-surface-muted text-text-primary">
      {/* ─── Top Header Navigation ─── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-surface-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link
              href="/"
              className="flex items-center transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 rounded-sm"
              aria-label="Thrivin Homepage"
            >
              <span className="font-black tracking-[0.22em] text-gradient text-xl sm:text-2xl">
                THRIVIN
              </span>
            </Link>
            <div className="h-4 w-px bg-surface-border hidden sm:block" />
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Beranda</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/companion/nina"
              className="inline-flex items-center gap-2 rounded-full bg-brand-900 text-white px-4 py-1.5 text-xs sm:text-sm font-medium hover:bg-brand-800 transition-all shadow-sm"
            >
              <MessageCircle className="w-4 h-4 text-accent" />
              <span>Kenali Nina</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className="bg-surface border-b border-surface-border pt-14 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className="inline-block text-xs font-bold uppercase tracking-[0.25em] text-accent mb-3">
              The Learning Hub · 4 Domain Pertumbuhan
            </span>
            <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold text-text-primary tracking-tight mb-4">
              Temukan apa yang ingin kamu <span className="text-gradient">tumbuhkan.</span>
            </h1>
            <p className="text-text-secondary text-base sm:text-lg max-w-2xl mx-auto leading-relaxed mb-8">
              Kurikulum terstruktur yang membantumu bergerak dari sekadar rasa ingin tahu menjadi kemampuan nyata dalam keseharianmu.
            </p>
          </motion.div>

          {/* Search Box */}
          <div className="max-w-xl mx-auto relative">
            <Search className="w-5 h-5 text-text-muted absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari domain atau topik pembelajaran (contoh: workout, kebiasaan, parenting)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-muted border border-surface-border rounded-full pl-12 pr-4 py-3.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent focus:bg-white transition-all shadow-xs"
            />
          </div>
        </div>
      </section>

      {/* ─── Domain Grid ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-serif text-2xl font-bold text-text-primary">
              Semua Domain Tersedia
            </h2>
            <p className="text-sm text-text-secondary">
              Pilih domain untuk mulai belajar atau melihat roadmap kurikulum.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-surface border border-surface-border text-text-muted">
            {filteredDomains.length} Domain Ditemukan
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {filteredDomains.map((domain, index) => {
            const Icon = domain.icon;
            return (
              <motion.article
                key={domain.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                className={`flex flex-col justify-between p-8 rounded-3xl bg-surface border transition-all duration-300 hover:shadow-xl ${
                  domain.active
                    ? "border-brand-300 shadow-md ring-1 ring-brand-200/50"
                    : "border-surface-border opacity-90 hover:opacity-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                          domain.active
                            ? "bg-brand-900 text-accent shadow-xs"
                            : "bg-surface-muted text-brand-700"
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-wider font-bold text-text-muted">
                          {domain.category}
                        </span>
                        <h3 className="font-serif text-2xl font-bold text-text-primary">
                          {domain.title}
                        </h3>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        domain.active
                          ? "bg-brand-50 text-brand-900 border border-brand-200"
                          : "bg-surface-muted text-text-muted border border-surface-border"
                      }`}
                    >
                      {domain.curriculumCount}
                    </span>
                  </div>

                  <p className="text-sm text-text-secondary leading-relaxed mb-6">
                    {domain.desc}
                  </p>

                  {domain.highlight && (
                    <div className="p-3.5 rounded-xl bg-brand-50/60 border border-brand-100 text-xs text-brand-950 font-medium mb-6">
                      ✨ {domain.highlight}
                    </div>
                  )}

                  {/* Topic Badges */}
                  <div className="flex flex-wrap gap-2 mb-8">
                    {domain.topics.map((topic) => (
                      <span
                        key={topic}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-surface-muted text-text-secondary border border-surface-border"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="pt-6 border-t border-surface-border flex items-center justify-between">
                  {domain.active ? (
                    <Link
                      href={domain.href}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm transition-all shadow-glow hover:-translate-y-0.5"
                    >
                      <BookOpen className="w-4 h-4 text-accent" />
                      <span>{domain.statusText}</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted px-4 py-2 rounded-full bg-surface-muted">
                      <span>{domain.statusText}</span>
                    </span>
                  )}

                  {domain.active && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-dark">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      Active Companion
                    </span>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>

        {/* ─── Bottom Soft-Sell Banner ─── */}
        <section className="mt-20 p-8 sm:p-12 rounded-3xl bg-brand-950 text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-80 h-80 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center relative z-10">
            <div>
              <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-accent mb-3">
                Ekosistem Pembelajaran Thrivin
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold leading-tight mb-4">
                Website adalah tempat belajar. WhatsApp adalah tempat kamu bertumbuh setiap hari.
              </h2>
              <p className="text-brand-100 text-sm sm:text-base leading-relaxed max-w-xl">
                Tidak ada kurikulum yang bisa menggantikan hadirnya seorang teman yang mengenal konteks hidupmu. Kenali Nina, pendamping personal yang siap menemanimu dari saku celanamu.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 justify-center items-start lg:items-end">
              <Link
                href="/companion/nina"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-brand-900 hover:bg-brand-800 border-2 border-accent text-white font-bold text-sm transition-all shadow-glow hover:-translate-y-0.5"
              >
                <MessageCircle className="w-4 h-4 text-accent" />
                <span className="text-white">Pelajari Pendampingan Nina</span>
              </Link>
              <Link
                href="/path/wellness"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
              >
                <span>Mulai dari Silabus Wellness</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-surface-border py-8 text-center text-xs text-text-muted bg-surface">
        <p>© 2026 Thrivin. Never Grow Alone.</p>
      </footer>
    </div>
  );
}
