"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  MessageCircle,
  ExternalLink,
  Flame,
  Target,
  Activity,
  BookOpen,
  Calendar,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Clock
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const SilhouetteIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
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

interface CompanionOrb {
  id: string;
  name: string;
  role: string;
  status: "active" | "locked";
  avatar: string;
  themeColor: string;
  accentBg: string;
}

const COMPANIONS: CompanionOrb[] = [
  {
    id: "nina",
    name: "Nina",
    role: "Wellness & Fitness",
    status: "active",
    avatar: "/nina-pp.webp",
    themeColor: "from-brand-900 to-brand-950",
    accentBg: "bg-accent",
  },
  {
    id: "mindset",
    name: "Mindset, Habit & Reading",
    role: "Refleksi & Habit",
    status: "locked",
    avatar: "",
    themeColor: "from-slate-900 to-slate-950",
    accentBg: "bg-slate-700",
  },
  {
    id: "parenting",
    name: "Parenting & Family",
    role: "Family & Childcare",
    status: "locked",
    avatar: "",
    themeColor: "from-slate-900 to-slate-950",
    accentBg: "bg-slate-700",
  },
];

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [activeCompanionId, setActiveCompanionId] = useState("nina");

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  const activeCompanion = COMPANIONS.find((c) => c.id === activeCompanionId) || COMPANIONS[0];

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted font-sans text-brand-950 flex flex-col selection:bg-brand-100 selection:text-brand-900">
      <Navbar />

      <main className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        {/* ─── Top Greeting & Companion Selector Orbs ─── */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Personal Growth Dashboard
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Halo, {user ? user.username : "Ari Pratama"}! 👋
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Kelola pendamping aktifmu dan pantau perkembangan konsistensimu.
              </p>
            </div>

            {/* Quick Status Pill */}
            <div className="flex items-center gap-2 self-start sm:self-auto px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 shadow-2xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>1 Companion Aktif (Nina)</span>
            </div>
          </div>

          {/* Interactive Companion Orbs (Bola-Bola Switcher) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-white border border-surface-border shadow-xs">
            <span className="text-xs uppercase font-bold tracking-wider text-text-muted block mb-3 font-mono">
              Pilih Companion untuk Mengubah Dashboard:
            </span>

            <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none">
              {COMPANIONS.map((companion) => {
                const isSelected = activeCompanionId === companion.id;
                const isActive = companion.status === "active";

                return (
                  <button
                    key={companion.id}
                    onClick={() => setActiveCompanionId(companion.id)}
                    className={`flex items-center gap-3 p-2 sm:pr-4 rounded-2xl border-2 transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? "bg-brand-50 border-brand-900 shadow-sm ring-2 ring-brand-900/10"
                        : "bg-surface-muted border-transparent hover:border-slate-300"
                    }`}
                  >
                    {/* Orb Sphere Avatar */}
                    <div className="relative">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border-2 transition-all ${
                          isSelected
                            ? "border-accent ring-2 ring-accent/30 shadow-glow"
                            : "border-slate-200"
                        }`}
                      >
                        {companion.avatar ? (
                          <Image
                            src={companion.avatar}
                            alt={companion.name}
                            width={48}
                            height={48}
                            className="object-cover object-top w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-500">
                            <SilhouetteIcon className="w-7 h-7" />
                          </div>
                        )}
                      </div>

                      {/* Status indicator on orb */}
                      {isActive ? (
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                      ) : (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center">
                          <Lock className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Companion Meta */}
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-brand-950">
                          {companion.name}
                        </span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        )}
                      </div>
                      <span className="text-[11px] text-text-muted block truncate max-w-[120px]">
                        {companion.role}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Active Dashboard Theme Content ─── */}
        <AnimatePresence mode="wait">
          {activeCompanionId === "nina" ? (
            /* ══════ NINA ACTIVE DASHBOARD ══════ */
            <motion.div
              key="nina-dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Primary Active Companion Card */}
              <div className="rounded-[2.5rem] bg-brand-950 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-accent/15 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  {/* Avatar & Info */}
                  <div className="flex items-start sm:items-center gap-4 sm:gap-5">
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-accent shadow-glow shrink-0">
                      <Image
                        src="/nina-pp.webp"
                        alt="Nina"
                        fill
                        className="object-cover object-top"
                      />
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider font-mono mb-1.5 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Terhubung Aktif di WhatsApp</span>
                      </div>
                      <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white">
                        Nina · Wellness & Fitness
                      </h2>
                      <p className="text-xs sm:text-sm text-brand-200 mt-0.5">
                        Paket: {user?.plan || "Paket 3 Bulan (Quarter)"} • Nomor: {user?.whatsapp || "0812-3456-7890"}
                      </p>
                    </div>
                  </div>

                  {/* WhatsApp Action Button */}
                  <div className="shrink-0 flex flex-col sm:flex-row gap-3">
                    <a
                      href="https://wa.me/?text=Halo%20Nina!%20Hari%20ini%20jadwal%20latihanku%20gimana%20ya?"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3.5 rounded-full bg-[#00A884] hover:bg-[#028E70] text-white font-bold text-xs sm:text-sm transition-all shadow-md hover:scale-105 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4 fill-white" />
                      <span>Buka Chat WhatsApp Nina</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Journey Timeline & Recent Chat Insights (Simulated Conversation Data) */}
              <div className="grid md:grid-cols-3 gap-6">
                {/* Stats 1 */}
                <div className="p-5 sm:p-6 rounded-3xl bg-white border border-surface-border shadow-xs space-y-1">
                  <div className="flex items-center justify-between text-text-muted mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Konsistensi</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-3xl font-black text-brand-950 font-mono">
                    14 <span className="text-sm font-semibold text-text-secondary">Hari Aktif</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    85% respon sapaan harian Nina di WhatsApp tepat waktu.
                  </p>
                </div>

                {/* Stats 2 */}
                <div className="p-5 sm:p-6 rounded-3xl bg-white border border-surface-border shadow-xs space-y-1">
                  <div className="flex items-center justify-between text-text-muted mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Nutrisi & Foto</span>
                    <Flame className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-3xl font-black text-brand-950 font-mono">
                    28 <span className="text-sm font-semibold text-text-secondary">Foto Makanan</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    Rata-rata asupan protein mingguan tercapai di 94g/hari.
                  </p>
                </div>

                {/* Stats 3 */}
                <div className="p-5 sm:p-6 rounded-3xl bg-white border border-surface-border shadow-xs space-y-1">
                  <div className="flex items-center justify-between text-text-muted mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Olahraga & Strava</span>
                    <Activity className="w-4 h-4 text-accent-dark" />
                  </div>
                  <div className="text-3xl font-black text-brand-950 font-mono">
                    6 <span className="text-sm font-semibold text-text-secondary">Sesi Tercatat</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    Pace lari rata-rata 6:20/km dengan evaluasi denyut jantung.
                  </p>
                </div>
              </div>

              {/* Recent Conversation Insight Note from Nina */}
              <div className="p-5 sm:p-6 rounded-3xl bg-brand-50 border border-brand-200/90 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-brand-300">
                    <Image
                      src="/nina-pp.webp"
                      alt="Nina"
                      width={36}
                      height={36}
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xs sm:text-sm text-brand-950">
                        Catatan Terkini dari Nina
                      </span>
                      <span className="text-[10px] text-text-muted font-mono">Hari ini, 07:45</span>
                    </div>
                    <p className="text-xs sm:text-sm text-text-secondary italic leading-relaxed">
                      &ldquo;Kemarin porsi makan siang lauk tempe + ayamnya udah pas banget proteinnya. Hari ini jadwal upper body ringan ya! Jangan lupa minum air minimal 2.5 Liter. Nanti sore aku ingetin lagi 💪&rdquo;
                    </p>
                  </div>
                </div>
              </div>

              {/* Personal Blueprint & Learning Shortcut Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Blueprint Card */}
                <div className="p-6 rounded-3xl bg-white border border-surface-border shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-accent-dark" />
                      <h3 className="font-serif text-lg font-bold text-brand-950">
                        Personal Blueprint Ringkas
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold text-accent-dark bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                      Tersimpan
                    </span>
                  </div>

                  <div className="space-y-3 text-xs sm:text-sm">
                    <div className="flex justify-between py-2 border-b border-surface-border">
                      <span className="text-text-secondary">Kebutuhan Kalori (TDEE):</span>
                      <span className="font-bold text-brand-950">~2.150 kkal / hari</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-surface-border">
                      <span className="text-text-secondary">Target Protein Minimum:</span>
                      <span className="font-bold text-brand-950">~105 gram / hari</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-surface-border">
                      <span className="text-text-secondary">Fokus Lokasi Latihan:</span>
                      <span className="font-bold text-brand-950">Di Rumah / Bodyweight</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-text-secondary">Gaya Interaksi Nina:</span>
                      <span className="font-bold text-accent-dark">Santai & Akrab (Sahabat)</span>
                    </div>
                  </div>
                </div>

                {/* Learning Hub Recommended Module */}
                <div className="p-6 rounded-3xl bg-white border border-surface-border shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-4 h-4 text-accent-dark" />
                      <h3 className="font-serif text-lg font-bold text-brand-950">
                        Materi Terkait Minggu Ini
                      </h3>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed mb-4">
                      Nina menyarankan kamu membaca modul berikut untuk memahami kurva metabolisme tubuhmu:
                    </p>

                    <div className="p-3.5 rounded-2xl bg-surface-muted border border-surface-border mb-4">
                      <span className="text-[10px] font-mono font-bold uppercase text-accent-dark block mb-0.5">
                        Bab 02 · 6 Menit Baca
                      </span>
                      <h4 className="font-serif text-sm font-bold text-brand-950">
                        Energi, Kalori & Bahan Bakar: Menghitung TDEE Tanpa Obsesi Rumit
                      </h4>
                    </div>
                  </div>

                  <Link
                    href="/companion/nina/learning"
                    className="w-full py-2.5 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs text-center transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Buka Knowledge Hub Nina</span>
                    <ArrowRight className="w-3.5 h-3.5 text-accent" />
                  </Link>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ══════ LOCKED COMPANION PLACEHOLDER ══════ */
            <motion.div
              key="locked-dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="p-8 sm:p-12 rounded-[2.5rem] bg-white border-2 border-dashed border-slate-300 text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto text-2xl font-bold font-serif">
                <Lock className="w-7 h-7 text-slate-400" />
              </div>

              <div className="max-w-md mx-auto">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 inline-block mb-2">
                  Companion Segera Hadir
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                  {activeCompanion.name} ({activeCompanion.role})
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  Companion ini sedang dalam tahap kurasi kurikulum sains dan pengujian persona bot. Saat ini, kamu bisa menggunakan <strong>Nina</strong> untuk pilar wellness & fitness.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setActiveCompanionId("nina")}
                  className="px-6 py-3 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Kembali ke Dashboard Nina
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}
