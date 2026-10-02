"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Phone,
  Flame,
  Target,
  Droplet,
  Calendar,
  AlertCircle,
  Tag,
  CreditCard,
  Lock,
  Heart,
  Dumbbell,
  Utensils,
  Activity,
  Smile,
  Zap,
  HelpCircle
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const TOTAL_STEPS = 9;
const STORAGE_KEY = "thrivin_onboarding_profile";

interface OnboardingData {
  name: string;
  gender: "Laki-laki" | "Perempuan" | "";
  age: number;
  weight: number;
  height: number;
  activityLevel: "Sedentari" | "Ringan" | "Moderat" | "Aktif" | "Sangat Aktif";
  workoutLocation: "Di Rumah" | "Di Gym" | "Luar Ruangan" | "Fleksibel";
  programFocus: string[];
  biggestChallenge: string;
  communicationStyle: "Santai & Akrab" | "Tegas & Terarah" | "Lembut & Empatik";
  whatsappNumber: string;
  selectedPlan: "quarter" | "half" | "year";
  promoCode: string;
  promoApplied: boolean;
}

const DEFAULT_DATA: OnboardingData = {
  name: "",
  gender: "Laki-laki",
  age: 25,
  weight: 65,
  height: 170,
  activityLevel: "Moderat",
  workoutLocation: "Di Rumah",
  programFocus: ["Workout & Strength"],
  biggestChallenge: "Gampang Mager & Hilang Niat",
  communicationStyle: "Santai & Akrab",
  whatsappNumber: "",
  selectedPlan: "quarter",
  promoCode: "TEMANBARU",
  promoApplied: true,
};

export default function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const resolvedParams = use(params);
  const stepNum = parseInt(resolvedParams.step, 10) || 1;
  const router = useRouter();
  const { login } = useAuth();

  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA);
  const [isLoaded, setIsLoaded] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);

  // Load saved state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setData({ ...DEFAULT_DATA, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.error("Failed to load onboarding data", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save changes to localStorage
  const updateData = (fields: Partial<OnboardingData>) => {
    setData((prev) => {
      const updated = { ...prev, ...fields };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save onboarding data", e);
      }
      return updated;
    });
  };

  const goToStep = (targetStep: number) => {
    if (targetStep < 1) {
      router.push("/companion/nina");
      return;
    }
    if (targetStep > TOTAL_STEPS) return;
    router.push(`/companion/nina/onboarding/${targetStep}`);
  };

  // Calculations
  const calculateTDEE = () => {
    const w = data.weight || 65;
    const h = data.height || 170;
    const a = data.age || 25;
    let bmr = 0;
    if (data.gender === "Laki-laki") {
      bmr = 10 * w + 6.25 * h - 5 * a + 5;
    } else {
      bmr = 10 * w + 6.25 * h - 5 * a - 161;
    }

    let multiplier = 1.55;
    switch (data.activityLevel) {
      case "Sedentari": multiplier = 1.2; break;
      case "Ringan": multiplier = 1.375; break;
      case "Moderat": multiplier = 1.55; break;
      case "Aktif": multiplier = 1.725; break;
      case "Sangat Aktif": multiplier = 1.9; break;
    }
    return Math.round(bmr * multiplier);
  };

  const calculateBMI = () => {
    const hMeter = (data.height || 170) / 100;
    const bmi = (data.weight || 65) / (hMeter * hMeter);
    return parseFloat(bmi.toFixed(1));
  };

  const tdee = calculateTDEE();
  const bmi = calculateBMI();
  const proteinTarget = Math.round((data.weight || 65) * 1.6);
  const hydrationTarget = ((data.weight || 65) * 0.035).toFixed(1);

  // Pricing calculation
  const PLANS = {
    quarter: {
      name: "Paket 3 Bulan (Quarter)",
      duration: "3 Bulan",
      totalPrice: 231000,
      monthlyPrice: 77000,
      badge: "PALING DISUKAI 🔥",
      desc: "Durasi optimal pembentukan kebiasaan baru.",
    },
    half: {
      name: "Paket 6 Bulan (Half-Year)",
      duration: "6 Bulan",
      totalPrice: 357000,
      monthlyPrice: 59500,
      badge: "HEMAT 23%",
      desc: "Transformasi kebiasaan dan metabolisme nyata.",
    },
    year: {
      name: "Paket 1 Tahun (Yearly)",
      duration: "12 Bulan",
      totalPrice: 465000,
      monthlyPrice: 38750,
      badge: "PALING HEMAT 50%",
      desc: "Gaya hidup permanen dengan pendampingan penuh.",
    },
  };

  const currentPlan = PLANS[data.selectedPlan];
  const discountRate = data.promoApplied && data.promoCode.toUpperCase() === "TEMANBARU" ? 0.2 : 0;
  const discountAmount = Math.round(currentPlan.totalPrice * discountRate);
  const finalPrice = currentPlan.totalPrice - discountAmount;

  // Phone validation
  const validatePhone = (phone: string) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) return "Nomor terlalu pendek (minimal 10 digit).";
    if (clean.length > 13) return "Nomor melebihi batas (maksimal 13 digit).";
    return "";
  };

  // Checkout simulation
  const handleCheckout = async () => {
    setIsCheckingOut(true);
    setTimeout(async () => {
      setIsCheckingOut(false);
      setCheckoutComplete(true);
      // Auto login user into dashboard
      await login(data.name || "Kawan Thrivin", "demo123");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1200);
    }, 1500);
  };

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col selection:bg-brand-100 selection:text-brand-900">
      {/* ─── Top Step Header Bar ─── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-surface-border h-14 flex items-center px-4 sm:px-6">
        <div className="max-w-md mx-auto w-full flex items-center gap-3">
          <button
            onClick={() => goToStep(stepNum - 1)}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-surface-muted text-text-secondary hover:text-brand-900 transition-colors cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Progress Bar */}
          <div className="flex-1 bg-surface-border h-2 rounded-full overflow-hidden">
            <div
              className="bg-brand-900 h-full transition-all duration-300 ease-out rounded-full"
              style={{ width: `${(stepNum / TOTAL_STEPS) * 100}%` }}
            />
          </div>

          <span className="text-[11px] font-bold text-text-muted font-mono shrink-0">
            Langkah {stepNum}/{TOTAL_STEPS}
          </span>
        </div>
      </header>

      {/* ─── Step Content Container ─── */}
      <main className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto px-6 py-8 sm:py-12">
        {/* ─── STEP 1: NAMA ─── */}
        {stepNum === 1 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 1 dari {TOTAL_STEPS}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Siapa nama panggilanmu?
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Biar Nina bisa menyapamu secara personal di WhatsApp.
              </p>
            </div>

            <div className="pt-2">
              <input
                type="text"
                autoFocus
                value={data.name}
                onChange={(e) => updateData({ name: e.target.value })}
                placeholder="contoh: Ari"
                className="w-full text-2xl sm:text-3xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent outline-none py-3 text-brand-950 placeholder:text-gray-300 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && data.name.trim()) goToStep(2);
                }}
              />
            </div>

            {data.name.trim() && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-2xl bg-brand-50 border border-brand-200 flex items-center gap-3 text-xs text-brand-900"
              >
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span>
                  Nina: &ldquo;Halo {data.name}! Senang berkenalan denganmu 😊&rdquo;
                </span>
              </motion.div>
            )}

            <button
              onClick={() => goToStep(2)}
              disabled={!data.name.trim()}
              className="w-full mt-6 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 2: JENIS KELAMIN & USIA (Common-Sense Bounds: 12 - 99) ─── */}
        {stepNum === 2 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 2 dari {TOTAL_STEPS}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Profil Biologis, {data.name}
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Digunakan dalam rumus klinis metabolisme basal (BMR).
              </p>
            </div>

            {/* Gender Selection */}
            <div>
              <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-2">
                Jenis Kelamin
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(["Laki-laki", "Perempuan"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => updateData({ gender: g })}
                    className={`p-4 rounded-2xl border-2 font-bold text-sm text-center transition-all cursor-pointer ${
                      data.gender === g
                        ? "bg-brand-50 border-brand-900 text-brand-950 shadow-xs"
                        : "bg-surface border-surface-border text-text-secondary hover:border-slate-300"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Age Input with Common-Sense Bound (12 - 99) */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-brand-950 uppercase tracking-wider">
                  Berapa usiamu?
                </label>
                <span className="text-sm font-bold font-mono text-brand-900 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
                  {data.age} tahun
                </span>
              </div>
              <input
                type="range"
                min={12}
                max={99}
                value={data.age}
                onChange={(e) => updateData({ age: parseInt(e.target.value, 10) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-900"
              />
              <div className="flex justify-between text-[11px] text-text-muted mt-1 font-mono">
                <span>12 thn</span>
                <span>50 thn</span>
                <span>99 thn</span>
              </div>
            </div>

            <button
              onClick={() => goToStep(3)}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Data Fisik</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 3: DATA FISIK (TINGGI & BERAT) + LIVE ANIMATED GRAPH ─── */}
        {stepNum === 3 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 3 dari {TOTAL_STEPS}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Tinggi & Berat Badan
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Batas wajar sistem: Tinggi (100–240 cm), Berat (30–250 kg).
              </p>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-1">
                  Tinggi (cm)
                </label>
                <input
                  type="number"
                  min={100}
                  max={240}
                  value={data.height}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    updateData({ height: isNaN(val) ? 170 : Math.min(Math.max(val, 100), 240) });
                  }}
                  className="w-full text-2xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent py-2 outline-none font-mono text-brand-950"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-1">
                  Berat (kg)
                </label>
                <input
                  type="number"
                  min={30}
                  max={250}
                  value={data.weight}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    updateData({ weight: isNaN(val) ? 65 : Math.min(Math.max(val, 30), 250) });
                  }}
                  className="w-full text-2xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent py-2 outline-none font-mono text-brand-950"
                />
              </div>
            </div>

            {/* Live Animated Graph / Visual BMI Meter */}
            <div className="p-5 rounded-3xl bg-surface-muted border border-surface-border space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-brand-950">
                <span>Grafik BMI Real-Time</span>
                <span className="font-mono text-accent-dark">BMI: {bmi}</span>
              </div>

              {/* Moving Gauge Bar */}
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden relative">
                <motion.div
                  className="h-full bg-linear-to-r from-teal-400 via-accent to-amber-500 rounded-full"
                  animate={{ width: `${Math.min(Math.max((bmi / 35) * 100, 10), 100)}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-text-muted font-mono pt-1">
                <span>Underweight (&lt;18.5)</span>
                <span className="text-accent-dark font-bold">Ideal (18.5–24.9)</span>
                <span>Overweight (&gt;25)</span>
              </div>

              <div className="text-[11px] text-text-secondary pt-1 leading-snug">
                Basal Metabolic Rate awal terestimasi ~<strong>{Math.round(tdee * 0.7)} kkal</strong> per hari.
              </div>
            </div>

            <button
              onClick={() => goToStep(4)}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Pola Aktivitas</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 4: TINGKAT AKTIVITAS & TEMPAT LATIHAN ─── */}
        {stepNum === 4 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 4 dari {TOTAL_STEPS}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Aktivitas & Fasilitas
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Biar program latihan yang Nina berikan realistis dijalani.
              </p>
            </div>

            {/* Activity Level */}
            <div>
              <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-2">
                Seberapa aktif keseharianmu?
              </label>
              <div className="space-y-2">
                {(
                  [
                    { level: "Sedentari", desc: "Duduk hampir seharian, minim olahraga" },
                    { level: "Ringan", desc: "Olahraga santai 1–2x seminggu" },
                    { level: "Moderat", desc: "Olahraga rutin 3–5x seminggu" },
                    { level: "Aktif", desc: "Latihan intensif 6–7x seminggu" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.level}
                    type="button"
                    onClick={() => updateData({ activityLevel: item.level })}
                    className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${
                      data.activityLevel === item.level
                        ? "bg-brand-50 border-brand-900 shadow-xs"
                        : "bg-surface border-surface-border hover:border-slate-300"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-brand-950">{item.level}</div>
                      <div className="text-[11px] text-text-muted">{item.desc}</div>
                    </div>
                    {data.activityLevel === item.level && (
                      <CheckCircle2 className="w-4 h-4 text-accent-dark" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Workout Location */}
            <div>
              <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-2">
                Di mana kamu lebih nyaman latihan?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["Di Rumah", "Di Gym", "Luar Ruangan", "Fleksibel"] as const).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => updateData({ workoutLocation: loc })}
                    className={`p-3 rounded-2xl border-2 text-xs font-bold transition-all text-center cursor-pointer ${
                      data.workoutLocation === loc
                        ? "bg-brand-50 border-brand-900 text-brand-950 shadow-xs"
                        : "bg-surface border-surface-border text-text-secondary hover:border-slate-300"
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => goToStep(5)}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Fokus Program</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 5: FOKUS PROGRAM ─── */}
        {stepNum === 5 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 5 dari {TOTAL_STEPS}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Fokus Program Utama
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Pilih fokus yang paling relevan dengan tujuanmu saat ini:
              </p>
            </div>

            <div className="space-y-2.5">
              {[
                { name: "Workout & Strength", desc: "Bentuk massa otot & latihan beban bertahap" },
                { name: "Yoga & Mobilitas", desc: "Kelenturan sendi & pereda pegal duduk seharian" },
                { name: "Diet & Nutrisi", desc: "Perbaiki pola makan tanpa tersiksa via foto piring" },
                { name: "Running & Cardio", desc: "Bangun stamina paru-paru & pace lari konsisten" },
                { name: "Casual Habits", desc: "Jalan 15 menit/hari, hidrasi & ritme tidur sehat" },
                { name: "Hybrid Seimbang", desc: "Paket lengkap gabungan beban, mobilitas & nutrisi" },
              ].map((prog) => {
                const isSelected = data.programFocus.includes(prog.name);
                return (
                  <button
                    key={prog.name}
                    type="button"
                    onClick={() => {
                      if (prog.name === "Hybrid Seimbang") {
                        updateData({ programFocus: ["Hybrid Seimbang"] });
                      } else {
                        const filtered = data.programFocus.filter((p) => p !== "Hybrid Seimbang");
                        if (filtered.includes(prog.name)) {
                          updateData({ programFocus: filtered.filter((p) => p !== prog.name) });
                        } else {
                          updateData({ programFocus: [...filtered, prog.name] });
                        }
                      }
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "bg-brand-50 border-brand-900 shadow-xs"
                        : "bg-surface border-surface-border hover:border-slate-300"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-brand-950">{prog.name}</div>
                      <div className="text-[11px] text-text-muted">{prog.desc}</div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-accent-dark" />}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => goToStep(6)}
              disabled={data.programFocus.length === 0}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ({data.programFocus.length} Terpilih)</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 6: TANTANGAN & GAYA NINA ─── */}
        {stepNum === 6 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 6 dari {TOTAL_STEPS}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Persona & Hambatan
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Nina disetel untuk mengantisipasi titik terlemahmu.
              </p>
            </div>

            {/* Biggest Challenge */}
            <div>
              <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-2">
                Hambatan terbesarmu selama ini:
              </label>
              <div className="space-y-2">
                {[
                  "Gampang Mager & Hilang Niat",
                  "Jadwal Sibuk Susah Konsisten",
                  "Bingung Menu & Porsi Makan",
                  "Ngerasa Berjuang Sendirian",
                ].map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => updateData({ biggestChallenge: ch })}
                    className={`w-full text-left p-3 rounded-2xl border-2 text-xs font-bold transition-all cursor-pointer flex justify-between items-center ${
                      data.biggestChallenge === ch
                        ? "bg-brand-50 border-brand-900 text-brand-950 shadow-xs"
                        : "bg-surface border-surface-border text-text-secondary hover:border-slate-300"
                    }`}
                  >
                    <span>{ch}</span>
                    {data.biggestChallenge === ch && <Check className="w-3.5 h-3.5 text-accent-dark" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Communication Style */}
            <div>
              <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-2">
                Gaya Komunikasi Nina:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { style: "Santai & Akrab", tag: "Sahabat" },
                    { style: "Tegas & Terarah", tag: "Coach" },
                    { style: "Lembut & Empatik", tag: "Pendengar" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.style}
                    type="button"
                    onClick={() => updateData({ communicationStyle: item.style })}
                    className={`p-3 rounded-2xl border-2 text-center transition-all cursor-pointer ${
                      data.communicationStyle === item.style
                        ? "bg-brand-50 border-brand-900 shadow-xs text-brand-950"
                        : "bg-surface border-surface-border text-text-secondary hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold text-xs">{item.style}</div>
                    <span className="text-[10px] text-accent-dark font-medium block mt-0.5">
                      {item.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => goToStep(7)}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lihat Blueprint Personal</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 7: PERSONAL BLUEPRINT OVERVIEW (NO LOCKING GIMMICK!) ─── */}
        {stepNum === 7 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Personal Blueprint
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Blueprint {data.name} & Nina
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Berikut kalkulasi metabolisme sains berdasarkan profil pribadimu:
              </p>
            </div>

            {/* Overview Metric Cards (Open & Transparent) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white border border-brand-200 shadow-xs space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-surface-border">
                <div>
                  <span className="text-xs uppercase font-semibold text-text-muted flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-accent-dark" />
                    Kebutuhan Kalori Harian (TDEE)
                  </span>
                  <div className="text-2xl font-black text-brand-950 font-mono mt-0.5">
                    ~{tdee} <span className="text-xs font-normal text-text-secondary">kkal/hari</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-accent-dark">
                  <Activity className="w-4 h-4" />
                </div>
              </div>

              <div className="flex justify-between items-center pb-3 border-b border-surface-border">
                <div>
                  <span className="text-xs uppercase font-semibold text-text-muted flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-accent-dark" />
                    Target Protein Harian
                  </span>
                  <div className="text-2xl font-black text-brand-950 font-mono mt-0.5">
                    ~{proteinTarget} <span className="text-xs font-normal text-text-secondary">gram/hari</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-accent-dark">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>

              <div className="flex justify-between items-center pb-3 border-b border-surface-border">
                <div>
                  <span className="text-xs uppercase font-semibold text-text-muted flex items-center gap-1.5">
                    <Droplet className="w-3.5 h-3.5 text-sky-600" />
                    Target Hidrasi Harian
                  </span>
                  <div className="text-2xl font-black text-brand-950 font-mono mt-0.5">
                    ~{hydrationTarget} <span className="text-xs font-normal text-text-secondary">Liter/hari</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-sky-600">
                  <Droplet className="w-4 h-4" />
                </div>
              </div>

              <div className="pt-1 space-y-1.5 text-xs text-brand-900 font-medium">
                <div className="flex justify-between">
                  <span className="text-text-muted">Fokus:</span>
                  <span className="font-bold">{data.programFocus.join(", ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Lokasi:</span>
                  <span className="font-bold">{data.workoutLocation}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Gaya Sapaan:</span>
                  <span className="font-bold text-accent-dark">{data.communicationStyle}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-text-secondary text-center leading-relaxed">
              Nina akan menyelaraskan jadwal reminder, evaluasi foto makanan, dan referensi gerakan sesuai data ini langsung di WhatsApp.
            </p>

            <button
              onClick={() => goToStep(8)}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut Sambungkan ke WhatsApp</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 8: INPUT NOMOR WHATSAPP (PRIMARY ID) ─── */}
        {stepNum === 8 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 8 dari {TOTAL_STEPS}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Nomor WhatsApp Kamu
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Nomor ini menjadi ID utama akunmu dan jalur Nina menyapamu setiap hari.
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white border border-brand-200 shadow-xs space-y-3">
              <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block">
                Nomor WhatsApp Aktif
              </label>

              <div className="relative flex items-center">
                <div className="absolute left-3.5 flex items-center gap-1 text-sm font-bold text-brand-900 pr-2 border-r border-slate-200">
                  <span>🇮🇩</span>
                  <span>+62</span>
                </div>
                <input
                  type="tel"
                  autoFocus
                  value={data.whatsappNumber}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateData({ whatsappNumber: val });
                    setPhoneError(validatePhone(val));
                  }}
                  placeholder="812-3456-7890"
                  className="w-full pl-20 pr-4 py-3.5 text-lg font-bold text-brand-950 border border-slate-200 rounded-xl focus:border-brand-900 outline-none"
                />
              </div>

              {phoneError && (
                <div className="text-rose-600 text-xs flex items-center gap-1 pt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{phoneError}</span>
                </div>
              )}

              <p className="text-[11px] text-text-muted leading-relaxed">
                Format nomor HP Indonesia (contoh: 0812xxxxxxxx atau 812xxxxxxxx).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Privasi terjaga. Nomor tidak akan dibagikan ke pihak ketiga.</span>
            </div>

            <button
              onClick={() => {
                const err = validatePhone(data.whatsappNumber);
                if (err) {
                  setPhoneError(err);
                  return;
                }
                goToStep(9);
              }}
              disabled={!data.whatsappNumber.trim() || !!phoneError}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Pilihan Paket</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 9: PRICING PLANS & CHECKOUT ─── */}
        {stepNum === 9 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 9 dari {TOTAL_STEPS}
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Pilih Paket Pendampingan
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Sistem sekali bayar. Tanpa langganan otomatis.
              </p>
            </div>

            {/* Radio-Style Pricing Selector */}
            <div className="space-y-3">
              {(
                [
                  { id: "quarter", plan: PLANS.quarter },
                  { id: "half", plan: PLANS.half },
                  { id: "year", plan: PLANS.year },
                ] as const
              ).map(({ id, plan }) => {
                const isSelected = data.selectedPlan === id;
                return (
                  <div
                    key={id}
                    onClick={() => updateData({ selectedPlan: id })}
                    className={`p-4 sm:p-5 rounded-3xl border-2 transition-all cursor-pointer relative ${
                      isSelected
                        ? "bg-brand-950 text-white border-accent shadow-xl"
                        : "bg-white text-brand-950 border-surface-border hover:border-slate-300"
                    }`}
                  >
                    {/* Badge */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? "border-accent bg-accent" : "border-slate-300"
                          }`}
                        >
                          {isSelected && <span className="w-2 h-2 rounded-full bg-brand-950" />}
                        </div>
                        <span className="font-serif font-bold text-base sm:text-lg">
                          {plan.name}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                          isSelected
                            ? "bg-accent/20 text-accent border border-accent/40"
                            : "bg-brand-50 text-brand-900 border border-brand-200"
                        }`}
                      >
                        {plan.badge}
                      </span>
                    </div>

                    <div className="pl-7 flex items-baseline justify-between">
                      <div>
                        <div className="text-xl sm:text-2xl font-black font-mono">
                          Rp {plan.totalPrice.toLocaleString("id-ID")}
                        </div>
                        <div className={`text-xs ${isSelected ? "text-brand-200" : "text-text-muted"}`}>
                          ~Rp {plan.monthlyPrice.toLocaleString("id-ID")} / bulan
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Promo Code Input (Default TEMANBARU 20% Off) */}
            <div className="p-4 rounded-2xl bg-surface-muted border border-surface-border space-y-2">
              <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block">
                Kode Promo
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={data.promoCode}
                    onChange={(e) => updateData({ promoCode: e.target.value.toUpperCase() })}
                    placeholder="TEMANBARU"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold uppercase rounded-xl border border-surface-border bg-white text-brand-950 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (data.promoCode.trim().toUpperCase() === "TEMANBARU") {
                      updateData({ promoApplied: true });
                    } else {
                      updateData({ promoApplied: false });
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-brand-900 text-white text-xs font-bold hover:bg-brand-800 cursor-pointer"
                >
                  Terapkan
                </button>
              </div>

              {data.promoApplied && data.promoCode.toUpperCase() === "TEMANBARU" && (
                <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 pt-0.5">
                  <Check className="w-3 h-3" />
                  <span>Kode promo TEMANBARU aktif! Diskon 20% untuk pengguna baru.</span>
                </div>
              )}
            </div>

            {/* Price Summary Breakdown */}
            <div className="p-4 rounded-2xl bg-white border border-brand-200 space-y-1.5 text-xs text-brand-950">
              <div className="flex justify-between">
                <span>Subtotal ({currentPlan.name})</span>
                <span className="font-mono">Rp {currentPlan.totalPrice.toLocaleString("id-ID")}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Diskon Promo 20% (TEMANBARU)</span>
                  <span className="font-mono">-Rp {discountAmount.toLocaleString("id-ID")}</span>
                </div>
              )}
              <div className="h-px bg-surface-border my-1" />
              <div className="flex justify-between text-sm font-bold">
                <span>Total Investasi</span>
                <span className="text-base text-brand-900 font-mono">
                  Rp {finalPrice.toLocaleString("id-ID")}
                </span>
              </div>
            </div>

            {/* 3-Day Money Back Guarantee Banner */}
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                <strong>Garansi Uang Kembali 3 Hari:</strong> Jika dalam 3 hari kamu merasa pendampingan Nina tidak cocok, dana dikembalikan 100% tanpa ribet.
              </span>
            </div>

            {/* Checkout Action Button */}
            <button
              onClick={handleCheckout}
              disabled={isCheckingOut || checkoutComplete}
              className="w-full rounded-full bg-accent hover:bg-brand-900 hover:text-white text-brand-950 font-black py-4 text-sm transition-all shadow-glow hover:scale-105 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isCheckingOut ? (
                <span>Menghubungkan Pembayaran...</span>
              ) : checkoutComplete ? (
                <span>✓ Berhasil! Mengalihkan ke Dashboard...</span>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Ambil Paket & Mulai di WhatsApp</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
