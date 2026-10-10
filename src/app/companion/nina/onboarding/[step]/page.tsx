"use client";

import React, { useState, useEffect, use } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks: {
          onSuccess?: (result: any) => void;
          onPending?: (result: any) => void;
          onError?: (result: any) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

import { fbqTrack } from "@/components/MetaPixel";
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
  Clock,
  Percent,
  Lock,
  Heart,
  Dumbbell,
  Utensils,
  Activity,
  Smile,
  Zap,
  HelpCircle,
  Camera,
  BellRing,
  BrainCircuit,
  MessageCircle,
  Smartphone
} from "lucide-react";

const TOTAL_STEPS = 9;
const STORAGE_KEY = "thrivin_onboarding_profile";
const COUNTDOWN_STORAGE_KEY = "thrivin_promo_1h_countdown";

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
  selectedPlan: "month" | "quarter" | "half" | "year";
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

  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA);
  const [isLoaded, setIsLoaded] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // 1-Hour Countdown Timer State for Applied Promo
  const [countdownSeconds, setCountdownSeconds] = useState(3600);

  const formatCountdown = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Syncing & calculation animation state (after WhatsApp input in Step 8)
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(1);

  // Intro Feature Slides state (Step 1)
  const [introSlide, setIntroSlide] = useState(0);
  const [slide1Sub, setSlide1Sub] = useState<0 | 1>(0);
  const [slide2Sub, setSlide2Sub] = useState<0 | 1>(0);

  // Auto-switch sub-slides for Slide 1 & Slide 2
  useEffect(() => {
    if (stepNum !== 1) return;
    const timer1 = setInterval(() => {
      setSlide1Sub((prev) => (prev === 0 ? 1 : 0));
    }, 3800);
    const timer2 = setInterval(() => {
      setSlide2Sub((prev) => (prev === 0 ? 1 : 0));
    }, 3800);
    return () => {
      clearInterval(timer1);
      clearInterval(timer2);
    };
  }, [stepNum]);

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

  // 1-Hour Countdown Timer for Applied Promo (ambiguous session timer, clears code when expired)
  useEffect(() => {
    if (!isLoaded) return;
    if (!data.promoApplied) return;

    let expiry = Number(localStorage.getItem(COUNTDOWN_STORAGE_KEY));
    const now = Date.now();
    if (!expiry) {
      expiry = now + 3600 * 1000;
      try {
        localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(expiry));
      } catch (e) {}
    } else if (expiry <= now) {
      setCountdownSeconds(0);
      updateData({ promoApplied: false, promoCode: "" });
      try {
        localStorage.removeItem(COUNTDOWN_STORAGE_KEY);
      } catch (e) {}
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setCountdownSeconds(remaining);
      if (remaining === 0) {
        updateData({ promoApplied: false, promoCode: "" });
        try {
          localStorage.removeItem(COUNTDOWN_STORAGE_KEY);
        } catch (e) {}
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isLoaded, data.promoApplied]);

  const goToStep = (targetStep: number) => {
    if (targetStep < 1) {
      router.push("/companion/nina");
      return;
    }
    if (targetStep > TOTAL_STEPS) return;
    router.push(`/companion/nina/onboarding/${targetStep}`);
  };

  // Height & Weight sensible bounds validation (doesn't block typing)
  const isHeightSensible = data.height >= 120 && data.height <= 240;
  const isWeightSensible = data.weight >= 30 && data.weight <= 250;
  const isPhysicalDataSensible = isHeightSensible && isWeightSensible;

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
    const hM = (data.height || 170) / 100;
    const w = data.weight || 65;
    const bmiVal = w / (hM * hM);
    return Math.round(bmiVal * 10) / 10;
  };

  const tdee = calculateTDEE();
  const bmi = calculateBMI();
  const proteinTarget = Math.round((data.weight || 65) * 1.6);
  const hydrationTarget = ((data.weight || 65) * 0.035).toFixed(1);

  // Pricing calculation
  const PLANS: Record<string, {
    name: string;
    duration: string;
    totalPrice: number;
    monthlyPrice: number;
    badge: string;
    desc: string;
  }> = {
    month: {
      name: "Paket 1 Bulan (Trial)",
      duration: "1 Bulan",
      totalPrice: 99000,
      monthlyPrice: 99000,
      badge: "Coba dulu · Tanpa Komitmen Panjang",
      desc: "Langkah awal mencoba langsung interaksi harian bersama Nina.",
    },
    quarter: {
      name: "Paket 3 Bulan (Quarter)",
      duration: "3 Bulan",
      totalPrice: 231000,
      monthlyPrice: 77000,
      badge: "Fase Adaptasi 90 Hari · Bangun Kebiasaan Baru",
      desc: "Durasi optimal pembentukan kebiasaan baru.",
    },
    half: {
      name: "Paket 6 Bulan (Half-Year)",
      duration: "6 Bulan",
      totalPrice: 357000,
      monthlyPrice: 59500,
      badge: "Hemat 23% · Rekomendasi Transformasi Nyata",
      desc: "Transformasi kebiasaan dan metabolisme nyata.",
    },
    year: {
      name: "Paket 1 Tahun (Yearly)",
      duration: "12 Bulan",
      totalPrice: 465000,
      monthlyPrice: 38750,
      badge: "Paling Hemat 50% · Rp 39rb-an/bulan",
      desc: "Gaya hidup permanen dengan pendampingan penuh.",
    },
  };

  const currentPlan = PLANS[data.selectedPlan] || PLANS.quarter;
  const isPromoEligible = data.selectedPlan !== "month";
  const discountRate = data.promoApplied && data.promoCode.toUpperCase() === "TEMANBARU" && isPromoEligible ? 0.2 : 0;
  const discountAmount = Math.round(currentPlan.totalPrice * discountRate);
  const finalPrice = currentPlan.totalPrice - discountAmount;

  // Struck-through helper for each card
  const getPlanPricing = (planKey: "month" | "quarter" | "half" | "year") => {
    const plan = PLANS[planKey];
    const isPlanPromoEligible = planKey !== "month";
    const promoRate = data.promoApplied && data.promoCode.toUpperCase() === "TEMANBARU" && isPlanPromoEligible ? 0.2 : 0;
    const disc = Math.round(plan.totalPrice * promoRate);
    const finalTotal = plan.totalPrice - disc;
    const finalMonthly = Math.round(plan.monthlyPrice * (1 - promoRate));
    return {
      originalTotal: plan.totalPrice,
      discountedTotal: finalTotal,
      originalMonthly: plan.monthlyPrice,
      discountedMonthly: finalMonthly,
      hasDiscount: promoRate > 0,
    };
  };

  // Phone validation
  const validatePhone = (phone: string) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) return "Nomor terlalu pendek (minimal 10 digit).";
    if (clean.length > 13) return "Nomor melebihi batas (maksimal 13 digit).";
    return "";
  };

  // Handle WhatsApp submission with calculation/syncing animation
  const handleProceedFromWhatsApp = () => {
    const err = validatePhone(data.whatsappNumber);
    if (err) {
      setPhoneError(err);
      return;
    }
    setPhoneError("");
    fbqTrack("Lead", {
      content_name: "Onboarding WhatsApp Submission",
    });
    setIsSyncing(true);
    setSyncStep(1);

    setTimeout(() => {
      setSyncStep(2);
    }, 700);

    setTimeout(() => {
      setSyncStep(3);
    }, 1400);

    setTimeout(() => {
      setIsSyncing(false);
      goToStep(9);
    }, 2200);
  };

  // Scalev API Dynamic Checkout (checkout.thrivin.id)
  const handleCheckout = async () => {
    setIsCheckingOut(true);
    setCheckoutError("");

    // Meta Pixel: InitiateCheckout
    fbqTrack("InitiateCheckout", {
      content_name: currentPlan.name,
      value: finalPrice,
      currency: "IDR",
    });

    try {
      const response = await fetch("/api/scalev/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: data.selectedPlan,
          planName: currentPlan.name,
          amount: finalPrice,
          customerName: data.name,
          customerPhone: data.whatsappNumber,
        }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.paymentUrl) {
        throw new Error(
          resData.error || "Gagal membuat sesi pembayaran di checkout.thrivin.id"
        );
      }

      setCheckoutComplete(true);
      window.location.href = resData.paymentUrl;
    } catch (err: any) {
      setIsCheckingOut(false);
      console.error("Scalev checkout error:", err);
      setCheckoutError(
        err?.message || "Terjadi kesalahan saat menyiapkan halaman pembayaran."
      );
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col selection:bg-brand-100 selection:text-brand-900">
      {/* ─── Top Step Header Bar ─── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-surface-border h-14 flex items-center px-4 sm:px-6">
        <div className={`mx-auto w-full flex items-center gap-3 ${stepNum === 9 ? "max-w-3xl" : "max-w-md"}`}>
          {stepNum === 1 ? (
            <>
              <button
                onClick={() => {
                  if (introSlide > 0) {
                    setIntroSlide(introSlide - 1);
                  } else {
                    router.push("/companion/nina");
                  }
                }}
                className="p-1.5 -ml-1.5 rounded-full hover:bg-surface-muted text-text-secondary hover:text-brand-900 transition-colors cursor-pointer"
                aria-label="Kembali"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {/* 3 Segmented Bars for Feature Slides */}
              <div className="flex-1 flex gap-1.5 h-2">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    onClick={() => setIntroSlide(idx)}
                    className="flex-1 bg-surface-border h-2 rounded-full overflow-hidden cursor-pointer"
                  >
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        introSlide >= idx ? "bg-brand-900" : "bg-transparent"
                      }`}
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => goToStep(2)}
                className="text-xs font-bold text-accent-dark hover:underline font-mono shrink-0 cursor-pointer"
              >
                Lewati &rarr;
              </button>
            </>
          ) : stepNum === 9 ? (
            <>
              <button
                onClick={() => goToStep(8)}
                className="p-1.5 -ml-1.5 rounded-full hover:bg-surface-muted text-text-secondary hover:text-brand-900 transition-colors cursor-pointer"
                aria-label="Kembali"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {/* Progress Complete */}
              <div className="flex-1 bg-surface-border h-2 rounded-full overflow-hidden">
                <div className="bg-brand-900 h-full w-full rounded-full" />
              </div>

              <span className="text-[11px] font-bold text-accent-dark font-mono shrink-0">
                Blueprint & Pilihan Paket
              </span>
            </>
          ) : (
            <>
              <button
                onClick={() => goToStep(stepNum - 1)}
                className="p-1.5 -ml-1.5 rounded-full hover:bg-surface-muted text-text-secondary hover:text-brand-900 transition-colors cursor-pointer"
                aria-label="Kembali"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {/* Progress Bar for Survey (Steps 2 to 8 = 7 questions) */}
              <div className="flex-1 bg-surface-border h-2 rounded-full overflow-hidden">
                <div
                  className="bg-brand-900 h-full transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${((stepNum - 1) / 7) * 100}%` }}
                />
              </div>

              <span className="text-[11px] font-bold text-text-muted font-mono shrink-0">
                Langkah {stepNum - 1}/7
              </span>
            </>
          )}
        </div>
      </header>

      {/* ─── Animated Synchronization & Calculation Modal ─── */}
      <AnimatePresence>
        {isSyncing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-surface-border text-center space-y-5"
            >
              <div className="relative w-16 h-16 mx-auto rounded-full bg-brand-900 p-1 border-2 border-accent shadow-glow">
                <Image
                  src="/nina-pp.webp"
                  alt="Nina"
                  fill
                  className="rounded-full object-cover"
                />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-brand-950 animate-spin" />
                </span>
              </div>

              <div>
                <h3 className="font-serif text-xl font-bold text-brand-950">
                  Menyusun Blueprint...
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Sinkronisasi profil metabolisme ke sistem WhatsApp Nina.
                </p>
              </div>

              <div className="space-y-2.5 text-left text-xs">
                <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
                  syncStep >= 1 ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold" : "bg-slate-50 border-slate-200 text-slate-400"
                }`}>
                  {syncStep >= 1 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <div className="w-4 h-4 rounded-full border border-slate-300" />}
                  <span>Menghubungkan WhatsApp {data.whatsappNumber}...</span>
                </div>

                <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
                  syncStep >= 2 ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold" : "bg-slate-50 border-slate-200 text-slate-400"
                }`}>
                  {syncStep >= 2 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <div className="w-4 h-4 rounded-full border border-slate-300" />}
                  <span>Kalkulasi TDEE (~{tdee} kkal) & protein harian...</span>
                </div>

                <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
                  syncStep >= 3 ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold" : "bg-slate-50 border-slate-200 text-slate-400"
                }`}>
                  {syncStep >= 3 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <div className="w-4 h-4 rounded-full border border-slate-300" />}
                  <span>Menyiapkan paket pendampingan & garansi...</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Step Content Container ─── */}
      <main className={`flex-1 flex flex-col justify-center w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 ${
        stepNum === 9 ? "max-w-3xl" : "max-w-md"
      }`}>
        
        {/* ─── STEP 1: 3 FEATURE SLIDES WITH AUTO-ALTERNATING WHATSAPP CHATS ─── */}
        {stepNum === 1 && (
          <div className="space-y-4">
            {/* ── SLIDE 0: NINA MENGINGAT SEMUA & REMINDER PROAKTIF ── */}
            {introSlide === 0 && (
              <motion.div
                key="slide-0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-[10px] font-black text-accent-dark tracking-wider uppercase font-mono shadow-xs mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-dark animate-pulse" />
                    FITUR 1 / 3 · KONSISTENSI & AKUNTABILITAS
                  </span>
                  <h1 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950">
                    Nina Mengingat Segalanya & Hubungi Duluan
                  </h1>
                  <p className="text-xs sm:text-sm text-text-secondary mt-1 max-w-sm mx-auto">
                    Bukan kamu yang harus repot mengingat jadwal. Nina proaktif menyapa di jam genting dan mengingat semua riwayat cedera serta kebiasaanmu.
                  </p>
                </div>

                {/* Sub-slide Selector Tabs */}
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setSlide1Sub(0)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      slide1Sub === 0
                        ? "bg-brand-950 text-white shadow-xs"
                        : "bg-surface-muted text-text-secondary border border-surface-border"
                    }`}
                  >
                    <BellRing className="w-3.5 h-3.5 text-accent" />
                    <span>Reminder Proaktif</span>
                  </button>
                  <button
                    onClick={() => setSlide1Sub(1)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      slide1Sub === 1
                        ? "bg-brand-950 text-white shadow-xs"
                        : "bg-surface-muted text-text-secondary border border-surface-border"
                    }`}
                  >
                    <BrainCircuit className="w-3.5 h-3.5 text-accent" />
                    <span>Memori Personal</span>
                  </button>
                </div>

                {/* WhatsApp Phone Mockup Shell */}
                <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[360px] rounded-[2.5rem] bg-slate-100 ring-8 ring-brand-900 shadow-2xl overflow-hidden flex flex-col h-[400px]">
                  {/* WA Header */}
                  <div className="bg-[#075E54] px-4 py-3 flex items-center justify-between text-white shrink-0 shadow-md">
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-brand-900 border border-white/40 shrink-0">
                        <Image
                          src="/nina-pp.webp"
                          alt="Nina"
                          fill
                          className="object-cover object-top"
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-xs leading-tight text-white">Nina · Thrivin</div>
                        <div className="text-[10px] text-white/80">Online · Personal Companion</div>
                      </div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  </div>

                  {/* Chat Content (Auto-alternates) */}
                  <div className="flex-1 bg-[#efeae2] p-3.5 flex flex-col justify-end gap-2 overflow-y-auto">
                    <AnimatePresence mode="wait">
                      {slide1Sub === 0 ? (
                        <motion.div
                          key="sub-0"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-2"
                        >
                          <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[88%] self-start shadow-2xs">
                            <p>Pagi! Hari ini jadwal workout upper body ya. Mau mulai jam berapa nanti? Aku ingetin ya 💪</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">07:30</span>
                          </div>
                          <div className="bg-white text-gray-800 rounded-2xl rounded-tr-none p-3 text-xs leading-relaxed max-w-[85%] ml-auto shadow-2xs">
                            <p>Jam 5 sore ya Nin</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">07:32</span>
                          </div>
                          <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[88%] self-start shadow-2xs">
                            <p>Siap! Aku reminder jam 4:45 biar sempat pemanasan & stretching 🔥</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">07:32</span>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="sub-1"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-2"
                        >
                          <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[88%] self-start shadow-2xs">
                            <p>Eh minggu lalu kan lutut kiri kamu agak ngilu habis squat, hari ini kita skip squat dulu ya.</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">16:45</span>
                          </div>
                          <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[88%] self-start shadow-2xs">
                            <p>Ganti leg press sama Romanian deadlift aja gimana? Bebannya tetap kena paha tapi lutut lebih aman 😊</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">16:45</span>
                          </div>
                          <div className="bg-white text-gray-800 rounded-2xl rounded-tr-none p-3 text-xs leading-relaxed max-w-[85%] ml-auto shadow-2xs">
                            <p>Wah iya bener, makasih udah inget ya Nin!</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">16:48</span>
                          </div>
                          <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[88%] self-start shadow-2xs">
                            <p>Sama-sama! Nanti malam kompres hangat 5 menit ya 🧘‍♀️</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">16:49</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* WA Input Bar */}
                  <div className="p-2 bg-[#f0f2f5] flex items-center gap-2 border-t border-slate-200 shrink-0">
                    <div className="flex-1 bg-white rounded-full h-8 px-3 flex items-center text-gray-400 text-xs shadow-xs">
                      Ketik pesan...
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#00A884] flex items-center justify-center text-white shadow-xs">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIntroSlide(1)}
                  className="w-full mt-3 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Lanjut (1/3)</span>
                  <ArrowRight className="w-4 h-4 text-accent" />
                </button>
              </motion.div>
            )}

            {/* ── SLIDE 1: FOTO NUTRISI MAKANAN & RECORD DATA STRAVA ── */}
            {introSlide === 1 && (
              <motion.div
                key="slide-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-[10px] font-black text-accent-dark tracking-wider uppercase font-mono shadow-xs mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-dark animate-pulse" />
                    FITUR 2 / 3 · NUTRISI & PERFORMA OLAHRAGA
                  </span>
                  <h1 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950">
                    Analisis Foto Makanan & Record Strava
                  </h1>
                  <p className="text-xs sm:text-sm text-text-secondary mt-1 max-w-sm mx-auto">
                    Tinggal kirim foto piring makan untuk estimasi kalori & protein, atau kirim screenshot hasil lari untuk dianalisis performanya.
                  </p>
                </div>

                {/* Sub-slide Selector Tabs */}
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setSlide2Sub(0)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      slide2Sub === 0
                        ? "bg-brand-950 text-white shadow-xs"
                        : "bg-surface-muted text-text-secondary border border-surface-border"
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5 text-accent" />
                    <span>Foto Piring Makan</span>
                  </button>
                  <button
                    onClick={() => setSlide2Sub(1)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      slide2Sub === 1
                        ? "bg-brand-950 text-white shadow-xs"
                        : "bg-surface-muted text-text-secondary border border-surface-border"
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 text-accent" />
                    <span>Record Data Strava</span>
                  </button>
                </div>

                {/* WhatsApp Phone Mockup Shell */}
                <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[360px] rounded-[2.5rem] bg-slate-100 ring-8 ring-brand-900 shadow-2xl overflow-hidden flex flex-col h-[400px]">
                  {/* WA Header */}
                  <div className="bg-[#075E54] px-4 py-3 flex items-center justify-between text-white shrink-0 shadow-md">
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-brand-900 border border-white/40 shrink-0">
                        <Image
                          src="/nina-pp.webp"
                          alt="Nina"
                          fill
                          className="object-cover object-top"
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-xs leading-tight text-white">Nina · Thrivin</div>
                        <div className="text-[10px] text-white/80">Online · Personal Companion</div>
                      </div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  </div>

                  {/* Chat Content (Auto-alternates) */}
                  <div className="flex-1 bg-[#efeae2] p-3.5 flex flex-col justify-end gap-2 overflow-y-auto">
                    <AnimatePresence mode="wait">
                      {slide2Sub === 0 ? (
                        <motion.div
                          key="sub-nutrisi"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-2"
                        >
                          <div className="bg-white text-gray-800 rounded-2xl rounded-tr-none p-2.5 text-xs max-w-[85%] ml-auto shadow-2xs border border-slate-200">
                            <div className="bg-amber-50 p-2 rounded-xl mb-1 text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                              <Camera className="w-3.5 h-3.5 text-amber-700" />
                              <span>Foto Piring Makan Terkirim</span>
                            </div>
                            <p className="text-[11px] text-slate-600">Nasi padang rendang + sayur daun singkong</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">12:30</span>
                          </div>

                          <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[90%] self-start shadow-2xs">
                            <p className="font-bold text-[#075E54] mb-1">Analisis Nutrisi Nina:</p>
                            <p>Wah nasi padang! 😍 Aku estimasi ya:</p>
                            <ul className="text-[11px] mt-1 space-y-0.5 list-disc list-inside">
                              <li>Nasi putih (~150g): ~180 kkal</li>
                              <li>Rendang sapi (~80g): ~26g protein</li>
                              <li>Daun singkong: serat bagus!</li>
                            </ul>
                            <p className="mt-1 font-semibold">Total: ~450 kkal, 28g protein. Sisa target proteinmu hari ini 42g lagi ya! 🥗</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">12:31</span>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="sub-strava"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-2"
                        >
                          <div className="bg-white text-gray-800 rounded-2xl rounded-tr-none p-2.5 text-xs max-w-[85%] ml-auto shadow-2xs border border-slate-200">
                            <div className="bg-orange-50 p-2 rounded-xl mb-1 text-[11px] font-bold text-orange-900 flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5 text-[#FC4C02]" />
                              <span>Record Data Strava Terkirim</span>
                            </div>
                            <p className="text-[11px] font-mono text-slate-700">Morning Run · 5.2 km · Pace 5&apos;45&quot; · HR 148</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">06:40</span>
                          </div>

                          <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[90%] self-start shadow-2xs">
                            <p className="font-bold text-[#075E54] mb-1">Evaluasi Lari Nina:</p>
                            <p>Lari 5.2 km yang solid! 👟🔥</p>
                            <p className="mt-1 text-[11px]">Pace 5&apos;45&quot; stabil di zona aerobik (Zone 2). Denyut 148 bpm menunjukkan cardio efisien. Jangan lupa rehidrasi 500ml air ya!</p>
                            <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">06:41</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* WA Input Bar */}
                  <div className="p-2 bg-[#f0f2f5] flex items-center gap-2 border-t border-slate-200 shrink-0">
                    <div className="flex-1 bg-white rounded-full h-8 px-3 flex items-center text-gray-400 text-xs shadow-xs">
                      Ketik pesan...
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#00A884] flex items-center justify-center text-white shadow-xs">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIntroSlide(2)}
                  className="w-full mt-3 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Lanjut (2/3)</span>
                  <ArrowRight className="w-4 h-4 text-accent" />
                </button>
              </motion.div>
            )}

            {/* ── SLIDE 2: SEMUANYA HANYA DARI WHATSAPP ── */}
            {introSlide === 2 && (
              <motion.div
                key="slide-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-[10px] font-black text-accent-dark tracking-wider uppercase font-mono shadow-xs mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-dark animate-pulse" />
                    FITUR 3 / 3 · KEMUDAHAN AKSES
                  </span>
                  <h1 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950">
                    Semuanya Hanya dari WhatsApp
                  </h1>
                  <p className="text-xs sm:text-sm text-text-secondary mt-1 max-w-sm mx-auto">
                    Tanpa perlu instal aplikasi baru yang akhirnya terlupakan. Nina langsung hadir di ruang chat yang kamu buka setiap hari.
                  </p>
                </div>

                {/* WhatsApp Phone Mockup Shell */}
                <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[360px] rounded-[2.5rem] bg-slate-100 ring-8 ring-brand-900 shadow-2xl overflow-hidden flex flex-col h-[400px]">
                  {/* WA Header */}
                  <div className="bg-[#075E54] px-4 py-3 flex items-center justify-between text-white shrink-0 shadow-md">
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-brand-900 border border-white/40 shrink-0">
                        <Image
                          src="/nina-pp.webp"
                          alt="Nina"
                          fill
                          className="object-cover object-top"
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-xs leading-tight text-white">Nina · Thrivin</div>
                        <div className="text-[10px] text-white/80">Online · Personal Companion</div>
                      </div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  </div>

                  {/* Chat Content */}
                  <div className="flex-1 bg-[#efeae2] p-3.5 flex flex-col justify-end gap-2 overflow-y-auto">
                    <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[88%] self-start shadow-2xs">
                      <p>Kamu ga perlu download aplikasi apapun lagi. Aku langsung hadir di WhatsApp kamu. Chat aja santai kayak ngobrol sama teman akrab 😊</p>
                      <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">08:00</span>
                    </div>

                    <div className="bg-white text-gray-800 rounded-2xl rounded-tr-none p-3 text-xs leading-relaxed max-w-[85%] ml-auto shadow-2xs">
                      <p>Gampang banget ya, storage HP juga ga penuh aplikasi baru</p>
                      <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">08:02</span>
                    </div>

                    <div className="bg-[#DCF8C6] text-gray-800 rounded-2xl rounded-tl-none p-3 text-xs leading-relaxed max-w-[88%] self-start shadow-2xs">
                      <p>Betul! Kunci konsistensi itu akses yang paling gampang. Yuk, kita mulai jawab beberapa profil singkat biar rencana harianmu siap!</p>
                      <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">08:03</span>
                    </div>
                  </div>

                  {/* WA Input Bar */}
                  <div className="p-2 bg-[#f0f2f5] flex items-center gap-2 border-t border-slate-200 shrink-0">
                    <div className="flex-1 bg-white rounded-full h-8 px-3 flex items-center text-gray-400 text-xs shadow-xs">
                      Ketik pesan...
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#00A884] flex items-center justify-center text-white shadow-xs">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => goToStep(2)}
                  className="w-full mt-3 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow hover:scale-105 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Mulai Buat Rencana Personal (5 Menit)</span>
                  <ArrowRight className="w-4 h-4 text-accent" />
                </button>
              </motion.div>
            )}
          </div>
        )}

        {/* ─── STEP 2: NAMA (Langkah 1/7) ─── */}
        {stepNum === 2 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 1 dari 7 Survei Profil
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
                  if (e.key === "Enter" && data.name.trim()) goToStep(3);
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
              onClick={() => goToStep(3)}
              disabled={!data.name.trim()}
              className="w-full mt-6 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 3: JENIS KELAMIN & USIA (Langkah 2/7, Common-Sense Bounds: 12 - 99) ─── */}
        {stepNum === 3 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 2 dari 7 Survei Profil
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
              onClick={() => goToStep(4)}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Data Fisik</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 4: DATA FISIK (TINGGI & BERAT) — BEBAS INPUT DENGAN VALIDASI SENSIBLE ─── */}
        {stepNum === 4 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 3 dari 7 Survei Profil
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Tinggi & Berat Badan
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Ketik langsung ukuran fisikmu untuk kalkulasi BMR & BMI otomatis.
              </p>
            </div>

            {/* Inputs without aggressive clamping */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-1">
                  Tinggi (cm)
                </label>
                <input
                  type="number"
                  value={data.height || ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    updateData({ height: raw === "" ? 0 : parseInt(raw, 10) || 0 });
                  }}
                  placeholder="contoh: 170"
                  className="w-full text-2xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent py-2 outline-none font-mono text-brand-950 placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-950 uppercase tracking-wider block mb-1">
                  Berat (kg)
                </label>
                <input
                  type="number"
                  value={data.weight || ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    updateData({ weight: raw === "" ? 0 : parseInt(raw, 10) || 0 });
                  }}
                  placeholder="contoh: 65"
                  className="w-full text-2xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent py-2 outline-none font-mono text-brand-950 placeholder:text-gray-300"
                />
              </div>
            </div>

            {/* Validation warning if values are outside sensible human bounds */}
            {!isPhysicalDataSensible && (data.height !== 0 || data.weight !== 0) && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Mohon pastikan tinggi badan (120–240 cm) dan berat badan (30–250 kg) diisi dengan wajar agar kalkulasi metabolisme akurat.
                </span>
              </div>
            )}

            {/* Live Animated Graph / Visual BMI Meter */}
            {isPhysicalDataSensible && (
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
            )}

            <button
              onClick={() => goToStep(5)}
              disabled={!isPhysicalDataSensible}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Pola Aktivitas</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 5: TINGKAT AKTIVITAS & TEMPAT LATIHAN (Langkah 4/7) ─── */}
        {stepNum === 5 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 4 dari 7 Survei Profil
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
              onClick={() => goToStep(6)}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Fokus Program</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 6: FOKUS PROGRAM UTAMA (Langkah 5/7) ─── */}
        {stepNum === 6 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 5 dari 7 Survei Profil
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
              onClick={() => goToStep(7)}
              disabled={data.programFocus.length === 0}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ({data.programFocus.length} Terpilih)</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 7: TANTANGAN & GAYA NINA (Langkah 6/7) ─── */}
        {stepNum === 7 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 6 dari 7 Survei Profil
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
              onClick={() => goToStep(8)}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Lanjut ke Kontak WhatsApp</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 8: INPUT NOMOR WHATSAPP (Langkah 7/7, Primary ID) ─── */}
        {stepNum === 8 && (
          <div className="space-y-6">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 7 dari 7 Survei Profil
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && data.whatsappNumber.trim() && !phoneError) {
                      handleProceedFromWhatsApp();
                    }
                  }}
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
              onClick={handleProceedFromWhatsApp}
              disabled={!data.whatsappNumber.trim() || !!phoneError}
              className="w-full mt-4 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Hitung Blueprint & Lihat Pilihan Paket</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 9: BLUEPRINT LENGKAP & PILIHAN PAKET (Card-Card Simple, Harga Tercoret, Background Navy) ─── */}
        {stepNum === 9 && (
          <div className="space-y-8">
            {/* ── 1. BLUEPRINT LENGKAP & PERSUASIVE COPYWRITING ── */}
            <div className="space-y-4">
              <div className="text-center sm:text-left">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Blueprint Personal Selesai Disusun</span>
                </span>
                <h1 className="font-serif text-2xl sm:text-4xl font-bold text-brand-950">
                  Rencana & Strategi Pendampingan {data.name}
                </h1>
                <p className="text-xs sm:text-sm text-text-secondary mt-1.5 leading-relaxed">
                  Kamu sudah tahu apa yang ingin dicapai. Yang hilang selama ini bukan niat atau pengetahuanmu, melainkan sistem akuntabilitas harian yang konsisten hadir tanpa membuatmu lelah. Dengan blueprint ini dan Nina yang mendampingimu setiap hari di WhatsApp, progresmu terukur, terarah, dan kamu tidak lagi berjuang sendirian.
                </p>
              </div>

              {/* Blueprint Summary Cards */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white border border-brand-200 shadow-xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-surface-border">
                  <div className="p-3 rounded-2xl bg-brand-50/70 border border-brand-200/80">
                    <span className="text-[11px] uppercase font-bold text-text-muted flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-accent-dark" />
                      Target Kalori (TDEE)
                    </span>
                    <div className="text-xl font-black text-brand-950 font-mono mt-0.5">
                      ~{tdee} <span className="text-xs font-normal text-text-secondary">kkal/hari</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-brand-50/70 border border-brand-200/80">
                    <span className="text-[11px] uppercase font-bold text-text-muted flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-accent-dark" />
                      Target Protein
                    </span>
                    <div className="text-xl font-black text-brand-950 font-mono mt-0.5">
                      ~{proteinTarget} <span className="text-xs font-normal text-text-secondary">gram/hari</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-brand-50/70 border border-brand-200/80">
                    <span className="text-[11px] uppercase font-bold text-text-muted flex items-center gap-1">
                      <Droplet className="w-3.5 h-3.5 text-sky-600" />
                      Target Hidrasi
                    </span>
                    <div className="text-xl font-black text-brand-950 font-mono mt-0.5">
                      ~{hydrationTarget} <span className="text-xs font-normal text-text-secondary">Liter/hari</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-brand-900">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-muted">
                    <span className="text-text-muted">Fokus Program:</span>
                    <span className="font-bold">{data.programFocus.join(", ")}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-muted">
                    <span className="text-text-muted">Lokasi Latihan:</span>
                    <span className="font-bold">{data.workoutLocation}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-muted">
                    <span className="text-text-muted">Gaya Sapaan Nina:</span>
                    <span className="font-bold text-accent-dark">{data.communicationStyle}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-muted">
                    <span className="text-text-muted">Antisipasi Hambatan:</span>
                    <span className="font-bold text-brand-950">{data.biggestChallenge}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 2. CARD PILIHAN PAKET (Bukan Form Radio, Simple & Bersih) ── */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950">
                    Pilih Paket Pendampingan
                  </h2>
                  <p className="text-xs sm:text-sm text-text-secondary mt-1">
                    Sistem sekali bayar. Tanpa tagihan otomatis berulang.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-2xs self-start sm:self-auto shrink-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Garansi 100% Uang Kembali 3 Hari</span>
                </div>
              </div>

              {/* Promo Applied Banner with ambiguous Countdown directly beside TEMANBARU */}
              {data.promoApplied && Boolean(data.promoCode) && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-linear-to-r from-emerald-50 to-teal-50 border border-emerald-300 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-emerald-950">
                      Kode promo terpasang:
                    </span>
                    <div className="inline-flex items-center gap-1.5 bg-emerald-800 text-white px-2.5 py-1 rounded-lg font-mono text-xs font-black tracking-wider shadow-2xs">
                      <span>{data.promoCode}</span>
                    </div>

                    {/* Countdown 1 Jam tepat di samping TEMANBARU (ambigu & tanpa kata promo berakhir) */}
                    <div className="inline-flex items-center gap-1.5 bg-white/95 border border-emerald-300 px-2.5 py-1 rounded-lg text-emerald-900 shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-emerald-700 animate-pulse shrink-0" />
                      <span className="font-mono font-bold text-xs">
                        {formatCountdown(countdownSeconds)}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-md">
                      DISKON 20%
                    </span>
                  </div>
                </div>
              )}

              {/* 3 Simple Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {[
                  {
                    id: "quarter",
                    name: "Paket 3 Bulan",
                    badge: "Fase Adaptasi 90 Hari · Bangun Kebiasaan Baru",
                    badgeColor: "bg-accent/15 text-accent-dark border border-accent/30",
                    pricing: getPlanPricing("quarter"),
                  },
                  {
                    id: "half",
                    name: "Paket 6 Bulan",
                    badge: "Hemat 23% · Rekomendasi Transformasi Nyata",
                    badgeColor: "bg-emerald-50 text-emerald-800 border border-emerald-200",
                    pricing: getPlanPricing("half"),
                  },
                  {
                    id: "year",
                    name: "Paket 1 Tahun",
                    badge: "Paling Hemat 50% · Rp 39rb-an/bulan",
                    badgeColor: "bg-purple-50 text-purple-800 border border-purple-200",
                    pricing: getPlanPricing("year"),
                  },
                ].map(({ id, name, badge, badgeColor, pricing }) => {
                  const isSelected = data.selectedPlan === id;
                  return (
                    <div
                      key={id}
                      onClick={() => updateData({ selectedPlan: id as any })}
                      className={`p-4 sm:p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between relative ${
                        isSelected
                          ? "bg-brand-950 text-white border-accent shadow-xl ring-2 ring-accent/30"
                          : "bg-white text-brand-950 border-surface-border hover:border-slate-300 shadow-2xs"
                      }`}
                    >
                      <div>
                        {/* Badge */}
                        <div className={`text-[10px] font-bold px-2.5 py-1 rounded-xl mb-3 leading-snug ${
                          isSelected ? "bg-accent/25 text-accent border border-accent/40" : badgeColor
                        }`}>
                          {badge}
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-serif font-bold text-lg">{name}</h3>
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? "border-accent bg-accent" : "border-slate-300"
                            }`}
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full bg-brand-950" />}
                          </div>
                        </div>

                        {/* Struck-through Pricing with OFF 20% logo */}
                        <div className="my-2">
                          {pricing.hasDiscount ? (
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`line-through text-xs ${isSelected ? "text-slate-400" : "text-slate-400"}`}>
                                  Rp {pricing.originalTotal.toLocaleString("id-ID")}
                                </span>
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-black text-[9px] uppercase tracking-wider shadow-xs">
                                  <Percent className="w-2.5 h-2.5" />
                                  <span>OFF 20%</span>
                                </span>
                                <span className={`text-xl sm:text-2xl font-black font-mono ${
                                  isSelected ? "text-accent" : "text-brand-950"
                                }`}>
                                  Rp {pricing.discountedTotal.toLocaleString("id-ID")}
                                </span>
                              </div>
                              <div className="flex items-baseline gap-1 mt-1 text-[11px]">
                                <span className="line-through text-slate-400">
                                  ~Rp {pricing.originalMonthly.toLocaleString("id-ID")}
                                </span>
                                <span className={`font-bold ${isSelected ? "text-brand-200" : "text-accent-dark"}`}>
                                  Rp {pricing.discountedMonthly.toLocaleString("id-ID")} / bln
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-xl sm:text-2xl font-black font-mono">
                                Rp {pricing.originalTotal.toLocaleString("id-ID")}
                              </div>
                              <div className={`text-xs ${isSelected ? "text-brand-200" : "text-text-muted"}`}>
                                ~Rp {pricing.originalMonthly.toLocaleString("id-ID")} / bulan
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Subtle 1-Month Trial Option (Escape Hatch) */}
              <div className="pt-1 flex items-center justify-center text-center">
                {data.selectedPlan === "month" ? (
                  <div className="inline-flex items-center gap-2.5 py-2 px-4 rounded-2xl bg-brand-900 text-white text-xs font-semibold shadow-xs border border-brand-700">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-accent text-brand-950">
                      Coba Dulu
                    </span>
                    <span>Terpilih: Paket 1 Bulan Trial (Rp 99.000)</span>
                    <button
                      type="button"
                      onClick={() => updateData({ selectedPlan: "quarter" })}
                      className="text-accent underline text-[11px] ml-1.5 hover:text-white cursor-pointer font-bold"
                    >
                      Pilih paket program 3 bulan &rarr;
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateData({ selectedPlan: "month" })}
                    className="text-xs sm:text-sm text-text-secondary hover:text-brand-950 transition-colors inline-flex items-center gap-2 cursor-pointer group py-1.5 px-3 rounded-full hover:bg-surface-muted border border-transparent hover:border-surface-border"
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                      Coba dulu
                    </span>
                    <span>Belum yakin dengan komitmen panjang?</span>
                    <span className="underline underline-offset-4 text-brand-900 font-bold group-hover:text-accent-dark">
                      Coba 1 bulan dulu seharga Rp 99.000
                    </span>
                    <span className="text-accent-dark group-hover:translate-x-0.5 transition-transform font-bold">&rarr;</span>
                  </button>
                )}
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
                        const newExpiry = Date.now() + 3600 * 1000;
                        try {
                          localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(newExpiry));
                        } catch (e) {}
                        setCountdownSeconds(3600);
                        updateData({ promoApplied: true, promoCode: "TEMANBARU" });
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
                  <div className="text-xs text-emerald-700 font-bold flex items-center gap-1.5 pt-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {data.selectedPlan === "month"
                        ? `Kode ${data.promoCode} tersimpan untuk paket program 3, 6, & 12 bulan.`
                        : `Kode promo ${data.promoCode} berhasil terpasang (Diskon 20%).`}
                    </span>
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
                  <strong>Garansi Uang Kembali 3 Hari:</strong> Jika dalam 3 hari kamu merasa pendampingan Nina tidak cocok dengan ritmemu, dana dikembalikan 100% tanpa ribet.
                </span>
              </div>

              {/* Checkout Error Notice */}
              {checkoutError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Checkout Action Button with brand-900 background */}
              <button
                onClick={handleCheckout}
                disabled={isCheckingOut || checkoutComplete}
                className="w-full rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 text-white font-bold py-4 text-sm sm:text-base transition-all shadow-xl border border-brand-700 hover:scale-102 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isCheckingOut ? (
                  <span className="text-white font-bold">Menyiapkan Halaman Pembayaran...</span>
                ) : checkoutComplete ? (
                  <span className="text-white font-bold">✓ Mengalihkan ke checkout.thrivin.id...</span>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 text-accent" />
                    <span>Ambil Paket & Bayar Sekarang</span>
                    <ArrowRight className="w-4 h-4 text-accent" />
                  </>
                )}
              </button>

              {/* Customer Service Support Link */}
              <div className="pt-2 text-center text-xs text-text-muted">
                Punya pertanyaan atau butuh panduan pembayaran?{" "}
                <a
                  href="https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20butuh%20bantuan%20seputar%20paket%20Nina"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 transition-colors underline underline-offset-2"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 inline shrink-0" />
                  <span>Chat Customer Service via WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
