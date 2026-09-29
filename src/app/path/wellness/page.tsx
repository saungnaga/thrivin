"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dumbbell,
  Sparkles,
  Footprints,
  Salad,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  MessageCircle,
  ChevronRight,
  ChevronDown,
  Calculator,
  Compass
} from "lucide-react";
import {
  WELLNESS_TRACKS,
  WELLNESS_CHAPTERS,
  Chapter,
  TrackInfo
} from "@/data/wellness-curriculum";

export default function WellnessPathPage() {
  const [selectedTrackId, setSelectedTrackId] = useState<TrackInfo["id"]>("workout");
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [expandedChapterIds, setExpandedChapterIds] = useState<string[]>([
    WELLNESS_CHAPTERS[0].id,
  ]);

  // Scroll to top whenever active chapter changes
  useEffect(() => {
    if (activeChapterId && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeChapterId]);

  // TDEE Calculator state for interactive widget
  const [tdeeWeight, setTdeeWeight] = useState(65);
  const [tdeeHeight, setTdeeHeight] = useState(170);
  const [tdeeAge, setTdeeAge] = useState(25);
  const [tdeeGender, setTdeeGender] = useState<"pria" | "wanita">("pria");
  const [tdeeActivity, setTdeeActivity] = useState(1.375); // 3x / week

  const selectedTrack =
    WELLNESS_TRACKS.find((t) => t.id === selectedTrackId) || WELLNESS_TRACKS[0];

  const activeChapter = WELLNESS_CHAPTERS.find((c) => c.id === activeChapterId);

  // Toggle chapter accordion in syllabus view
  const toggleAccordion = (id: string) => {
    setExpandedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Calculate simple Harris-Benedict revised TDEE
  const calculateTDEE = () => {
    let bmr = 0;
    if (tdeeGender === "pria") {
      bmr = 10 * tdeeWeight + 6.25 * tdeeHeight - 5 * tdeeAge + 5;
    } else {
      bmr = 10 * tdeeWeight + 6.25 * tdeeHeight - 5 * tdeeAge - 161;
    }
    return Math.round(bmr * tdeeActivity);
  };

  const currentTDEE = calculateTDEE();

  // Helper for Track Icon
  const renderTrackIcon = (iconName: string, className = "w-5 h-5") => {
    switch (iconName) {
      case "Dumbbell":
        return <Dumbbell className={className} />;
      case "Sparkles":
        return <Sparkles className={className} />;
      case "Footprints":
        return <Footprints className={className} />;
      case "Salad":
        return <Salad className={className} />;
      default:
        return <Compass className={className} />;
    }
  };

  // WhatsApp helper
  const getWhatsAppUrl = (message: string) => {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  };

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
              <span>Kembali</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200/60 text-xs font-semibold text-brand-800">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              Wellness Path
            </span>
            <Link
              href="/companion/nina"
              className="inline-flex items-center gap-2 rounded-full bg-brand-900 text-white px-4 py-1.5 text-xs sm:text-sm font-bold hover:bg-brand-800 transition-all shadow-sm"
            >
              <MessageCircle className="w-4 h-4 text-accent" />
              <span>Kenali Nina</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero & Track Selection ─── */}
      <section className="bg-surface border-b border-surface-border pt-12 pb-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block text-xs font-bold uppercase tracking-[0.25em] text-accent mb-3">
              Open Curriculum
            </span>
            <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold text-text-primary tracking-tight mb-4">
              Smarter, Not Harder.
            </h1>
            <p className="text-text-secondary text-base sm:text-lg max-w-2xl mx-auto leading-relaxed mb-8">
              Sains kebugaran terstruktur dari nol sampai hasil nyata. Tanpa sistem login atau beban teknis — pelajari ilmunya, lalu terapkan di keseharian bersama Nina.
            </p>
          </motion.div>

          {/* 4 Tracks Navigation Tabs */}
          <div className="mt-8">
            <p className="text-xs uppercase tracking-wider font-semibold text-text-muted mb-4">
              Pilih Fokus Awal Kebutuhanmu:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
              {WELLNESS_TRACKS.map((track) => {
                const isSelected = track.id === selectedTrackId;
                return (
                  <button
                    key={track.id}
                    onClick={() => setSelectedTrackId(track.id)}
                    className={`flex flex-col items-center text-center p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-brand-900 text-white border-brand-900 shadow-md transform -translate-y-0.5"
                        : "bg-surface-muted border-surface-border text-text-secondary hover:bg-white hover:border-brand-200"
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl mb-2.5 transition-colors ${
                        isSelected
                          ? "bg-brand-800 text-accent"
                          : "bg-white text-brand-700 shadow-sm"
                      }`}
                    >
                      {renderTrackIcon(track.iconName, "w-6 h-6")}
                    </div>
                    <span
                      className={`font-semibold text-sm mb-1 ${
                        isSelected ? "text-white" : "text-text-primary"
                      }`}
                    >
                      {track.name}
                    </span>
                    <span
                      className={`text-[11px] line-clamp-1 ${
                        isSelected ? "text-brand-200" : "text-text-muted"
                      }`}
                    >
                      {track.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Track Banner */}
            <motion.div
              key={selectedTrack.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 rounded-xl bg-brand-50 border border-brand-200/80 max-w-3xl mx-auto flex items-center justify-between text-left gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-white text-brand-700 shadow-xs">
                  {renderTrackIcon(selectedTrack.iconName, "w-5 h-5")}
                </span>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-brand-800">
                    Fokus Terpilih: {selectedTrack.name}
                  </h2>
                  <p className="text-sm text-text-secondary">
                    {selectedTrack.heroIntro}
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-block text-xs font-semibold text-brand-700 px-3 py-1 rounded-full bg-white border border-brand-200 shrink-0">
                8 Bab Tersedia
              </span>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Main Content Area: Syllabus vs Active Reader ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {activeChapter ? (
          /* ═══════════════════════════════════════════════
             ACTIVE READER VIEW
             ═══════════════════════════════════════════════ */
          <div className="grid lg:grid-cols-[280px_1fr] gap-10 items-start">
            {/* Sidebar Syllabus Index */}
            <aside className="hidden lg:block sticky top-24 bg-surface p-5 rounded-2xl border border-surface-border">
              <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Daftar Isi Silabus
                </h3>
                <button
                  onClick={() => setActiveChapterId(null)}
                  className="text-xs text-brand-700 font-semibold hover:underline"
                >
                  Tutup Reader
                </button>
              </div>
              <nav className="space-y-1">
                {WELLNESS_CHAPTERS.map((ch) => {
                  const isActive = ch.id === activeChapter.id;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => setActiveChapterId(ch.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2.5 ${
                        isActive
                          ? "bg-brand-900 text-white font-semibold shadow-xs"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                          isActive
                            ? "bg-brand-800 text-accent"
                            : "bg-surface-muted text-text-muted"
                        }`}
                      >
                        {ch.num}
                      </span>
                      <span className="truncate">{ch.title}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Sidebar Nina Companion Quick Callout */}
              <div className="mt-8 p-4 rounded-xl bg-brand-50 border border-brand-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-brand-800 text-accent flex items-center justify-center text-xs font-bold">
                    N
                  </div>
                  <span className="text-xs font-bold text-brand-900">
                    Nina · Wellness Companion
                  </span>
                </div>
                <p className="text-[12px] text-text-secondary leading-snug mb-3">
                  Punya pertanyaan seputar bab yang sedang dibaca? Kirim pesan langsung ke Nina.
                </p>
                <Link
                  href="/companion/nina"
                  className="block text-center text-xs font-bold bg-brand-900 text-white py-2 rounded-lg hover:bg-brand-800 transition-colors shadow-xs"
                >
                  Pelajari Pendampingan Nina &rarr;
                </Link>
              </div>
            </aside>

            {/* Reader Main Content */}
            <article className="bg-surface p-6 sm:p-10 lg:p-12 rounded-3xl border border-surface-border shadow-xs max-w-4xl mx-auto w-full">
              {/* Reader Header */}
              <div className="pb-8 border-b border-surface-border mb-8">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <button
                    onClick={() => setActiveChapterId(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-700 hover:text-brand-900 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Kembali ke Silabus
                  </button>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {activeChapter.readTime}
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-brand-800 uppercase tracking-wider">
                      Bab {activeChapter.num} dari {WELLNESS_CHAPTERS.length}
                    </span>
                  </div>
                </div>

                <h1 className="font-serif text-3xl sm:text-4xl text-text-primary font-bold mb-3">
                  {activeChapter.title}
                </h1>
                <p className="text-accent-dark font-medium text-base sm:text-lg mb-6">
                  {activeChapter.tagline}
                </p>

                {/* Track specific lens */}
                <div className="p-4 rounded-2xl bg-surface-muted border border-surface-border flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-white text-brand-800 shadow-xs shrink-0 mt-0.5">
                    {renderTrackIcon(selectedTrack.iconName, "w-4 h-4")}
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-brand-900 mb-1">
                      Konteks {selectedTrack.name}: {activeChapter.trackAdaptations[selectedTrackId].subtitle}
                    </h2>
                    <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                      {activeChapter.trackAdaptations[selectedTrackId].application}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reader Body */}
              <div className="prose max-w-none text-text-secondary leading-relaxed space-y-8 font-sans">
                <p className="text-lg text-text-primary leading-relaxed font-serif italic border-l-4 border-accent pl-4 py-1">
                  &ldquo;{activeChapter.content.lead}&rdquo;
                </p>

                {activeChapter.content.sections.map((section, sIdx) => (
                  <section key={sIdx} className="space-y-4 pt-2">
                    <h2 className="font-serif text-2xl text-text-primary font-semibold">
                      {section.heading}
                    </h2>
                    {section.body.map((p, pIdx) => (
                      <p key={pIdx} className="text-base text-text-secondary">
                        {p}
                      </p>
                    ))}

                    {section.highlight && (
                      <div className="p-5 rounded-xl bg-brand-50 border-l-4 border-brand-700 text-brand-950 font-medium text-sm sm:text-base my-6">
                        {section.highlight}
                      </div>
                    )}

                    {section.table && (
                      <div className="overflow-x-auto my-6 border border-surface-border rounded-xl">
                        <table className="min-w-full text-left text-sm divide-y divide-surface-border">
                          <thead className="bg-surface-muted font-semibold text-text-primary">
                            <tr>
                              {section.table.headers.map((h, hIdx) => (
                                <th key={hIdx} className="px-4 py-3">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-border bg-white text-text-secondary">
                            {section.table.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-brand-50/40">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="px-4 py-3">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                ))}

                {/* Interactive TDEE Tool inside Chapter 2 */}
                {activeChapter.num === 2 && (
                  <div className="my-10 p-6 sm:p-8 rounded-2xl bg-brand-50 border border-brand-200">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Calculator className="w-5 h-5 text-accent-dark" />
                      <h3 className="font-serif text-xl font-bold text-brand-900">
                        Kalkulator TDEE Interaktif
                      </h3>
                    </div>
                    <p className="text-sm text-text-secondary mb-6">
                      Coba masukkan angka estimasi kondisimu sekarang untuk melihat kebutuhan energimu:
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                          Gender
                        </label>
                        <select
                          value={tdeeGender}
                          onChange={(e) => setTdeeGender(e.target.value as "pria" | "wanita")}
                          className="w-full bg-white border border-brand-200 rounded-lg p-2 text-sm text-text-primary outline-none"
                        >
                          <option value="pria">Pria</option>
                          <option value="wanita">Wanita</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                          Berat (kg)
                        </label>
                        <input
                          type="number"
                          value={tdeeWeight}
                          onChange={(e) => setTdeeWeight(Number(e.target.value))}
                          className="w-full bg-white border border-brand-200 rounded-lg p-2 text-sm text-text-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                          Tinggi (cm)
                        </label>
                        <input
                          type="number"
                          value={tdeeHeight}
                          onChange={(e) => setTdeeHeight(Number(e.target.value))}
                          className="w-full bg-white border border-brand-200 rounded-lg p-2 text-sm text-text-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                          Usia (thn)
                        </label>
                        <input
                          type="number"
                          value={tdeeAge}
                          onChange={(e) => setTdeeAge(Number(e.target.value))}
                          className="w-full bg-white border border-brand-200 rounded-lg p-2 text-sm text-text-primary outline-none"
                        />
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                        Tingkat Aktivitas
                      </label>
                      <select
                        value={tdeeActivity}
                        onChange={(e) => setTdeeActivity(Number(e.target.value))}
                        className="w-full bg-white border border-brand-200 rounded-lg p-2 text-sm text-text-primary outline-none"
                      >
                        <option value={1.2}>Sedentary (Kerja meja, jarang olahraga)</option>
                        <option value={1.375}>Ringan (Olahraga santai 1-3x seminggu)</option>
                        <option value={1.55}>Moderat (Olahraga aktif 3-5x seminggu)</option>
                        <option value={1.725}>Sangat Aktif (Latihan keras 6-7x seminggu)</option>
                      </select>
                    </div>

                    {/* Result Card */}
                    <div className="p-4 rounded-xl bg-white border border-brand-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-text-muted font-semibold">
                          Estimasi TDEE Harianmu:
                        </span>
                        <div className="text-3xl font-black text-brand-900 mt-0.5">
                          {currentTDEE} <span className="text-sm font-normal text-text-secondary">kkal/hari</span>
                        </div>
                      </div>
                      <div className="text-xs text-text-secondary space-y-1">
                        <div>• Defisit Lemak: ~<strong>{currentTDEE - 400} kkal</strong></div>
                        <div>• Target Protein: ~<strong>{Math.round(tdeeWeight * 1.8)} gram/hari</strong></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Practical Example according to Track */}
                <div className="my-8 p-5 rounded-2xl bg-surface-muted border border-surface-border">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-900 mb-2">
                    💡 Contoh Nyata pada {selectedTrack.name}:
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {activeChapter.trackAdaptations[selectedTrackId].practicalExample}
                  </p>
                </div>

                {/* Key Takeaways */}
                <div className="my-8 p-6 rounded-2xl bg-white border border-surface-border">
                  <h3 className="font-serif text-lg font-bold text-text-primary mb-3">
                    Yang Perlu Kamu Ingat dari Bab Ini:
                  </h3>
                  <ul className="space-y-2">
                    {activeChapter.content.keyTakeaways.map((point, kIdx) => (
                      <li key={kIdx} className="flex items-start gap-2.5 text-sm text-text-secondary">
                        <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* ─── Super Soft Selling Psychological Hook: Talk to Nina ─── */}
              <div className="mt-12 p-6 sm:p-8 rounded-3xl bg-brand-950 text-white relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
                      Saatnya Menerapkan ke Hidupmu
                    </span>
                  </div>

                  <h3 className="font-serif text-2xl sm:text-3xl font-bold mb-3">
                    Ilmunya sudah kamu tahu. Tapi bagaimana di kondisimu sendiri?
                  </h3>
                  <p className="text-brand-100 text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">
                    {activeChapter.ninaMoment.context}
                  </p>

                  {/* Simulated User to Nina Chat Bubble */}
                  <div className="bg-brand-900/90 border border-brand-800 rounded-2xl p-4 mb-6 max-w-xl">
                    <span className="text-[11px] uppercase tracking-wider text-accent font-semibold block mb-1">
                      Contoh obrolan santai yang bisa kamu bawa ke Nina:
                    </span>
                    <p className="text-sm font-medium text-white italic">
                      {activeChapter.ninaMoment.userPrompt}
                    </p>
                  </div>

                  <p className="text-xs sm:text-sm text-brand-200 mb-6 max-w-xl leading-relaxed">
                    {activeChapter.ninaMoment.ninaValue}
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Link
                      href="/companion/nina"
                      className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-brand-900 hover:bg-brand-800 border-2 border-accent text-white font-bold text-sm transition-all shadow-glow hover:-translate-y-0.5"
                    >
                      <Sparkles className="w-4 h-4 text-accent" />
                      <span className="text-white">Pelajari Pendampingan Nina</span>
                    </Link>
                    <span className="text-xs text-brand-200 text-center sm:text-left">
                      Bisa kirim foto makanan & screenshot Strava di WhatsApp.
                    </span>
                  </div>
                </div>
              </div>

              {/* Next / Previous Chapter Navigation */}
              <div className="mt-12 pt-8 border-t border-surface-border flex items-center justify-between gap-4">
                {activeChapter.num > 1 ? (
                  <button
                    onClick={() => {
                      const prevCh = WELLNESS_CHAPTERS[activeChapter.num - 2];
                      if (prevCh) setActiveChapterId(prevCh.id);
                    }}
                    className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-text-secondary hover:text-brand-900 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Bab {activeChapter.num - 1}</span>
                  </button>
                ) : (
                  <div />
                )}

                {activeChapter.num < WELLNESS_CHAPTERS.length ? (
                  <button
                    onClick={() => {
                      const nextCh = WELLNESS_CHAPTERS[activeChapter.num];
                      if (nextCh) setActiveChapterId(nextCh.id);
                    }}
                    className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-brand-800 hover:text-brand-950 transition-colors"
                  >
                    <span>Bab {activeChapter.num + 1}: {WELLNESS_CHAPTERS[activeChapter.num].title}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <Link
                    href="/companion/nina"
                    className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-accent-dark hover:text-accent transition-colors"
                  >
                    <span>Mulai Berproses Bersama Nina &rarr;</span>
                  </Link>
                )}
              </div>
            </article>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════
             OPEN SYLLABUS ROADMAP VIEW
             ═══════════════════════════════════════════════ */
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-text-primary">
                  Silabus & Roadmap Pembelajaran
                </h2>
                <p className="text-sm text-text-secondary mt-1">
                  8 modul berbasis sains yang bisa kamu baca sesuai urutan tanpa perlu mendaftar.
                </p>
              </div>
              <span className="hidden sm:inline-block text-xs font-semibold px-3 py-1 rounded-full bg-surface border border-surface-border text-text-muted">
                Gratis & Terbuka
              </span>
            </div>

            {/* Chapters Accordion / List */}
            <div className="space-y-4">
              {WELLNESS_CHAPTERS.map((chapter) => {
                const isExpanded = expandedChapterIds.includes(chapter.id);
                const trackData = chapter.trackAdaptations[selectedTrackId];

                return (
                  <motion.div
                    key={chapter.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-surface-border bg-surface overflow-hidden shadow-xs hover:border-brand-200 transition-colors"
                  >
                    {/* Header Row */}
                    <div
                      onClick={() => toggleAccordion(chapter.id)}
                      className="p-5 sm:p-6 flex items-start justify-between gap-4 cursor-pointer select-none"
                    >
                      <div className="flex items-start gap-4">
                        <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-brand-200/50">
                          0{chapter.num}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="font-serif text-lg sm:text-xl font-bold text-text-primary">
                              {chapter.title}
                            </h3>
                            <span className="text-[11px] text-text-muted flex items-center gap-1 font-sans">
                              <Clock className="w-3 h-3" />
                              {chapter.readTime}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-text-secondary leading-snug">
                            {chapter.tagline}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveChapterId(chapter.id);
                          }}
                          className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-900 text-white hover:bg-brand-800 transition-colors"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          Baca Bab
                        </button>
                        <span className="p-1 text-text-muted">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-brand-700" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Accordion Content Preview */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="border-t border-surface-border bg-surface-muted/60 px-5 sm:px-6 py-5 space-y-4"
                        >
                          {/* Core Takeaway */}
                          <div className="p-3.5 rounded-xl bg-white border border-surface-border text-xs sm:text-sm text-text-secondary">
                            <span className="font-semibold text-brand-900 block mb-1">
                              Prinsip Inti:
                            </span>
                            &ldquo;{chapter.corePrinciple}&rdquo;
                          </div>

                          {/* Track Adaptation Preview */}
                          <div className="flex items-start gap-3 text-xs sm:text-sm text-text-secondary">
                            <div className="p-1.5 rounded-lg bg-brand-100/60 text-brand-800 shrink-0 mt-0.5">
                              {renderTrackIcon(selectedTrack.iconName, "w-4 h-4")}
                            </div>
                            <div>
                              <span className="font-semibold text-text-primary">
                                Pada {selectedTrack.name}:{" "}
                              </span>
                              <span>{trackData.application}</span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                            <button
                              onClick={() => setActiveChapterId(chapter.id)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand-900 text-white text-xs sm:text-sm font-semibold hover:bg-brand-800 transition-all shadow-xs"
                            >
                              <BookOpen className="w-4 h-4" />
                              Buka & Baca Bab Ini
                            </button>

                            {/* Soft-sell Nina link */}
                            <Link
                              href="/companion/nina"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-dark hover:text-brand-900 transition-colors"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-accent" />
                              <span>Pelajari pendampingan Nina</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            {/* ─── Bottom Soft-Sell Banner: The Companionship Bridge ─── */}
            <div className="mt-14 p-8 sm:p-10 rounded-3xl bg-brand-950 text-white relative overflow-hidden shadow-xl text-center sm:text-left">
              <div className="grid sm:grid-cols-[1fr_auto] gap-8 items-center relative z-10">
                <div>
                  <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-accent mb-2">
                    Kenapa Belajar Sendirian Sering Mentok?
                  </span>
                  <h3 className="font-serif text-2xl sm:text-3xl font-bold leading-tight mb-3">
                    Mengetahui apa yang harus dilakukan tidak sama dengan mampu menjalaninya sendirian.
                  </h3>
                  <p className="text-brand-100 text-sm sm:text-base leading-relaxed max-w-xl">
                    Silabus di atas memberi kamu arah dan logika sainsnya. Tapi di kehidupan nyata, ada lembur mendadak, godaan makan malam, dan rasa malas. Di sanalah Nina hadir di WhatsApp saku celanamu.
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-center sm:items-end gap-3">
                  <Link
                    href="/companion/nina"
                    className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-brand-900 hover:bg-brand-800 border-2 border-accent text-white font-bold text-sm transition-all shadow-glow hover:-translate-y-0.5"
                  >
                    <MessageCircle className="w-5 h-5 text-accent" />
                    <span className="text-white font-bold">Pelajari Pendampingan Nina</span>
                  </Link>
                  <span className="text-[11px] text-brand-300">
                    Mulai Rp 79rb/bln · Tanpa instal aplikasi baru
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── Simple Curriculum Footer ─── */}
      <footer className="mt-20 border-t border-surface-border py-8 text-center text-xs text-text-muted bg-surface">
        <p>© 2026 Thrivin. Science-Based Wellness. Never Grow Alone.</p>
      </footer>
    </div>
  );
}
