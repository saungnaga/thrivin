"use client";

import React, { useState, useEffect, useRef, use } from "react";
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
import { formatDisplayPhone } from "@/lib/phone";
import { STEP_FIELDS } from "@/lib/onboarding-steps";
import { PRIVACY_PATH, TERMS_PATH, TERMS_VERSION } from "@/lib/legal";
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
import { PLAN_CATALOG, type PlanKey } from "@/lib/plans";
import {
  PLAN_ORDER,
  REFUND_GUARANTEE_TEXT,
  REFUND_GUARANTEE_TITLE,
  formatIdr,
  monthlyPrice as catalogMonthlyPrice,
  promoAppliedNote,
  promoDiscountPill,
  savingsVsMonthlyPercent,
  TEMANBARU_PROMO,
} from "@/lib/pricing-copy";
import { planPricing, quoteFromMap, quoteKey, type PromoQuote } from "@/lib/promo-quote";

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
  selectedPlan: "month" | "quarter" | "half" | "year";
  promoCode: string;
}

/**
 * Hasil lookup status nomor (`/api/wa/session/request`). Bentuknya SENGAJA
 * minimal — tanpa OTP siapa pun bisa mengetik nomor orang lain, jadi server
 * tidak pernah mengirim nama/profil/riwayat.
 */
type WaLookup =
  | { status: "new" }
  | { status: "active"; daysLeft: number | null }
  | { status: "inactive"; daysSinceExpiry: number | null; renewalPromo: boolean };

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
  // Diisi otomatis dengan AUTO_PROMO_CODE saat langkah 9 dibuka; harga tetap dari
  // kutipan server (tabel promo_codes), bukan hitungan klien.
  promoCode: "",
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
  // WA-first TANPA OTP (keputusan owner 20/10): langkah 1 = cek status nomor.
  // Lookup ini juga yang menerbitkan cookie sesi WA — autosave progress dan
  // create-order bergantung padanya. Cookie membuktikan "nomor ini pernah
  // dicari dari browser ini", BUKAN "nomor ini milik pengguna"
  // (docs/wa-first-tanpa-otp-2026-10-20.md).
  const [waLookup, setWaLookup] = useState<WaLookup | null>(null);
  // Status langganan nomor terdaftar, dipakai blok status di langkah 9.
  const [accountStatus, setAccountStatus] = useState<WaLookup | null>(null);
  // Nomor terdaftar tapi TIDAK punya snapshot program ⇒ alur isi data dipakai
  // lagi, dengan alasan yang ditampilkan (bukan halaman pilih paket kosong).
  const [snapshotMissing, setSnapshotMissing] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutErrorCode, setCheckoutErrorCode] = useState("");
  const [isVerifyingSession, setIsVerifyingSession] = useState(false);
  const [checkoutSuccessMessage, setCheckoutSuccessMessage] = useState("");
  // Diisi hanya kalau host checkout Scalev tidak menjawab: pembeli diberi jalur
  // kontak, bukan diarahkan ke tautan mati (404 / TLS gagal).
  const [checkoutSupportUrl, setCheckoutSupportUrl] = useState("");

  // ── A7: dua persetujuan TERPISAH, dua-duanya mulai TIDAK tercentang ───────
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [reminderOptIn, setReminderOptIn] = useState(false);
  // Peringatan progress server (langkah wajib). Bukan pengganti gate server:
  // `create-order` tetap menolak kalau progress di server belum lengkap.
  const [progressWarning, setProgressWarning] = useState("");
  // Satu kunci per percobaan checkout: klik dua kali / retry jaringan memakai
  // kunci yang sama, jadi server mengembalikan order yang SAMA (bukan dua order).
  const generateCheckoutKey = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `co-${crypto.randomUUID()}`
      : `co-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const checkoutKeyRef = useRef<string>("");
  if (!checkoutKeyRef.current) {
    checkoutKeyRef.current = generateCheckoutKey();
  }

  // Reset checkout state and refresh key when navigating back from payment gateway
  useEffect(() => {
    const handlePageShow = () => {
      setIsCheckingOut(false);
      setCheckoutComplete(false);
      setCheckoutError("");
      checkoutKeyRef.current = generateCheckoutKey();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Kutipan promo dari SERVER, satu per (kode, paket) — supaya SEMUA kartu bisa
  // menampilkan harga coret sejak halaman dibuka, dan tiap kartu hanya memakai
  // kutipan paketnya sendiri (`quoteFromMap`). Klien tidak pernah menghitung
  // diskon sendiri; kutipan kosong ⇒ harga katalog.
  const [promoQuotes, setPromoQuotes] = useState<Record<string, PromoQuote>>({});
  // Kode yang benar-benar SEDANG terpasang — beda dengan isi kolom input, karena
  // pembeli boleh mengetik kode lain tanpa mencabut diskon yang sudah sah.
  const [committedCode, setCommittedCode] = useState("");
  // "kode|paket" yang sudah ditanyakan ke server: dedupe, bukan loop render.
  const quoteRequestedRef = useRef<Set<string>>(new Set());
  const autoPromoDoneRef = useRef(false);

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

  // Load saved state from localStorage (kode promo divalidasi ulang ke server)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Kode yang tersimpan dipertahankan, tapi TIDAK dianggap terpasang:
        // kuota bisa sudah habis, kode bisa dimatikan, atau sudah kedaluwarsa.
        // Validasi ulang ke server saat halaman harga dibuka.
        if (parsed.promoCode) {
          delete parsed.promoCode;
        }
        setData({
          ...DEFAULT_DATA,
          ...parsed,
        });
      }
    } catch (e) {
      console.error("Failed to load onboarding data", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save changes to localStorage
  const updateData = (fields: Partial<OnboardingData>) => {
    if (fields.selectedPlan !== undefined || fields.promoCode !== undefined) {
      checkoutKeyRef.current = generateCheckoutKey();
    }
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

  // ── Pelanggan lama: profil & status dari SERVER, bukan dari nomor di body ──
  // Satu panggilan, nomor SESI (cookie hasil lookup). `profile === null` berarti
  // belum ada snapshot program ⇒ alur isi data tetap dipakai.
  type ServerOnboarding = {
    profile: Record<string, unknown> | null;
    subscription: WaLookup | null;
  };
  const loadServerOnboarding = async (): Promise<ServerOnboarding | null> => {
    try {
      const res = await fetch("/api/onboarding/progress", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) return null;
      const sub = body.subscription;
      const subscription: WaLookup | null =
        sub?.status === "active"
          ? {
              status: "active",
              daysLeft: typeof sub.daysLeft === "number" ? sub.daysLeft : null,
            }
          : sub?.status === "inactive"
            ? {
                status: "inactive",
                daysSinceExpiry:
                  typeof sub.daysSinceExpiry === "number" ? sub.daysSinceExpiry : null,
                renewalPromo: sub.renewalPromo === true,
              }
            : null;
      return {
        profile:
          body.profile && typeof body.profile === "object"
            ? (body.profile as Record<string, unknown>)
            : null,
        subscription,
      };
    } catch {
      return null;
    }
  };

  // Isi wizard dari profil tersimpan. Merge ke state TERBARU (bukan snapshot
  // render) supaya ketikan yang sedang berjalan tidak tertimpa, dan tulis ke
  // localStorage lewat jalur yang sama dengan `updateData`.
  const applySavedProfile = (profile: Record<string, unknown>) => {
    const focusRaw = profile.programFocus;
    const focus = (Array.isArray(focusRaw) ? focusRaw.map(String) : String(focusRaw ?? "").split(","))
      .map((v) => v.trim())
      .filter(Boolean);
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const fields: Partial<OnboardingData> = {
      name: String(profile.name ?? "").trim() || "Kawan Thrivin",
      gender: profile.gender as OnboardingData["gender"],
      age: num(profile.age),
      weight: num(profile.weight),
      height: num(profile.height),
      activityLevel: profile.activityLevel as OnboardingData["activityLevel"],
      workoutLocation: profile.workoutLocation as OnboardingData["workoutLocation"],
      programFocus: focus.length ? focus : undefined,
      biggestChallenge: String(profile.biggestChallenge ?? "").trim() || undefined,
      communicationStyle: profile.communicationStyle as OnboardingData["communicationStyle"],
    };
    for (const key of Object.keys(fields) as Array<keyof OnboardingData>) {
      if (fields[key] === undefined) delete fields[key];
    }
    setData((prev) => {
      const next = { ...prev, ...fields };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save onboarding data", e);
      }
      return next;
    });
  };

  // ── A2: kirim langkah ke server (state onboarding punya rumah server-side) ──
  // Server yang memutuskan "lengkap atau belum"; kartu ini hanya UX tambahan.
  // Kalau simpan gagal, peringatan muncul dan gate `create-order` tetap menolak.
  useEffect(() => {
    if (!isLoaded) return;
    if (!STEP_FIELDS[stepNum]) return;
    const fields = STEP_FIELDS[stepNum];
    const payload: Record<string, unknown> = {};
    for (const field of fields) payload[field] = (data as unknown as Record<string, unknown>)[field];

    const timer = setTimeout(() => {
      fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNum, data: payload }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body?.ok) {
            setProgressWarning(
              body?.error ||
                (body?.code === "SESSION_REQUIRED"
                  ? "Sesi verifikasi nomor WhatsApp tidak ditemukan. Verifikasi ulang sebelum bayar."
                  : "Profil belum tersimpan di server. Coba lanjutkan; kalau tetap gagal, verifikasi ulang nomor.")
            );
            return;
          }
          setProgressWarning("");
        })
        .catch(() => setProgressWarning("Gagal menyimpan profil ke server. Periksa koneksi."));
    }, 400);

    return () => clearTimeout(timer);
  }, [isLoaded, stepNum, data]);

  // ── Langkah 9: isi ringkasan dari profil tersimpan + status langganan ──────
  // Sekali per muat halaman. Server yang menjawab (nomor SESI); kalau tidak ada
  // snapshot, tidak ada yang diisi — alur nomor baru tidak tersentuh.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      const server = await loadServerOnboarding();
      if (cancelled || !server) return;
      if (server.subscription) setAccountStatus(server.subscription);
      if (server.profile) applySavedProfile(server.profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  // Kode promo dipasang otomatis saat langkah 9 dibuka (permintaan owner:
  // "kode kupon temanbaru harusnya otomatis terpasang"). Nilai diambil dari web.
  useEffect(() => {
    if (!isLoaded || stepNum !== 9) return;
    if (autoPromoDoneRef.current) return;
    autoPromoDoneRef.current = true;
    const autoCode = TEMANBARU_PROMO.code;
    if (data.promoCode.trim().toUpperCase() !== autoCode) {
      updateData({ promoCode: autoCode });
    }
    setCommittedCode(autoCode);
  }, [isLoaded, stepNum, data.promoCode]);

  const goToStep = (targetStep: number) => {
    if (targetStep < 1) {
      router.push("/nina");
      return;
    }
    if (targetStep > TOTAL_STEPS) return;
    router.push(`/nina/onboarding/${targetStep}`);
  };

  // CTA "Perpanjang sekarang" menggulir ke daftar paket di halaman yang sama
  // (bukan navigasi ke halaman lain) lalu memindahkan fokus ke sana.
  const scrollToPlans = () => {
    const el = document.getElementById("pilih-paket");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
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

  // Pricing display. Angka TIDAK diketik ulang di JSX: semua dari PLAN_CATALOG
  // (kontrak S0 §11). Badge "hemat X%" dihitung dari katalog juga, supaya klaim
  // tidak pernah menyimpang dari harga server.
  const PLANS: Record<string, {
    name: string;
    duration: string;
    totalPrice: number;
    monthlyPrice: number;
    badge: string;
    desc: string;
  }> = {
    month: {
      name: PLAN_CATALOG.month.name,
      duration: "1 Bulan",
      totalPrice: PLAN_CATALOG.month.basePrice,
      monthlyPrice: catalogMonthlyPrice("month"),
      badge: "Coba dulu · Tanpa Komitmen Panjang",
      desc: "Langkah awal mencoba langsung interaksi harian bersama Nina.",
    },
    quarter: {
      name: PLAN_CATALOG.quarter.name,
      duration: "3 Bulan",
      totalPrice: PLAN_CATALOG.quarter.basePrice,
      monthlyPrice: catalogMonthlyPrice("quarter"),
      badge: "Fase Adaptasi 90 Hari · Bangun Kebiasaan Baru",
      desc: "Durasi optimal pembentukan kebiasaan baru.",
    },
    half: {
      name: PLAN_CATALOG.half.name,
      duration: "6 Bulan",
      totalPrice: PLAN_CATALOG.half.basePrice,
      monthlyPrice: catalogMonthlyPrice("half"),
      badge: `Hemat ${savingsVsMonthlyPercent("half")}% vs bayar bulanan`,
      desc: "Transformasi kebiasaan dan metabolisme nyata.",
    },
    year: {
      name: PLAN_CATALOG.year.name,
      duration: "12 Bulan",
      totalPrice: PLAN_CATALOG.year.basePrice,
      monthlyPrice: catalogMonthlyPrice("year"),
      badge: `Paling Hemat ${savingsVsMonthlyPercent("year")}% vs bayar bulanan`,
      desc: "Gaya hidup permanen dengan pendampingan penuh.",
    },
  };

  const currentPlan = PLANS[data.selectedPlan] || PLANS.quarter;
  // Angka diskon TIDAK dihitung di klien: server (promo_codes + RPC atomik) yang
  // memutuskan kuota/kedaluwarsa/non-aktif, dan hanya angka server yang tampil.
  // Tiap paket memakai kutipannya SENDIRI (`quoteFromMap`), jadi satu kartu tidak
  // pernah meminjam angka kartu lain — dan tidak perlu dipilih dulu.
  const promoQuote = quoteFromMap(promoQuotes, committedCode, data.selectedPlan);
  const discountAmount = promoQuote ? promoQuote.discount : 0;
  const finalPrice = promoQuote ? promoQuote.finalPrice : currentPlan.totalPrice;

  // Struck-through helper for each card: SEMUA paket, sejak halaman dibuka.
  const getPlanPricing = (planKey: PlanKey) =>
    planPricing(planKey, quoteFromMap(promoQuotes, committedCode, planKey));

  /**
   * Tanya server satu kutipan promo (READ-ONLY). 429/putus koneksi diulang SEKALI
   * dengan jeda pendek: jalur otomatis tidak boleh memunculkan banner merah
   * karena halaman memang memuat beberapa kutipan sendiri. `error` hanya dipakai
   * aksi eksplisit (menekan "Terapkan").
   */
  const requestPromoQuote = async (
    code: string,
    planId: PlanKey,
    phone: string
  ): Promise<{ quote: PromoQuote | null; error?: string }> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/scalev/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkPromoOnly: true,
            promoCode: code,
            planId,
            customerPhone: phone,
          }),
        });
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        const check = await res.json().catch(() => null);
        if (!res.ok || !check?.valid) {
          return { quote: null, error: check?.error || "Kode promo tidak bisa dipakai." };
        }
        return {
          quote: {
            code: String(check.code || code),
            planId,
            discount: Number(check.discount || 0),
            finalPrice: Number(check.finalPrice ?? 0),
          },
        };
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    }
    return { quote: null, error: "Gagal memeriksa kode promo. Coba lagi." };
  };

  // Satu permintaan per (kode, paket) saat halaman harga dibuka, didedupe lewat
  // `quoteRequestedRef` supaya render ulang tidak membanjiri server. Kutipan yang
  // ditolak server (mis. paket 1 bulan, minMonths 3) cukup dibuang: paket itu
  // tampil harga normal tanpa coretan, TANPA error merah.
  useEffect(() => {
    if (!isLoaded || stepNum !== 9 || !committedCode) return;
    const missing = PLAN_ORDER.filter(
      (planId) => !quoteRequestedRef.current.has(quoteKey(committedCode, planId))
    );
    if (missing.length === 0) return;
    for (const planId of missing) quoteRequestedRef.current.add(quoteKey(committedCode, planId));
    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(
        missing.map(async (planId) => {
          const { quote } = await requestPromoQuote(committedCode, planId, data.whatsappNumber);
          return [planId, quote] as const;
        })
      );
      if (cancelled) return;
      setPromoQuotes((prev) => {
        const next = { ...prev };
        for (const [planId, quote] of fetched) {
          if (quote) next[quoteKey(committedCode, planId)] = quote;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, stepNum, committedCode, data.whatsappNumber]);

  // Phone validation
  const validatePhone = (phone: string) => {
    const formatted = formatDisplayPhone(phone);
    if (!formatted) return "Nomor WhatsApp wajib diisi.";
    if (!formatted.startsWith("08")) return "Nomor WhatsApp harus diawali 08 (contoh: 0812xxxxxxxx).";
    if (formatted.length < 10) return "Nomor terlalu pendek (minimal 10 digit).";
    if (formatted.length > 13) return "Nomor melebihi batas (maksimal 13 digit).";
    return "";
  };

  const handleQuickVerifyWa = async () => {
    const formatted = formatDisplayPhone(data.whatsappNumber);
    if (!formatted) {
      goToStep(1);
      return;
    }
    setIsVerifyingSession(true);
    try {
      const res = await fetch("/api/wa/session/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatted }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setCheckoutError("");
        setCheckoutErrorCode("");
        setCheckoutSuccessMessage("Sesi nomor WhatsApp berhasil diverifikasi! Silakan klik 'Ambil Paket & Bayar Sekarang' di bawah.");
      } else {
        goToStep(1);
      }
    } catch {
      goToStep(1);
    } finally {
      setIsVerifyingSession(false);
    }
  };

  // Langkah 1: cek status nomor ke server (TANPA OTP) + terbitkan cookie sesi.
  // Server yang memutuskan status; klien tidak pernah menebak.
  const handleWaLookup = async () => {
    const formatted = formatDisplayPhone(data.whatsappNumber);
    updateData({ whatsappNumber: formatted });
    const err = validatePhone(formatted);
    if (err) {
      setPhoneError(err);
      return;
    }
    setPhoneError("");
    setIsLookingUp(true);
    try {
      const res = await fetch("/api/wa/session/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatted }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setPhoneError(body?.error || "Status nomor tidak bisa dicek. Coba lagi.");
        return;
      }
      if (body.status === "new") setWaLookup({ status: "new" });
      else if (body.status === "active")
        setWaLookup({ status: "active", daysLeft: body.daysLeft ?? null });
      else if (body.status === "inactive")
        setWaLookup({
          status: "inactive",
          daysSinceExpiry: body.daysSinceExpiry ?? null,
          renewalPromo: body.renewalPromo === true,
        });
      else {
        setPhoneError("Status nomor tidak dikenali. Coba lagi.");
        return;
      }

      // Nomor BARU: slide intro lalu isi data — alur lama, tidak diubah.
      if (body.status === "new") return;

      // Nomor TERDAFTAR: jangan suruh mengisi ulang. Profil program & status
      // datang dari server lewat nomor SESI (cookie dari lookup ini), lalu
      // langsung ke halaman pilih paket (langkah 9).
      const server = await loadServerOnboarding();
      if (server?.subscription) setAccountStatus(server.subscription);
      if (server?.profile) {
        applySavedProfile(server.profile);
        goToStep(9);
        return;
      }
      // Terdaftar tapi belum punya snapshot program: alur isi data tetap jalan,
      // dan alasannya ditampilkan (jangan halaman pilih paket kosong).
      setSnapshotMissing(true);
    } catch {
      setPhoneError("Status nomor tidak bisa dicek. Coba lagi.");
    } finally {
      setIsLookingUp(false);
    }
  };

  // Validasi kode promo ke server (dry run: tidak memakai kuota). Hanya kode
  // yang benar-benar valid yang dianggap "terpasang" — sisa kuota, kedaluwarsa,
  // dan status aktif semuanya ditegakkan server. Ini satu-satunya jalur yang
  // boleh menampilkan error merah: pembeli menekan "Terapkan" secara eksplisit.
  const applyPromo = async () => {
    const typedCode = data.promoCode.trim().toUpperCase();
    setCheckoutError("");
    if (!typedCode) {
      setCommittedCode("");
      return;
    }
    const { quote, error } = await requestPromoQuote(
      typedCode,
      data.selectedPlan,
      data.whatsappNumber
    );
    if (!quote) {
      // Diskon yang sudah sah tidak dicabut karena salah ketik; kolomnya
      // dikembalikan ke kode yang benar-benar terpasang supaya layar tidak bohong.
      updateData({ promoCode: committedCode });
      setCheckoutError(error || "Kode promo tidak bisa dipakai.");
      return;
    }
    quoteRequestedRef.current.add(quoteKey(quote.code, quote.planId));
    setPromoQuotes((prev) => ({ ...prev, [quoteKey(quote.code, quote.planId)]: quote }));
    setCommittedCode(quote.code);
    updateData({ promoCode: quote.code });
  };

  // Handle WhatsApp submission with calculation/syncing animation
  const handleProceedFromWhatsApp = () => {
    const formatted = formatDisplayPhone(data.whatsappNumber);
    updateData({ whatsappNumber: formatted });
    const err = validatePhone(formatted);
    if (err) {
      setPhoneError(err);
      return;
    }
    setPhoneError("");
    fbqTrack("Lead", {
      content_name: "Onboarding WhatsApp Submission",
    });

    // Otomatis refresh sesi nomor WhatsApp sebelum masuk ke Step 9
    fetch("/api/wa/session/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: formatted }),
    }).catch(() => {});

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

  // Scalev API Dynamic Checkout (checkout.thrivin.com)
  const handleCheckout = async () => {
    if (!termsAccepted) {
      // Kontrol UI ini tambahan; server menolak sendiri kalau consent tidak ada.
      setCheckoutError("Centang persetujuan Syarat & Ketentuan dulu sebelum bayar.");
      return;
    }
    // Selalu buat checkout key segar agar checkout ulang / navigasi back tidak nyangkut di pesanan lama
    checkoutKeyRef.current = generateCheckoutKey();
    setCheckoutError("");
    setIsCheckingOut(true);
    setCheckoutError("");

    // Meta Pixel: InitiateCheckout
    fbqTrack("InitiateCheckout", {
      content_name: currentPlan.name,
      value: finalPrice,
      currency: "IDR",
    });

    try {
      // 1) Simpan persetujuan SEBELUM popup pembayaran. Gagal ⇒ tidak lanjut.
      const consentRes = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termsAccepted: true,
          reminderOptIn,
          idempotencyKey: checkoutKeyRef.current,
        }),
      });
      const consentBody = await consentRes.json().catch(() => ({}));
      if (!consentRes.ok || !consentBody?.ok) {
        setIsCheckingOut(false);
        setCheckoutError(
          consentBody?.error ||
            "Persetujuanmu belum tersimpan. Coba lagi — pembayaran belum dibuka."
        );
        return;
      }

      // 2) Order. Harga, paket, dan kelengkapan profil ditentukan server. Kode
      // promo hanya dikirim kalau server memang mengutipnya untuk paket ini —
      // kode yang tidak berlaku (mis. TEMANBARU di paket 1 bulan) tidak boleh
      // ikut, karena server akan menolak ordernya.
      const response = await fetch("/api/scalev/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: data.selectedPlan,
          customerPhone: data.whatsappNumber,
          promoCode: promoQuote ? promoQuote.code : "",
          idempotencyKey: checkoutKeyRef.current,
        }),
      });

      const resData = await response.json();

      // Scalev contract: `redirectUrl` (public order read) is the canonical
      // checkout destination. `paymentUrl` stays as the fallback for older
      // responses / when the storefront key is not configured.
      const checkoutUrl = resData.redirectUrl || resData.paymentUrl;

      if (!response.ok || !checkoutUrl) {
        // Order ditolak server (promo habis/kedaluwarsa/sudah dipakai, atau gate
        // identitas). Kutipan yang sedang dipegang dicabut: diskon yang tidak akan
        // didapat tidak boleh tetap tampil di layar.
        setCheckoutErrorCode(resData.code || "");
        if (resData.code && committedCode) {
          setPromoQuotes((prev) => {
            const next = { ...prev };
            for (const planId of PLAN_ORDER) delete next[quoteKey(committedCode, planId)];
            return next;
          });
          setCommittedCode("");
          updateData({ promoCode: "" });
        }
        throw new Error(
          resData.error || "Gagal membuat sesi pembayaran di checkout.thrivin.com"
        );
      }

      // Order sudah tercetak, tapi halaman bayar Scalev tidak bisa dibuka dari
      // server (host custom domain mati). Jangan kirim pembeli ke tautan mati.
      if (resData.paymentPageReachable === false) {
        setCheckoutSupportUrl(typeof resData.supportUrl === "string" ? resData.supportUrl : "");
        setIsCheckingOut(false);
        setCheckoutError(
          "Halaman pembayaran sedang gangguan. Pesananmu sudah tercatat — chat Nina di WhatsApp supaya dibantu langsung."
        );
        return;
      }

      setCheckoutComplete(true);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      checkoutKeyRef.current = generateCheckoutKey();
      setIsCheckingOut(false);
      console.error("Scalev checkout error:", err);
      setCheckoutError(
        err?.message || "Terjadi kesalahan saat menyiapkan halaman pembayaran."
      );
    }
  };

  // Form nomor WA tidak butuh localStorage, jadi dirender juga SEBELUM `isLoaded`
  // — supaya HTML dari server sudah memuat input nomor (funnel + test urutan).
  const renderPhoneStep = () => (
          <form
            className="space-y-6"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!isLookingUp) handleWaLookup();
            }}
          >
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-dark block mb-1">
                Langkah 1 · Cek Nomor
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Nomor WhatsApp Kamu
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Nomor ini menjadi ID utama akunmu dan jalur Nina menyapamu setiap hari.
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white border border-brand-200 shadow-xs space-y-3">
              <label
                htmlFor="wa-phone"
                className="text-xs font-bold text-brand-950 uppercase tracking-wider block"
              >
                Nomor WhatsApp Aktif
              </label>

              <div className="relative flex items-center">
                <div className="absolute left-3.5 flex items-center gap-1 text-sm font-bold text-brand-900 pr-2 border-r border-slate-200">
                  <span>🇮🇩</span>
                  <span>+62</span>
                </div>
                <input
                  id="wa-phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  autoFocus
                  required
                  aria-describedby="wa-phone-hint"
                  value={data.whatsappNumber}
                  onChange={(e) => {
                    const val = e.target.value;
                    const formatted = formatDisplayPhone(val);
                    updateData({ whatsappNumber: formatted || val });
                    setPhoneError(validatePhone(formatted || val));
                  }}
                  onBlur={(e) => {
                    const formatted = formatDisplayPhone(e.target.value);
                    if (formatted) {
                      updateData({ whatsappNumber: formatted });
                      setPhoneError(validatePhone(formatted));
                    }
                  }}
                  placeholder="0812-3456-7890"
                  className="w-full pl-20 pr-4 py-3.5 text-lg font-bold text-brand-950 border border-slate-200 rounded-xl focus:border-brand-900 outline-none"
                />
              </div>

              {phoneError && (
                <div className="text-rose-600 text-xs flex items-center gap-1 pt-1" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{phoneError}</span>
                </div>
              )}

              <p id="wa-phone-hint" className="text-[11px] text-text-muted leading-relaxed">
                Format nomor HP diawali angka 0 (contoh: 0812xxxxxxxx). Jika diketik tanpa 0 atau dengan +62, otomatis disesuaikan diawali 0.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Privasi terjaga. Nomor tidak akan dibagikan ke pihak ketiga.</span>
            </div>

            <button
              type="submit"
              disabled={isLookingUp || !data.whatsappNumber.trim() || !!phoneError}
              className="w-full mt-4 min-h-11 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isLookingUp ? "Mengecek nomor…" : "Lanjut"}</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </form>
  );

  if (!isLoaded) {
    return stepNum === 1 ? (
      <main className="min-h-screen bg-surface font-sans text-brand-950 px-4 py-6">
        <div className="mx-auto w-full max-w-md">{renderPhoneStep()}</div>
      </main>
    ) : null;
  }

  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col selection:bg-brand-100 selection:text-brand-900">
      {/* ─── Top Step Header Bar ─── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-surface-border h-14 flex items-center px-4 sm:px-6">
        <div className={`mx-auto w-full flex items-center gap-3 ${stepNum === 9 ? "max-w-3xl" : "max-w-md"}`}>
          {stepNum === 1 && waLookup === null ? (
            <>
              <button
                onClick={() => router.push("/nina")}
                className="p-1.5 -ml-1.5 rounded-full hover:bg-surface-muted text-text-secondary hover:text-brand-900 transition-colors cursor-pointer"
                aria-label="Kembali"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 bg-surface-border h-2 rounded-full overflow-hidden">
                <div className="bg-brand-900 h-full w-1/12 rounded-full" />
              </div>
              <span className="text-[11px] font-bold text-text-muted font-mono shrink-0">
                Langkah 1 · Cek Nomor
              </span>
            </>
          ) : stepNum === 1 ? (
            <>
              <button
                onClick={() => {
                  if (introSlide > 0) {
                    setIntroSlide(introSlide - 1);
                  } else {
                    router.push("/nina");
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
                onClick={() => goToStep(accountStatus ? 1 : 8)}
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
        
        {/* ─── STEP 1a: CEK NOMOR WHATSAPP (WA-first, TANPA OTP) ─── */}

        {/* ─── STEP 1a: CEK NOMOR WHATSAPP (WA-first, TANPA OTP) ─── */}
        {stepNum === 1 && waLookup === null && renderPhoneStep()}

        {/* ─── STEP 1b: NOMOR SUDAH ADA — LANGGANAN AKTIF / BERAKHIR ─── */}
        {stepNum === 1 && waLookup !== null && waLookup.status !== "new" && (
          <div className="space-y-4" aria-live="polite">
            <div className="p-5 rounded-3xl bg-white border border-brand-200 shadow-xs space-y-2">
              {waLookup.status === "active" ? (
                <>
                  <h1 className="font-serif text-2xl font-bold text-brand-950">
                    Langganan aktif
                  </h1>
                  <p className="text-xs sm:text-sm text-text-secondary">
                    Sisa masa aktif:{" "}
                    {waLookup.daysLeft === null ? "-" : `${waLookup.daysLeft} hari lagi`}.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="font-serif text-2xl font-bold text-brand-950">
                    Langganan sudah berakhir
                  </h1>
                  <p className="text-xs sm:text-sm text-text-secondary">
                    Berakhir{" "}
                    {waLookup.daysSinceExpiry === null
                      ? "-"
                      : `${waLookup.daysSinceExpiry} hari lalu`}
                    .
                  </p>
                  {waLookup.renewalPromo && (
                    <div className="mt-2 rounded-2xl bg-brand-50 border border-brand-200 p-3">
                      <p className="text-xs font-bold text-brand-950">
                        Ada penawaran {TEMANBARU_PROMO.code}: diskon{" "}
                        {TEMANBARU_PROMO.discountPercent}% untuk perpanjangan.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Nomor terdaftar & punya snapshot ⇒ halaman ini langsung pindah ke
                langkah 9 (lihat handleWaLookup). Yang tersisa di sini hanya dua
                kasus: sedang memuat, atau snapshot program belum ada. */}
            {snapshotMissing ? (
              <>
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                  Data programmu belum tersimpan lengkap di server, jadi kita isi ulang
                  sebentar ya — datanya tetap dipakai Nina setelah pembayaran.
                </div>
                <button
                  onClick={() => goToStep(2)}
                  className="w-full min-h-11 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 text-sm transition-all shadow-glow flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Isi data dari awal</span>
                  <ArrowRight className="w-4 h-4 text-accent" />
                </button>
              </>
            ) : (
              <p className="text-xs text-text-secondary text-center py-2" aria-live="polite">
                Memuat data programmu…
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setWaLookup(null);
                setPhoneError("");
                setSnapshotMissing(false);
              }}
              className="w-full min-h-11 text-xs font-bold text-text-secondary underline underline-offset-4 cursor-pointer"
            >
              Ganti nomor
            </button>
          </div>
        )}

        {/* ─── STEP 1c: 3 FEATURE SLIDES (setelah nomor dicek, nomor baru) ─── */}
        {stepNum === 1 && waLookup?.status === "new" && (
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
              <span>Lanjut ke Konfirmasi Nomor</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        )}

        {/* ─── STEP 8: KONFIRMASI NOMOR (nomor sudah dicek di langkah 1) ─── */}
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
              <span className="text-xs font-bold text-brand-950 uppercase tracking-wider block">
                Nomor WhatsApp Aktif
              </span>

              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-surface-muted border border-slate-200">
                <Phone className="w-4 h-4 text-brand-900 shrink-0" />
                <span className="text-lg font-bold text-brand-950 font-mono tracking-wide">
                  {formatDisplayPhone(data.whatsappNumber) || "-"}
                </span>
              </div>

              <p className="text-[11px] text-text-muted leading-relaxed">
                Nomor ini sudah dicek di langkah pertama. Mau ganti nomor?{" "}
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="font-bold text-accent-dark underline underline-offset-4 cursor-pointer"
                >
                  Cek nomor lain
                </button>
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
                  Rencana & Strategi Pendampingan {data.name.trim() || "Kamu"}
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

            {/* ── 1b. STATUS LANGGANAN — di ATAS daftar paket ── */}
            {accountStatus && accountStatus.status !== "new" && (
              <div
                className="p-5 sm:p-6 rounded-3xl bg-white border border-brand-200 shadow-xs space-y-3"
                aria-live="polite"
              >
                {accountStatus.status === "active" ? (
                  <>
                    <h2 className="font-serif text-xl sm:text-2xl font-bold text-brand-950 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      Langganan aktif
                    </h2>
                    <p className="text-xs sm:text-sm text-text-secondary">
                      Sisa masa aktif:{" "}
                      {accountStatus.daysLeft === null
                        ? "sedang diproses"
                        : `${accountStatus.daysLeft} hari lagi`}
                      . Perpanjang sekarang supaya pendampingan Nina tidak terputus.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-serif text-xl sm:text-2xl font-bold text-brand-950 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                      Langganan sudah berakhir
                    </h2>
                    <p className="text-xs sm:text-sm text-text-secondary">
                      Berakhir{" "}
                      {accountStatus.daysSinceExpiry === null
                        ? "sebelumnya"
                        : `${accountStatus.daysSinceExpiry} hari lalu`}
                      . Aktifkan lagi untuk melanjutkan pendampingan Nina.
                    </p>
                    {accountStatus.renewalPromo && (
                      <div className="rounded-2xl bg-brand-50 border border-brand-200 p-3">
                        <p className="text-xs font-bold text-brand-950">
                          Ada penawaran {TEMANBARU_PROMO.code}: diskon{" "}
                          {TEMANBARU_PROMO.discountPercent}% untuk perpanjangan.
                        </p>
                      </div>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={scrollToPlans}
                  className="w-full sm:w-auto min-h-11 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold px-6 py-3 text-sm transition-all shadow-glow inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Perpanjang sekarang</span>
                  <ArrowRight className="w-4 h-4 text-accent" />
                </button>
              </div>
            )}

            {/* ── 2. CARD PILIHAN PAKET (Bukan Form Radio, Simple & Bersih) ── */}
            <div id="pilih-paket" tabIndex={-1} className="space-y-4 pt-2 outline-none">
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
                  <span>{REFUND_GUARANTEE_TITLE}</span>
                </div>
              </div>

              {/* 3 Simple Cards Grid — badge & harga dari PLANS (turunan PLAN_CATALOG).
                  Kartu = <button> supaya bisa dijangkau keyboard & punya nama aksesibel. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {[
                  {
                    id: "quarter",
                    name: "Paket 3 Bulan",
                    badge: PLANS.quarter.badge,
                    badgeColor: "bg-accent/15 text-accent-dark border border-accent/30",
                    pricing: getPlanPricing("quarter"),
                  },
                  {
                    id: "half",
                    name: "Paket 6 Bulan",
                    badge: PLANS.half.badge,
                    badgeColor: "bg-emerald-50 text-emerald-800 border border-emerald-200",
                    pricing: getPlanPricing("half"),
                  },
                  {
                    id: "year",
                    name: "Paket 1 Tahun",
                    badge: PLANS.year.badge,
                    badgeColor: "bg-purple-50 text-purple-800 border border-purple-200",
                    pricing: getPlanPricing("year"),
                  },
                ].map(({ id, name, badge, badgeColor, pricing }) => {
                  const isSelected = data.selectedPlan === id;
                  // Pill diskon dari kutipan SERVER paket INI (bukan angka paket
                  // terpilih, bukan persentase hardcoded).
                  const promoPill = pricing.hasDiscount
                    ? promoDiscountPill(
                        pricing.originalTotal - pricing.discountedTotal,
                        pricing.originalTotal
                      )
                    : null;
                  return (
                    <button
                      type="button"
                      key={id}
                      onClick={() => updateData({ selectedPlan: id as any })}
                      aria-pressed={isSelected}
                      aria-label={`${name} — Rp ${formatIdr(pricing.discountedTotal)}, ${pricing.hasDiscount ? "dengan promo" : "harga normal"}`}
                      className={`text-left w-full p-4 sm:p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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

                        {/* Struck-through Pricing + pill diskon dari kutipan server */}
                        <div className="my-2">
                          {pricing.hasDiscount ? (
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`line-through text-xs ${isSelected ? "text-slate-400" : "text-slate-400"}`}>
                                  Rp {pricing.originalTotal.toLocaleString("id-ID")}
                                </span>
                                {promoPill && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-black text-[9px] uppercase tracking-wider shadow-xs">
                                    {promoPill.startsWith("OFF") && <Percent className="w-2.5 h-2.5" />}
                                    <span>{promoPill}</span>
                                  </span>
                                )}
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
                    </button>
                  );
                })}
              </div>

              {/* Paket 1 Bulan — tetap penawaran TERAKHIR setelah grid, tapi dibuat
                  jelas & mudah dilihat (permintaan owner A1). Tombol nyata: keyboard,
                  focus ring, dan nama aksesibel. Harga tetap dari katalog. */}
              <div className="pt-1">
                {data.selectedPlan === "month" ? (
                  <div className="w-full rounded-3xl border-2 border-accent bg-brand-900 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg">
                    <div className="flex items-center gap-3 text-left">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-accent text-brand-950 shrink-0">
                        Coba Dulu
                      </span>
                      <div>
                        <div className="font-serif font-bold text-base sm:text-lg">{PLANS.month.name}</div>
                        <div className="text-[11px] text-brand-200">{PLANS.month.desc}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-start sm:self-auto">
                      <span className="font-mono font-black text-lg sm:text-xl">
                        Rp {formatIdr(getPlanPricing("month").discountedTotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateData({ selectedPlan: "quarter" })}
                        className="text-accent underline text-[11px] hover:text-white cursor-pointer font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        Pilih paket program 3 bulan &rarr;
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateData({ selectedPlan: "month" })}
                    aria-pressed={false}
                    aria-label={`${PLANS.month.name} — Rp ${formatIdr(getPlanPricing("month").discountedTotal)}, coba 1 bulan dulu`}
                    className="w-full rounded-3xl border-2 border-brand-200 bg-white hover:bg-brand-50 text-brand-950 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs cursor-pointer text-left transition-colors group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-slate-200 text-slate-700 shrink-0">
                        Coba dulu
                      </span>
                      <div>
                        <div className="font-serif font-bold text-base sm:text-lg">{PLANS.month.name}</div>
                        <div className="text-[11px] text-text-secondary">
                          Belum yakin dengan komitmen panjang? {PLANS.month.badge}.
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-start sm:self-auto">
                      <span className="font-mono font-black text-lg sm:text-xl">
                        Rp {formatIdr(getPlanPricing("month").discountedTotal)}
                      </span>
                      <span className="px-4 py-2 rounded-full bg-brand-900 group-hover:bg-brand-800 text-white text-xs font-bold whitespace-nowrap">
                        Pilih 1 Bulan
                      </span>
                    </div>
                  </button>
                )}
              </div>

              {/* Promo code input — divalidasi server, bukan dihitung klien */}
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
                      placeholder="KODE PROMO"
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold uppercase rounded-xl border border-surface-border bg-white text-brand-950 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={applyPromo}
                    className="px-4 py-2 rounded-xl bg-brand-900 text-white text-xs font-bold hover:bg-brand-800 cursor-pointer"
                  >
                    Terapkan
                  </button>
                </div>

                {promoQuote && (
                  <div className="text-xs text-emerald-700 font-bold flex items-center gap-1.5 pt-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{promoAppliedNote(promoQuote.code, promoQuote.finalPrice)}</span>
                  </div>
                )}
              </div>

              {/* Price Summary Breakdown */}
              <div className="p-4 rounded-2xl bg-white border border-brand-200 space-y-1.5 text-xs text-brand-950">
                <div className="flex justify-between">
                  <span>Subtotal ({currentPlan.name})</span>
                  <span className="font-mono">Rp {currentPlan.totalPrice.toLocaleString("id-ID")}</span>
                </div>
                {promoQuote && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>{`Potongan Kode Promo (${promoQuote.code})`}</span>
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

              {/* 3-Day Money Back Guarantee Banner — tepat di atas CTA, teks dari satu
                  sumber (pricing-copy.ts) supaya tidak pernah lebih kuat dari /privacy §3 */}
              <div
                role="note"
                className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 flex items-start gap-3 text-xs sm:text-sm text-emerald-900 leading-relaxed"
              >
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong className="font-extrabold">{REFUND_GUARANTEE_TITLE}.</strong>{" "}
                  {REFUND_GUARANTEE_TEXT}
                </span>
              </div>

              {/* ── A7: persetujuan checkout — dua kotak TERPISAH, awal kosong ── */}
              <div className="p-4 rounded-2xl bg-white border border-brand-200 space-y-3 text-xs text-brand-950">
                <div className="flex items-start gap-2.5">
                  <input
                    id="consent-terms"
                    name="consent-terms"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    aria-describedby="consent-terms-help"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-400 text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2 cursor-pointer"
                  />
                  <label htmlFor="consent-terms" className="leading-relaxed cursor-pointer">
                    Saya sudah membaca dan menyetujui{" "}
                    <a
                      href={TERMS_PATH}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold underline underline-offset-2 text-brand-900 hover:text-brand-700"
                    >
                      Syarat &amp; Ketentuan
                    </a>{" "}
                    dan{" "}
                    <a
                      href={PRIVACY_PATH}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold underline underline-offset-2 text-brand-900 hover:text-brand-700"
                    >
                      Kebijakan Privasi
                    </a>{" "}
                    Thrivin (versi <span className="font-mono">{TERMS_VERSION}</span>).
                  </label>
                </div>
                <p id="consent-terms-help" className="pl-6 text-[11px] text-text-muted leading-relaxed">
                  Persetujuan ini wajib untuk melanjutkan pembelian. Kami menyimpan bukti persetujuan:
                  nomor WhatsApp terverifikasi, waktu (timestamp server), versi teks yang kamu lihat,
                  nilai persetujuan, dan sumbernya.
                </p>

                <div className="h-px bg-surface-border" />

                <div className="flex items-start gap-2.5">
                  <input
                    id="consent-reminder"
                    name="consent-reminder"
                    type="checkbox"
                    checked={reminderOptIn}
                    onChange={(e) => setReminderOptIn(e.target.checked)}
                    aria-describedby="consent-reminder-help"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-400 text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2 cursor-pointer"
                  />
                  <label htmlFor="consent-reminder" className="leading-relaxed cursor-pointer">
                    Saya bersedia menerima <strong>pesan pengingat dari Nina</strong> di WhatsApp
                    (opsional).
                  </label>
                </div>
                <p id="consent-reminder-help" className="pl-6 text-[11px] text-text-muted leading-relaxed">
                  Menolak pengingat tidak menghalangi pembelianmu. Kamu bisa berhenti kapan saja: tekan
                  tombol berhenti pada pesan pengingat, atau balas <span className="font-mono">BERHENTI</span>{" "}
                  / <span className="font-mono">STOP</span>.
                </p>
              </div>

              <p className="text-xs leading-relaxed text-text-muted">
                Pembayaran diproses melalui <strong>Scalev</strong>, penyedia pembayaran pihak ketiga
                untuk Thrivin. Pada aplikasi bank/e-wallet, nama penerima dapat tampil sebagai
                <strong> SCALEV PLATFORM</strong>, bukan Thrivin. Pastikan nominal dan tujuan
                pembayaranmu sudah benar sebelum melanjutkan.
              </p>

              {/* Checkout Error Notice */}
              {checkoutError && (
                <div
                  role="alert"
                  className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">
                      <p className="font-semibold text-rose-900">{checkoutError}</p>
                      {(checkoutErrorCode === "SESSION_REQUIRED" ||
                        checkoutErrorCode === "PHONE_SESSION_MISMATCH" ||
                        /sesi|verifikasi nomor/i.test(checkoutError)) && (
                        <p className="text-rose-700 text-[11px] mt-1 leading-relaxed">
                          Sesi keamanan diperlukan sebelum membuka pembayaran agar pesanan terhubung ke nomor WhatsApp kamu.
                        </p>
                      )}
                    </div>
                  </div>

                  {(checkoutErrorCode === "SESSION_REQUIRED" ||
                    checkoutErrorCode === "PHONE_SESSION_MISMATCH" ||
                    /sesi|verifikasi nomor/i.test(checkoutError)) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleQuickVerifyWa}
                        disabled={isVerifyingSession}
                        className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{isVerifyingSession ? "Memverifikasi..." : "Verifikasi Nomor WhatsApp Sekarang"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => goToStep(1)}
                        className="px-3 py-2.5 rounded-xl bg-white border border-rose-200 hover:bg-rose-100 text-rose-700 font-medium text-xs flex items-center justify-center cursor-pointer transition-all"
                      >
                        Ubah Nomor
                      </button>
                    </div>
                  )}

                  {checkoutSupportUrl && (
                    <p className="pt-1">
                      Butuh bantuan?{" "}
                      <a
                        href={checkoutSupportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-bold text-rose-800"
                      >
                        Chat Nina di WhatsApp
                      </a>
                    </p>
                  )}
                </div>
              )}

              {/* Checkout Success Message */}
              {checkoutSuccessMessage && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">{checkoutSuccessMessage}</span>
                </div>
              )}

              {progressWarning && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{progressWarning}</span>
                </div>
              )}

              {/* Checkout Action Button with brand-900 background */}
              <button
                onClick={handleCheckout}
                disabled={isCheckingOut || checkoutComplete || !termsAccepted}
                aria-disabled={isCheckingOut || checkoutComplete || !termsAccepted}
                className="w-full rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 text-sm sm:text-base transition-all shadow-xl border border-brand-700 hover:scale-102 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isCheckingOut ? (
                  <span className="text-white font-bold">Menyiapkan Halaman Pembayaran...</span>
                ) : checkoutComplete ? (
                  <span className="text-white font-bold">✓ Mengalihkan ke checkout.thrivin.com...</span>
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
