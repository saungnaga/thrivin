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
  ChevronDown,
  Calculator,
  Compass,
  Search,
  Check,
  ArrowUp,
  Layers,
  SlidersHorizontal,
  Bookmark,
  UserPlus
} from "lucide-react";
import {
  WELLNESS_TRACKS,
  WELLNESS_CHAPTERS,
  TrackInfo
} from "@/data/wellness-curriculum";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function NinaLearningHubPage() {
  const { user } = useAuth();
  const hasNina = Boolean(user && user.activeCompanion === "nina");
  const ninaCtaUrl = hasNina ? "/dashboard" : "/companion/nina/onboarding/1";
  const [selectedTrackId, setSelectedTrackId] = useState<TrackInfo["id"]>("workout");
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  // Accordion expanded state (Chapter 1 expanded by default)
  const [expandedChapterIds, setExpandedChapterIds] = useState<string[]>([
    WELLNESS_CHAPTERS[0].id,
  ]);

  // Search & Filter state for syllabus
  const [searchQuery, setSearchQuery] = useState("");

  // Gamified Learning Progress (Persistent in localStorage)
  const [completedChapters, setCompletedChapters] = useState<string[]>([]);

  // Reader experience controls: font size ("sm" | "base" | "lg")
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Load completed chapters from localStorage on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("thrivin_completed_chapters");
        if (saved) {
          setCompletedChapters(JSON.parse(saved));
        }
      } catch (err) {
        console.error("Failed to load completed chapters:", err);
      }
    }
  }, []);

  // Scroll to top whenever active chapter changes
  useEffect(() => {
    if (activeChapterId && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeChapterId]);

  // Track window scroll progress for reader mode & back to top button
  useEffect(() => {
    const handleScroll = () => {
      if (typeof window === "undefined") return;
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const current = Math.min(Math.max((window.scrollY / totalHeight) * 100, 0), 100);
        setScrollProgress(current);
      }
      setShowBackToTop(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeChapterId]);

  // TDEE Calculator state for interactive widget in Chapter 2
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

  // Toggle expand / collapse all chapters
  const toggleAllAccordions = () => {
    if (expandedChapterIds.length === WELLNESS_CHAPTERS.length) {
      setExpandedChapterIds([]);
    } else {
      setExpandedChapterIds(WELLNESS_CHAPTERS.map((c) => c.id));
    }
  };

  // Toggle Mark Chapter as Completed
  const toggleChapterCompleted = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCompletedChapters((prev) => {
      const updated = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("thrivin_completed_chapters", JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to save completed chapters:", err);
        }
      }
      return updated;
    });
  };

  // Filter chapters based on search query
  const filteredChapters = WELLNESS_CHAPTERS.filter((chapter) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const trackAdapt = chapter.trackAdaptations[selectedTrackId];
    return (
      chapter.title.toLowerCase().includes(q) ||
      chapter.tagline.toLowerCase().includes(q) ||
      chapter.corePrinciple.toLowerCase().includes(q) ||
      (trackAdapt && trackAdapt.application.toLowerCase().includes(q))
    );
  });

  // Calculate Mifflin-St Jeor TDEE
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

  // Font size class mapping
  const getProseFontSizeClass = () => {
    switch (fontSize) {
      case "sm":
        return "text-[15px] leading-relaxed";
      case "lg":
        return "text-[19px] leading-loose";
      default:
        return "text-[16.5px] leading-relaxed";
    }
  };

  const progressPercentage = Math.round(
    (completedChapters.length / WELLNESS_CHAPTERS.length) * 100
  );

  return (
    <div className="min-h-screen bg-surface-muted text-text-primary selection:bg-brand-100 selection:text-brand-900 font-sans flex flex-col">
      <Navbar />

      {/* ─── Reading Scroll Progress Bar (Visible in Reader Mode) ─── */}
      {activeChapter && (
        <div className="fixed top-[76px] left-0 right-0 h-1 bg-surface-border z-40">
          <div
            className="h-full bg-linear-to-r from-brand-700 via-accent to-accent-light transition-all duration-150 ease-out"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      )}

      {/* ─── Hero & Track Selection (Only on Syllabus view) ─── */}
      {!activeChapter && (
        <section className="bg-surface border-b border-surface-border pt-28 pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            {/* Breadcrumb back to Nina */}
            <div className="flex justify-center mb-4">
              <Link
                href="/companion/nina"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-brand-900 transition-colors py-1 px-3 rounded-full bg-surface-muted border border-surface-border shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Halaman Utama Nina</span>
              </Link>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-accent-dark mb-3 bg-brand-50 px-3 py-1 rounded-full border border-brand-200/80 font-mono">
                <BookOpen className="w-3.5 h-3.5" />
                Nina Knowledge Hub · Kurikulum Terbuka
              </span>
              <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold text-text-primary tracking-tight mb-4">
                Sains Wellness Nina.
              </h1>
              <p className="text-text-secondary text-base sm:text-lg max-w-2xl mx-auto leading-relaxed mb-6">
                Semua prinsip sains yang digunakan Nina di WhatsApp tersedia gratis di sini. Pahami logikanya, lalu terapkan di keseharianmu bersama Nina.
              </p>
            </motion.div>

            {/* Guest vs User Signup Banner */}
            {!user ? (
              <div className="max-w-2xl mx-auto mb-6 p-3.5 rounded-2xl bg-brand-50 border border-brand-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-brand-950 shadow-2xs">
                <div className="flex items-center gap-2 text-left">
                  <UserPlus className="w-4 h-4 text-accent-dark shrink-0" />
                  <span>
                    Kamu sedang membaca sebagai <strong>Tamu</strong>. Daftar akun untuk menyimpan progres membaca & akses dashboard.
                  </span>
                </div>
                <Link
                  href="/signup"
                  className="px-4 py-1.5 rounded-full bg-brand-900 text-white font-bold text-xs hover:bg-brand-800 transition-colors shrink-0 shadow-xs"
                >
                  Daftar Gratis
                </Link>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto mb-6 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-900">
                <Check className="w-4 h-4 text-emerald-700" />
                <span>Halo {user.username}! Progres membacamu tersimpan otomatis di akunmu.</span>
              </div>
            )}

            {/* 4 Tracks Navigation Tabs */}
            <div className="mt-4">
              <div className="flex items-center justify-center gap-2 mb-3">
                <SlidersHorizontal className="w-3.5 h-3.5 text-accent-dark" />
                <span className="text-xs uppercase tracking-wider font-bold text-text-secondary">
                  Sesuaikan Contoh Bab Berdasarkan Fokusmu:
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
                {WELLNESS_TRACKS.map((track) => {
                  const isSelected = track.id === selectedTrackId;
                  return (
                    <button
                      key={track.id}
                      onClick={() => setSelectedTrackId(track.id)}
                      className={`flex flex-col items-center text-center p-3 sm:p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                        isSelected
                          ? "bg-brand-900 text-white border-brand-900 shadow-md transform -translate-y-0.5 ring-2 ring-accent/30"
                          : "bg-surface-muted border-surface-border text-text-secondary hover:bg-white hover:border-brand-300"
                      }`}
                    >
                      <div
                        className={`p-2 rounded-xl mb-1.5 transition-colors ${
                          isSelected
                            ? "bg-brand-800 text-accent"
                            : "bg-white text-brand-800 shadow-xs"
                        }`}
                      >
                        {renderTrackIcon(track.iconName, "w-4 h-4")}
                      </div>
                      <span
                        className={`font-bold text-xs sm:text-sm mb-0.5 ${
                          isSelected ? "text-white" : "text-text-primary"
                        }`}
                      >
                        {track.name}
                      </span>
                      <span
                        className={`text-[10px] sm:text-[11px] line-clamp-1 ${
                          isSelected ? "text-brand-200" : "text-text-muted"
                        }`}
                      >
                        {track.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── Main Content Area: Syllabus vs Active Reader ─── */}
      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${activeChapter ? "pt-24" : ""}`}>
        {activeChapter ? (
          /* ═══════════════════════════════════════════════
             ACTIVE READER VIEW
             ═══════════════════════════════════════════════ */
          <div className="grid lg:grid-cols-[280px_1fr] gap-8 lg:gap-10 items-start">
            {/* Sidebar Syllabus Index */}
            <aside className="hidden lg:block sticky top-28 bg-surface p-5 rounded-2xl border border-surface-border shadow-xs">
              <div className="flex items-center justify-between pb-3.5 border-b border-surface-border mb-3.5">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-accent-dark" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                    Daftar Bab
                  </h3>
                </div>
                <button
                  onClick={() => setActiveChapterId(null)}
                  className="text-xs text-brand-800 font-bold hover:underline cursor-pointer"
                >
                  Tutup Reader
                </button>
              </div>

              {/* Progress */}
              <div className="mb-4 p-3 rounded-xl bg-surface-muted border border-surface-border">
                <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary mb-1.5">
                  <span>Progres Membaca</span>
                  <span className="font-mono text-brand-900 font-bold">{progressPercentage}%</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-brand-900 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              <nav className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                {WELLNESS_CHAPTERS.map((ch) => {
                  const isActive = ch.id === activeChapter.id;
                  const isCompleted = completedChapters.includes(ch.id);

                  return (
                    <button
                      key={ch.id}
                      onClick={() => setActiveChapterId(ch.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isActive
                          ? "bg-brand-900 text-white font-bold shadow-xs"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-mono ${
                            isActive
                              ? "bg-brand-800 text-accent font-bold"
                              : isCompleted
                              ? "bg-emerald-100 text-emerald-800 font-bold"
                              : "bg-surface-muted text-text-muted"
                          }`}
                        >
                          {isCompleted ? "✓" : ch.num}
                        </span>
                        <span className="truncate">{ch.title}</span>
                      </div>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-6 p-4 rounded-xl bg-brand-50 border border-brand-200/80">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-brand-900 text-accent flex items-center justify-center text-xs font-bold">
                    N
                  </div>
                  <span className="text-xs font-bold text-brand-950">
                    Nina · Wellness Companion
                  </span>
                </div>
                <p className="text-[11px] text-text-secondary leading-snug mb-3">
                  Bingung cara menerapkan bab ini? Tanya langsung ke Nina di WhatsApp.
                </p>
                <Link
                  href={ninaCtaUrl}
                  className="block text-center text-xs font-bold bg-brand-900 text-white py-2 rounded-lg hover:bg-brand-800 transition-colors shadow-xs"
                >
                  {hasNina ? "Buka Dashboard Nina →" : "Mulai dengan Nina →"}
                </Link>
              </div>
            </aside>

            {/* Reader Main Article */}
            <article className="bg-surface p-5 sm:p-8 lg:p-12 rounded-3xl border border-surface-border shadow-xs max-w-4xl mx-auto w-full">
              {/* Comfort Control Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-surface-border mb-6">
                <button
                  onClick={() => setActiveChapterId(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-800 hover:text-brand-950 transition-colors py-1.5 px-3 rounded-full bg-surface-muted hover:bg-brand-50 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali ke Silabus</span>
                </button>

                {/* Font Size & Completion Controls */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-surface-muted border border-surface-border rounded-full p-0.5 text-xs font-bold">
                    <button
                      onClick={() => setFontSize("sm")}
                      title="Teks Kecil"
                      className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                        fontSize === "sm" ? "bg-white text-brand-950 shadow-xs" : "text-text-muted"
                      }`}
                    >
                      A-
                    </button>
                    <button
                      onClick={() => setFontSize("base")}
                      title="Teks Normal"
                      className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                        fontSize === "base" ? "bg-white text-brand-950 shadow-xs" : "text-text-muted"
                      }`}
                    >
                      A
                    </button>
                    <button
                      onClick={() => setFontSize("lg")}
                      title="Teks Besar"
                      className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                        fontSize === "lg" ? "bg-white text-brand-950 shadow-xs" : "text-text-muted"
                      }`}
                    >
                      A+
                    </button>
                  </div>

                  <button
                    onClick={() => toggleChapterCompleted(activeChapter.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      completedChapters.includes(activeChapter.id)
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs"
                        : "bg-surface-muted hover:bg-brand-50 text-text-secondary hover:text-brand-900 border border-surface-border"
                    }`}
                  >
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${
                        completedChapters.includes(activeChapter.id)
                          ? "text-emerald-700 fill-emerald-100"
                          : "text-text-muted"
                      }`}
                    />
                    <span>
                      {completedChapters.includes(activeChapter.id)
                        ? "Selesai Dibaca"
                        : "Tandai Selesai"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Title & Meta */}
              <div className="mb-8">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted mb-3 font-mono">
                  <span className="px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-900 font-bold border border-brand-200">
                    Bab 0{activeChapter.num} dari {WELLNESS_CHAPTERS.length}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    {activeChapter.readTime}
                  </span>
                </div>

                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-brand-950 font-bold tracking-tight mb-3">
                  {activeChapter.title}
                </h1>
                <p className="text-accent-dark font-semibold text-base sm:text-lg mb-6 leading-snug">
                  {activeChapter.tagline}
                </p>

                {/* Track Context */}
                <div className="p-4 rounded-2xl bg-brand-50/70 border border-brand-200/90 flex items-start gap-3.5 shadow-xs">
                  <div className="p-2 rounded-xl bg-white text-brand-900 shadow-xs shrink-0 mt-0.5">
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

              {/* Body */}
              <div className={`space-y-8 text-text-secondary ${getProseFontSizeClass()}`}>
                <div className="p-4 sm:p-5 rounded-2xl bg-surface-muted border-l-4 border-accent text-text-primary font-serif italic text-lg sm:text-xl leading-relaxed">
                  &ldquo;{activeChapter.content.lead}&rdquo;
                </div>

                {activeChapter.content.sections.map((section, sIdx) => (
                  <section key={sIdx} className="space-y-4 pt-4">
                    <h2 className="font-serif text-2xl sm:text-3xl text-brand-950 font-bold tracking-tight">
                      {section.heading}
                    </h2>
                    {section.body.map((p, pIdx) => (
                      <p key={pIdx} className="text-text-secondary leading-relaxed">
                        {p}
                      </p>
                    ))}

                    {section.highlight && (
                      <div className="p-5 sm:p-6 rounded-2xl bg-brand-50 border-l-4 border-brand-800 text-brand-950 font-medium my-6 shadow-xs leading-relaxed">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-dark mb-1 font-sans">
                          <Sparkles className="w-3.5 h-3.5" />
                          Prinsip Kunci:
                        </div>
                        {section.highlight}
                      </div>
                    )}

                    {section.table && (
                      <div className="overflow-x-auto my-6 border border-surface-border rounded-2xl shadow-xs">
                        <table className="min-w-full text-left text-sm divide-y divide-surface-border">
                          <thead className="bg-surface-muted font-bold text-brand-950">
                            <tr>
                              {section.table.headers.map((h, hIdx) => (
                                <th key={hIdx} className="px-4 py-3.5">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-border bg-white text-text-secondary">
                            {section.table.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-brand-50/50 transition-colors">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="px-4 py-3 font-medium">
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

                {/* TDEE Interactive Tool in Chapter 2 */}
                {activeChapter.num === 2 && (
                  <div className="my-10 p-6 sm:p-8 rounded-3xl bg-brand-50 border border-brand-200/90 shadow-sm">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-white text-brand-900 flex items-center justify-center shadow-xs">
                        <Calculator className="w-5 h-5 text-accent-dark" />
                      </div>
                      <div>
                        <h3 className="font-serif text-xl font-bold text-brand-950">
                          Kalkulator TDEE Interaktif
                        </h3>
                        <p className="text-xs text-text-secondary">
                          Coba estimasikan angka kondisimu sekarang untuk melihat kebutuhan energimu:
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 my-6">
                      <div>
                        <label className="block text-xs font-bold text-brand-950 uppercase tracking-wider mb-1.5">
                          Gender
                        </label>
                        <select
                          value={tdeeGender}
                          onChange={(e) => setTdeeGender(e.target.value as "pria" | "wanita")}
                          className="w-full bg-white border border-brand-200 rounded-xl p-2.5 text-sm font-semibold text-brand-950 outline-none"
                        >
                          <option value="pria">Pria</option>
                          <option value="wanita">Wanita</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-brand-950 uppercase tracking-wider mb-1.5">
                          Berat (kg)
                        </label>
                        <input
                          type="number"
                          value={tdeeWeight}
                          onChange={(e) => setTdeeWeight(Number(e.target.value))}
                          className="w-full bg-white border border-brand-200 rounded-xl p-2.5 text-sm font-semibold text-brand-950 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-brand-950 uppercase tracking-wider mb-1.5">
                          Tinggi (cm)
                        </label>
                        <input
                          type="number"
                          value={tdeeHeight}
                          onChange={(e) => setTdeeHeight(Number(e.target.value))}
                          className="w-full bg-white border border-brand-200 rounded-xl p-2.5 text-sm font-semibold text-brand-950 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-brand-950 uppercase tracking-wider mb-1.5">
                          Usia (thn)
                        </label>
                        <input
                          type="number"
                          value={tdeeAge}
                          onChange={(e) => setTdeeAge(Number(e.target.value))}
                          className="w-full bg-white border border-brand-200 rounded-xl p-2.5 text-sm font-semibold text-brand-950 outline-none"
                        />
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-xs font-bold text-brand-950 uppercase tracking-wider mb-1.5">
                        Tingkat Aktivitas Fisik
                      </label>
                      <select
                        value={tdeeActivity}
                        onChange={(e) => setTdeeActivity(Number(e.target.value))}
                        className="w-full bg-white border border-brand-200 rounded-xl p-2.5 text-sm font-semibold text-brand-950 outline-none"
                      >
                        <option value={1.2}>Sedentari (Kerja meja, minim gerak)</option>
                        <option value={1.375}>Ringan (Olahraga santai 1–3x seminggu)</option>
                        <option value={1.55}>Moderat (Olahraga aktif 3–5x seminggu)</option>
                        <option value={1.725}>Sangat Aktif (Latihan keras 6–7x seminggu)</option>
                      </select>
                    </div>

                    <div className="p-5 rounded-2xl bg-white border border-brand-200 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-text-muted font-bold block mb-1">
                          Estimasi Kebutuhan Kalori Harian (TDEE):
                        </span>
                        <div className="text-3xl font-black text-brand-900">
                          ~{currentTDEE} <span className="text-sm font-normal text-text-secondary">kkal/hari</span>
                        </div>
                      </div>
                      <div className="text-xs text-text-secondary space-y-1 sm:text-right">
                        <div>• Defisit Lemak Sehat: ~<strong className="text-brand-900">{currentTDEE - 400} kkal</strong></div>
                        <div>• Target Protein: ~<strong className="text-brand-900">{Math.round(tdeeWeight * 1.8)} gram/hari</strong></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Practical Example */}
                <div className="my-8 p-5 sm:p-6 rounded-2xl bg-surface-muted border border-surface-border">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-900 mb-2">
                    💡 Aplikasi Nyata pada {selectedTrack.name}:
                  </h3>
                  <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
                    {activeChapter.trackAdaptations[selectedTrackId].practicalExample}
                  </p>
                </div>

                {/* Takeaways */}
                <div className="my-8 p-6 sm:p-7 rounded-2xl bg-white border border-brand-200/90 shadow-xs">
                  <h3 className="font-serif text-lg sm:text-xl font-bold text-brand-950 mb-4 flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-accent-dark" />
                    <span>Yang Perlu Kamu Ingat dari Bab Ini:</span>
                  </h3>
                  <ul className="space-y-3">
                    {activeChapter.content.keyTakeaways.map((point, kIdx) => (
                      <li key={kIdx} className="flex items-start gap-3 text-sm sm:text-base text-text-secondary">
                        <CheckCircle2 className="w-5 h-5 text-accent-dark shrink-0 mt-0.5" />
                        <span className="leading-snug">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Bottom Hook to Nina */}
              <div className="mt-12 p-6 sm:p-8 rounded-3xl bg-brand-950 text-white relative overflow-hidden shadow-xl">
                <div className="relative z-10">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent block mb-2 font-mono">
                    Saatnya Terapkan di Keseharian
                  </span>
                  <h3 className="font-serif text-2xl sm:text-3xl font-bold mb-3">
                    Ilmunya sudah kamu tahu. Biarkan Nina yang menjaga konsistensimu.
                  </h3>
                  <p className="text-brand-100 text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">
                    {activeChapter.ninaMoment.context}
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Link
                      href={ninaCtaUrl}
                      className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-accent text-brand-950 hover:bg-white hover:text-brand-950 font-bold text-sm transition-all shadow-glow hover:scale-105"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{hasNina ? "Buka Dashboard Nina" : "Mulai Onboarding dengan Nina"}</span>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Bottom Nav */}
              <div className="mt-12 pt-8 border-t border-surface-border">
                <div className="grid sm:grid-cols-2 gap-4">
                  {activeChapter.num > 1 ? (
                    <button
                      onClick={() => {
                        const prevCh = WELLNESS_CHAPTERS[activeChapter.num - 2];
                        if (prevCh) setActiveChapterId(prevCh.id);
                      }}
                      className="p-4 rounded-2xl border border-surface-border hover:border-brand-300 bg-surface-muted text-left transition-all flex items-center gap-3 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <div className="truncate">
                        <span className="text-[10px] uppercase text-text-muted block">Bab Sebelumnya</span>
                        <span className="text-xs sm:text-sm font-bold text-brand-950 truncate block">
                          Bab {activeChapter.num - 1}: {WELLNESS_CHAPTERS[activeChapter.num - 2].title}
                        </span>
                      </div>
                    </button>
                  ) : <div />}

                  {activeChapter.num < WELLNESS_CHAPTERS.length ? (
                    <button
                      onClick={() => {
                        if (!completedChapters.includes(activeChapter.id)) {
                          toggleChapterCompleted(activeChapter.id);
                        }
                        const nextCh = WELLNESS_CHAPTERS[activeChapter.num];
                        if (nextCh) setActiveChapterId(nextCh.id);
                      }}
                      className="p-4 rounded-2xl bg-brand-900 text-white text-right hover:bg-brand-800 transition-all flex items-center justify-end gap-3 cursor-pointer shadow-sm"
                    >
                      <div className="truncate text-left sm:text-right">
                        <span className="text-[10px] uppercase text-brand-200 block">Selesai & Lanjut</span>
                        <span className="text-xs sm:text-sm font-bold text-white truncate block">
                          Bab {activeChapter.num + 1}: {WELLNESS_CHAPTERS[activeChapter.num].title}
                        </span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-accent shrink-0" />
                    </button>
                  ) : (
                    <Link
                      href={ninaCtaUrl}
                      className="p-4 rounded-2xl bg-linear-to-r from-brand-900 to-brand-950 text-white text-right hover:opacity-95 transition-all flex items-center justify-end gap-3 cursor-pointer shadow-glow"
                    >
                      <div>
                        <span className="text-[10px] uppercase text-accent block">Selesai 8 Bab!</span>
                        <span className="text-xs sm:text-sm font-bold text-white block">
                          {hasNina ? "Ke Dashboard Nina →" : "Mulai Bersama Nina →"}
                        </span>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            </article>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════
             OPEN SYLLABUS LIST
             ═══════════════════════════════════════════════ */
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Gamified Learning Progress Banner */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white border border-brand-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-accent-dark">
                    Progres Membaca:
                  </span>
                  <span className="text-xs font-mono font-bold text-brand-900 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                    {completedChapters.length} dari {WELLNESS_CHAPTERS.length} Bab Selesai ({progressPercentage}%)
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  {completedChapters.length === 0
                    ? "Mulai baca Bab 1 untuk memahami fondasi metabolisme tubuhmu."
                    : completedChapters.length === WELLNESS_CHAPTERS.length
                    ? "🎉 Luar biasa! Kamu sudah menyelesaikan seluruh kurikulum sains wellness Nina."
                    : "Lanjutkan bab berikutnya untuk membangun kebiasaan yang berakar pada sains."}
                </p>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3 max-w-md">
                  <div
                    className="bg-brand-900 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              {completedChapters.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm("Reset tanda progres membaca?")) {
                      setCompletedChapters([]);
                      try {
                        localStorage.removeItem("thrivin_completed_chapters");
                      } catch {}
                    }
                  }}
                  className="text-[11px] font-semibold text-text-muted hover:text-rose-600 transition-colors self-start sm:self-center cursor-pointer"
                >
                  Reset Progres
                </button>
              )}
            </div>

            {/* Syllabus Header & Search / Toolbar Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <div>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950">
                  Silabus & Modul Pembelajaran
                </h2>
                <p className="text-xs sm:text-sm text-text-secondary mt-1">
                  8 modul sains teruji yang bisa kamu baca kapan pun tanpa perlu langganan.
                </p>
              </div>

              <button
                onClick={toggleAllAccordions}
                className="px-3.5 py-1.5 rounded-full border border-surface-border bg-white text-xs font-bold text-text-secondary hover:text-brand-900 transition-all shadow-xs cursor-pointer self-start sm:self-auto"
              >
                {expandedChapterIds.length === WELLNESS_CHAPTERS.length
                  ? "Tutup Semua Bab"
                  : "Buka Semua Pratinjau"}
              </button>
            </div>

            {/* Real-time Search Input Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari topik (contoh: kalori, protein, progresif, pemulihan, deload, tidur)..."
                className="w-full pl-11 pr-10 py-3 rounded-2xl bg-white border border-surface-border text-sm text-brand-950 placeholder:text-text-muted/70 focus:outline-none focus:border-brand-900 shadow-xs transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted hover:text-brand-900 cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>

            {/* Chapters Accordion / List */}
            <div className="space-y-4">
              {filteredChapters.map((chapter) => {
                const isExpanded = expandedChapterIds.includes(chapter.id);
                const isCompleted = completedChapters.includes(chapter.id);
                const trackData = chapter.trackAdaptations[selectedTrackId];

                return (
                  <motion.div
                    key={chapter.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-2xl transition-all duration-200 overflow-hidden ${
                      isExpanded
                        ? "bg-white border-2 border-brand-400 ring-4 ring-brand-900/5 shadow-md border-l-4 border-l-brand-800"
                        : "bg-surface border border-surface-border hover:border-brand-200/90 shadow-xs hover:shadow-sm"
                    }`}
                  >
                    {/* Header Row */}
                    <div
                      onClick={() => toggleAccordion(chapter.id)}
                      className={`p-5 sm:p-6 flex items-start justify-between gap-4 cursor-pointer select-none transition-colors ${
                        isExpanded ? "bg-brand-50/40" : "hover:bg-brand-50/20"
                      }`}
                    >
                      <div className="flex items-start gap-3.5 sm:gap-4">
                        <div
                          className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 font-mono text-xs font-bold transition-all ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                              : isExpanded
                              ? "bg-brand-900 text-white shadow-xs font-black"
                              : "bg-brand-50 text-brand-900 border border-brand-200"
                          }`}
                        >
                          {isCompleted ? <Check className="w-4 h-4 text-emerald-700" /> : `0${chapter.num}`}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <h3 className="font-serif text-lg sm:text-xl font-bold text-brand-950">
                              {chapter.title}
                            </h3>

                            {isCompleted && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Check className="w-3 h-3" />
                                Selesai
                              </span>
                            )}

                            {isExpanded && (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-900 border border-brand-200">
                                Pratinjau Terbuka
                              </span>
                            )}

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
                          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-brand-900 text-white hover:bg-brand-800 transition-colors shadow-xs cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-accent" />
                          <span>Baca Bab</span>
                        </button>

                        <span
                          className={`p-1 text-text-muted transition-transform duration-200 ${
                            isExpanded ? "transform rotate-180 text-brand-900" : ""
                          }`}
                        >
                          <ChevronDown className="w-5 h-5" />
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
                          transition={{ duration: 0.22 }}
                          className="border-t border-brand-200/60 bg-surface-muted/60 px-5 sm:px-6 py-5 space-y-4"
                        >
                          <div className="p-4 rounded-xl bg-white border border-brand-100 text-xs sm:text-sm text-text-secondary shadow-xs">
                            <span className="font-bold text-brand-950 block mb-1 text-xs uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-accent-dark" />
                              Prinsip Sains Inti:
                            </span>
                            &ldquo;{chapter.corePrinciple}&rdquo;
                          </div>

                          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-brand-50/60 border border-brand-200/70 text-xs sm:text-sm text-text-secondary">
                            <div className="p-1.5 rounded-lg bg-white text-brand-900 shadow-xs shrink-0 mt-0.5">
                              {renderTrackIcon(selectedTrack.iconName, "w-4 h-4")}
                            </div>
                            <div>
                              <span className="font-bold text-brand-950">
                                Penerapan pada {selectedTrack.name}:{" "}
                              </span>
                              <span>{trackData.application}</span>
                            </div>
                          </div>

                          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setActiveChapterId(chapter.id)}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand-900 text-white text-xs sm:text-sm font-bold hover:bg-brand-800 transition-all shadow-xs cursor-pointer"
                              >
                                <BookOpen className="w-4 h-4 text-accent" />
                                <span>Buka & Baca Bab Ini ({chapter.readTime})</span>
                              </button>

                              <button
                                onClick={(e) => toggleChapterCompleted(chapter.id, e)}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                                  isCompleted
                                    ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                    : "bg-white text-text-secondary hover:text-brand-900 border-surface-border"
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isCompleted ? "Selesai" : "Tandai Selesai"}</span>
                              </button>
                            </div>

                            <Link
                              href={ninaCtaUrl}
                              className="inline-flex items-center gap-1 text-xs font-bold text-accent-dark hover:text-brand-900 transition-colors"
                            >
                              <span>{hasNina ? "Buka di Dashboard" : "Terapkan dengan Nina"}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Floating Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-40 p-3 rounded-full bg-brand-900 text-white hover:bg-brand-800 border border-brand-700 shadow-xl transition-all cursor-pointer flex items-center justify-center"
          aria-label="Kembali ke atas"
        >
          <ArrowUp className="w-5 h-5 text-accent" />
        </button>
      )}

      <Footer />
    </div>
  );
}
