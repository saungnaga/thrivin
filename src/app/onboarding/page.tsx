"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  Camera,
  BellRing,
  BrainCircuit,
  Smartphone,
  Sparkles,
  CheckCircle2,
  Activity,
  Flame,
  Target,
  RefreshCw
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type Gender = "Laki-laki" | "Perempuan" | "";
type ActivityLevel = "Sedentari" | "Ringan" | "Moderat" | "Aktif" | "Sangat Aktif" | "";

type FormData = {
  name: string;
  age: string;
  gender: Gender;
  weight: string;
  height: string;
  activityLevel: ActivityLevel;
  goals: string[];
};

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 500 : -500,
    opacity: 0,
  } as const),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  } as const,
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 500 : -500,
    opacity: 0,
  } as const),
};

const CHECKOUT_URL = "https://digitanest.store/checkout-nina";

// WhatsApp Mockup shell for Feature Slides
const WAMockup = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-[320px] sm:max-w-[340px] w-full bg-slate-100 rounded-[2.2rem] ring-8 ring-brand-900 overflow-hidden shadow-2xl relative flex flex-col h-[440px] sm:h-[460px]">
    {/* WA Header */}
    <div className="bg-[#075E54] flex items-center justify-between p-3 text-white z-10 shrink-0 shadow-sm">
      <div className="flex items-center gap-2.5">
        <ArrowLeft className="w-4 h-4 text-white/90" />
        <div className="relative w-9 h-9 rounded-full overflow-hidden bg-brand-900 border border-white/30 shrink-0">
          <Image
            src="/nina-pp.webp"
            alt="Nina"
            fill
            className="object-cover object-top"
          />
        </div>
        <div>
          <div className="font-semibold text-xs sm:text-sm leading-tight">Nina · Thrivin</div>
          <div className="text-[10px] text-white/80">Online · Personal Companion</div>
        </div>
      </div>
      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
    </div>
    
    {/* Chat Area */}
    <div className="bg-[#efeae2] p-3.5 flex flex-col gap-2.5 flex-1 overflow-y-auto relative bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-blend-soft-light bg-center">
      <div className="absolute inset-0 bg-[#efeae2]/85 pointer-events-none" />
      <div className="relative z-10 flex flex-col gap-2.5 mt-auto">
        {children}
      </div>
    </div>

    {/* Input Area */}
    <div className="bg-[#f0f2f5] p-2 flex items-center gap-2 shrink-0 border-t border-slate-200">
      <div className="flex-1 bg-white rounded-full px-3.5 py-1.5 text-xs text-gray-400 border border-gray-200 shadow-xs flex items-center">
        Ketik pesan...
      </div>
      <div className="w-8 h-8 bg-[#00A884] rounded-full flex items-center justify-center text-white shadow-xs shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </div>
    </div>
  </div>
);

const BubbleNina = ({ children, time = "08:15" }: { children: React.ReactNode; time?: string }) => (
  <div className="bg-[#DCF8C6] text-slate-800 rounded-2xl rounded-tl-none self-start py-2 px-3 text-[13px] sm:text-[14px] shadow-xs max-w-[88%] relative z-10 leading-snug">
    <div>{children}</div>
    <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">
      {time}
    </span>
  </div>
);

const BubbleUser = ({ children, time = "08:14" }: { children: React.ReactNode; time?: string }) => (
  <div className="bg-white text-slate-800 rounded-2xl rounded-tr-none self-end py-2 px-3 text-[13px] sm:text-[14px] shadow-xs max-w-[88%] relative z-10 leading-snug">
    <div>{children}</div>
    <span className="text-[9px] text-gray-500 block text-right mt-1 opacity-70 font-mono">
      {time}
    </span>
  </div>
);

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [processingStage, setProcessingStage] = useState(0);

  const [formData, setFormData] = useState<FormData>({
    name: "",
    age: "",
    gender: "",
    weight: "",
    height: "",
    activityLevel: "",
    goals: [],
  });

  const TOTAL_STEPS = 12;

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setStep((prev) => Math.min(Math.max(prev + newDirection, 0), TOTAL_STEPS));
  };

  const handleNext = () => paginate(1);
  const handleBack = () => paginate(-1);

  // Mifflin-St Jeor TDEE formula
  const calculateTDEE = () => {
    const w = parseFloat(formData.weight) || 65;
    const h = parseFloat(formData.height) || 170;
    const a = parseFloat(formData.age) || 25;
    let bmr = 0;

    if (formData.gender === "Laki-laki") {
      bmr = 10 * w + 6.25 * h - 5 * a + 5;
    } else {
      bmr = 10 * w + 6.25 * h - 5 * a - 161;
    }

    let multiplier = 1.375;
    switch (formData.activityLevel) {
      case "Sedentari": multiplier = 1.2; break;
      case "Ringan": multiplier = 1.375; break;
      case "Moderat": multiplier = 1.55; break;
      case "Aktif": multiplier = 1.725; break;
      case "Sangat Aktif": multiplier = 1.9; break;
    }

    return Math.round(bmr * multiplier);
  };

  const tdee = calculateTDEE();
  const proteinTarget = Math.round(parseFloat(formData.weight || "65") * 1.6);

  // Step 11: Sequential Processing Stages
  useEffect(() => {
    if (step === 11) {
      setProcessingStage(0);
      const timers = [
        setTimeout(() => setProcessingStage(1), 1000),
        setTimeout(() => setProcessingStage(2), 2200),
        setTimeout(() => setProcessingStage(3), 3400),
        setTimeout(() => setProcessingStage(4), 4600),
        setTimeout(() => handleNext(), 5800),
      ];

      return () => timers.forEach(clearTimeout);
    }
  }, [step]);

  const renderContent = () => {
    switch (step) {
      /* ─── Step 0: Fitur 1 (Foto Makanan) ─── */
      case 0:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <Camera className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 1 dari 4
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Nina bisa membaca foto makananmu
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Gak perlu repot input timbangan gram manual. Cukup kirim foto piring di WhatsApp, Nina estimasi kalori dan makronutrisinya.
              </p>
            </div>
            
            <WAMockup>
              <BubbleUser time="12:30">
                <div className="bg-brand-900/10 rounded-xl p-2 mb-1.5 flex items-center gap-2 border border-brand-900/20">
                  <Camera className="w-4 h-4 text-brand-900" />
                  <span className="text-xs font-semibold text-brand-900">foto_nasi_padang.jpg</span>
                </div>
                Makan siang warteg nih! 🍛
              </BubbleUser>
              <BubbleNina time="12:31">
                Porsi mantap! Estimasi nutrisi:<br />
                • Nasi putih (~150g): ~180 kkal<br />
                • Ayam bakar dada: ~28g protein<br />
                • Tempe & lalap: serat & mineral<br /><br />
                Total ~430 kkal, 32g protein. Bagus banget, sisa target proteinmu tinggal 38g lagi sore nanti ya! 💪
              </BubbleNina>
            </WAMockup>

            <button
              onClick={handleNext}
              className="mt-6 w-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );
      
      /* ─── Step 1: Fitur 2 (Proaktif Reach Out) ─── */
      case 1:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <BellRing className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 2 dari 4
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Nina proaktif menghubungimu duluan
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Bukan sekadar bot pasif yang menunggu. Nina menyapa di jam genting saat kamu hampir malas atau tergoda skip workout.
              </p>
            </div>
            
            <WAMockup>
              <BubbleNina time="06:30">
                Pagi! Hari ini jadwal workout upper body ya. Mau mulai jam berapa? Aku ingetin nanti 💪
              </BubbleNina>
              <BubbleUser time="06:45">
                Jam 5 sore aja ya setelah beres kantor
              </BubbleUser>
              <BubbleNina time="06:46">
                Siap! Aku reminder jam 16:45 biar sempet ganti baju & pemanasan 🔥
              </BubbleNina>
              <BubbleNina time="16:45">
                Halo! Jam 5 tinggal 15 menit lagi nih. Siapin botol minum & playlist favoritmu ya 🎧
              </BubbleNina>
            </WAMockup>

            <button
              onClick={handleNext}
              className="mt-6 w-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );

      /* ─── Step 2: Fitur 3 (Memori Personal) ─── */
      case 2:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <BrainCircuit className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 3 dari 4
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Nina mengingat semuanya tentangmu
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Dari riwayat cedera lutut, hari lembur kantor, hingga makanan favorit — Nina ingat tanpa perlu kamu ceritakan ulang.
              </p>
            </div>
            
            <WAMockup>
              <BubbleNina time="18:00">
                Eh minggu lalu kan lutut kiri lo agak ngilu sehabis squat, hari ini kita skip squat dulu ya. Ganti leg press sama Romanian deadlift aja gimana?
              </BubbleNina>
              <BubbleUser time="18:04">
                Wah iya bener, makasih udah diingetin Nina
              </BubbleUser>
              <BubbleNina time="18:05">
                Sama-sama! Nanti malam jangan lupa foam roll 5 menit ya 🧘‍♀️
              </BubbleNina>
            </WAMockup>

            <button
              onClick={handleNext}
              className="mt-6 w-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );

      /* ─── Step 3: Fitur 4 (100% di WhatsApp) ─── */
      case 3:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <Smartphone className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 4 dari 4
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Semuanya di WhatsApp, tanpa instal apapun
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Tidak ada aplikasi baru yang membebani memori HP. Nina hadir langsung di ruang obrolan WhatsApp yang kamu buka setiap hari.
              </p>
            </div>
            
            <WAMockup>
              <BubbleNina time="09:10">
                Lo gak perlu download apa-apa. Aku langsung ada di kontak WhatsApp lo. Chat aja santai kayak ngobrol sama teman akrab 😊
              </BubbleNina>
              <BubbleUser time="09:12">
                Praktis banget ya, gak ribet buka-buka aplikasi terpisah
              </BubbleUser>
              <BubbleNina time="09:13">
                Itu goalnya! Aku mau ada di tempat yang lo buka setiap hari, bukan di app yang akhirnya lo lupa buka 😄🌿
              </BubbleNina>
            </WAMockup>

            <button
              onClick={handleNext}
              className="mt-6 w-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Mulai Buat Profilmu</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );

      /* ─── Step 4: Survey Nama ─── */
      case 4:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 1 dari 6
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Siapa nama panggilanmu?
            </h2>
            <p className="text-sm text-text-secondary mb-8">
              Biar Nina bisa menyapamu secara personal di WhatsApp.
            </p>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="contoh: Ari"
              className="w-full text-2xl sm:text-3xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent outline-none py-3 text-brand-950 placeholder:text-gray-300 transition-colors"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && formData.name.trim()) handleNext();
              }}
            />
            <button
              onClick={handleNext}
              disabled={!formData.name.trim()}
              className="mt-12 w-full bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );

      /* ─── Step 5: Survey Usia ─── */
      case 5:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 2 dari 6
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Berapa usiamu, {formData.name}?
            </h2>
            <p className="text-sm text-text-secondary mb-8">
              Usia memengaruhi metabolisme basal dan laju pemulihan otot harianmu.
            </p>
            <div className="relative">
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                placeholder="contoh: 26"
                className="w-full text-2xl sm:text-3xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent outline-none py-3 text-brand-950 placeholder:text-gray-300 transition-colors"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && formData.age.trim() && !isNaN(Number(formData.age))) handleNext();
                }}
              />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 text-base font-semibold">
                tahun
              </span>
            </div>
            <button
              onClick={handleNext}
              disabled={!formData.age.trim() || isNaN(Number(formData.age)) || Number(formData.age) < 12}
              className="mt-12 w-full bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );

      /* ─── Step 6: Survey Jenis Kelamin ─── */
      case 6:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 3 dari 6
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Apa jenis kelaminmu?
            </h2>
            <p className="text-sm text-text-secondary mb-8">
              Digunakan dalam rumus klinis Mifflin-St Jeor untuk menghitung BMR secara akurat.
            </p>
            <div className="grid grid-cols-1 gap-4">
              {(["Laki-laki", "Perempuan"] as Gender[]).map((gender) => (
                <button
                  key={gender}
                  onClick={() => {
                    setFormData({ ...formData, gender });
                    setTimeout(handleNext, 250);
                  }}
                  className={`p-5 rounded-2xl border-2 text-left text-lg font-bold transition-all cursor-pointer flex items-center justify-between ${
                    formData.gender === gender
                      ? "border-brand-900 bg-brand-50 text-brand-900 shadow-xs"
                      : "border-surface-border bg-white text-gray-700 hover:border-brand-300"
                  }`}
                >
                  <span>{gender}</span>
                  {formData.gender === gender && (
                    <CheckCircle2 className="w-5 h-5 text-accent-dark" />
                  )}
                </button>
              ))}
            </div>
          </div>
        );

      /* ─── Step 7: Data Fisik (BB & TB) ─── */
      case 7:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 4 dari 6
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Berapa berat & tinggi badanmu?
            </h2>
            <p className="text-sm text-text-secondary mb-8">
              Dasar perhitungan kebutuhan energi harian dan rekomendasi beban awal.
            </p>
            <div className="flex gap-4 sm:gap-6">
              <div className="flex-1">
                <label className="text-xs font-semibold text-text-muted mb-2 block uppercase tracking-wider">
                  Berat Badan (kg)
                </label>
                <input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  placeholder="65"
                  className="w-full text-2xl sm:text-3xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent outline-none py-3 text-brand-950 placeholder:text-gray-300 transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-text-muted mb-2 block uppercase tracking-wider">
                  Tinggi Badan (cm)
                </label>
                <input
                  type="number"
                  value={formData.height}
                  onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                  placeholder="170"
                  className="w-full text-2xl sm:text-3xl font-bold border-b-2 border-brand-200 focus:border-brand-900 bg-transparent outline-none py-3 text-brand-950 placeholder:text-gray-300 transition-colors"
                />
              </div>
            </div>
            <button
              onClick={handleNext}
              disabled={!formData.weight || !formData.height || Number(formData.weight) <= 0 || Number(formData.height) <= 0}
              className="mt-12 w-full bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );

      /* ─── Step 8: Aktivitas Harian ─── */
      case 8:
        const activities: { level: ActivityLevel; desc: string }[] = [
          { level: "Sedentari", desc: "Duduk hampir seharian, minim gerak fisik" },
          { level: "Ringan", desc: "Aktivitas harian ringan / olahraga 1–2x seminggu" },
          { level: "Moderat", desc: "Olahraga rutin 3–5x seminggu atau kerja dinamis" },
          { level: "Aktif", desc: "Latihan intensif 6–7x seminggu atau kerja fisik" },
          { level: "Sangat Aktif", desc: "Atlet / pekerjaan fisik berat 2x sehari" },
        ];
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 5 dari 6
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Seberapa aktif keseharianmu?
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              Membantu menentukan multiplier pembakaran kalori harianmu.
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              {activities.map(({ level, desc }) => (
                <button
                  key={level}
                  onClick={() => {
                    setFormData({ ...formData, activityLevel: level });
                    setTimeout(handleNext, 250);
                  }}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    formData.activityLevel === level
                      ? "border-brand-900 bg-brand-50 shadow-xs"
                      : "border-surface-border bg-white hover:border-brand-200"
                  }`}
                >
                  <div className={`font-bold text-base ${formData.activityLevel === level ? "text-brand-900" : "text-brand-950"}`}>
                    {level}
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        );

      /* ─── Step 9: Goals / Tujuan ─── */
      case 9:
        const allGoals = [
          "Menurunkan berat badan & lemak",
          "Menaikkan massa otot & tenaga",
          "Membangun konsistensi harian",
          "Memperbaiki pola makan tanpa diet ekstrem",
          "Meningkatkan performa lari / cardio",
          "Memperbaiki postur & mobilitas tubuh",
        ];
        
        const toggleGoal = (goal: string) => {
          if (formData.goals.includes(goal)) {
            setFormData({ ...formData, goals: formData.goals.filter((g) => g !== goal) });
          } else {
            setFormData({ ...formData, goals: [...formData.goals, goal] });
          }
        };

        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 6 dari 6
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-2">
              Apa tujuan utamamu?
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mb-6">
              Pilih yang paling relevan (bisa pilih lebih dari satu):
            </p>
            <div className="flex flex-col gap-2.5">
              {allGoals.map((goal) => {
                const isSelected = formData.goals.includes(goal);
                return (
                  <button
                    key={goal}
                    onClick={() => toggleGoal(goal)}
                    className={`p-3.5 rounded-xl border-2 text-left text-sm font-semibold transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "border-brand-900 bg-brand-900 text-white shadow-xs"
                        : "border-surface-border bg-white text-gray-700 hover:border-brand-200"
                    }`}
                  >
                    <span>{goal}</span>
                    {isSelected && <Check className="w-4 h-4 text-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleNext}
              disabled={formData.goals.length === 0}
              className="mt-8 w-full bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Lihat Hasil Perhitungan TDEE</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );

      /* ─── Step 10: TDEE Calculation Result ─── */
      case 10:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <div className="text-center mb-6">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2">
                Hasil Analisis Profil Tubuhmu
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Profil {formData.name || "Kamu"}
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Dihitung berdasarkan rumus sains metabolisme Mifflin-St Jeor
              </p>
            </div>
            
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-brand-100 mb-6 space-y-5">
              {/* TDEE */}
              <div className="flex items-center justify-between pb-4 border-b border-surface-border">
                <div>
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                    <Flame className="w-3.5 h-3.5 text-accent-dark" />
                    Kebutuhan Kalori Harian (TDEE)
                  </div>
                  <div className="text-3xl font-black text-brand-900">
                    ~{tdee} <span className="text-sm font-semibold text-text-secondary">kkal / hari</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-accent-dark">
                  <Activity className="w-5 h-5 text-accent-dark" />
                </div>
              </div>
              
              {/* Protein Target */}
              <div className="flex items-center justify-between pb-4 border-b border-surface-border">
                <div>
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                    <Target className="w-3.5 h-3.5 text-accent-dark" />
                    Target Protein Optimal
                  </div>
                  <div className="text-3xl font-black text-brand-900">
                    ~{proteinTarget} <span className="text-sm font-semibold text-text-secondary">gram / hari</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-accent-dark">
                  <Sparkles className="w-5 h-5 text-accent-dark" />
                </div>
              </div>

              {/* Goals Summary */}
              <div>
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Fokus Tujuan Terpilih:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formData.goals.map((g) => (
                    <span key={g} className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-900 text-xs font-semibold">
                      ✓ {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-text-secondary text-center mb-6 leading-relaxed">
              Nina akan memakai data ini untuk memandu porsi makan harianmu lewat foto di WhatsApp dan memantau progres konsistensimu.
            </p>

            <button
              onClick={handleNext}
              className="w-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
            >
              <span>Proses Plan Bersama Nina</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </div>
        );

      /* ─── Step 11: Processing Plan Animation ─── */
      case 11:
        const stages = [
          "Menganalisis profil fisik & metabolisme...",
          `Mengalkulasi kebutuhan energi (${tdee} kkal)...`,
          "Menyiapkan strategi kebiasaan & nutrisi...",
          "Mentransfer data ke memori WhatsApp Nina...",
          "✨ Done! Nina sudah siap menemanimu!",
        ];

        return (
          <div className="fixed inset-0 bg-brand-950 z-50 flex flex-col items-center justify-center px-6 text-white text-center">
            {/* Spinning Brand Icon */}
            <div className="relative mb-10">
              <div className="w-20 h-20 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-accent animate-pulse" />
              </div>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl font-bold mb-3">
              Sistem memproses plan untuk diberikan ke Nina...
            </h2>
            <p className="text-xs sm:text-sm text-brand-200/80 mb-10 max-w-sm">
              Menghubungkan data profil fisikmu dengan asisten personal Nina di WhatsApp
            </p>

            {/* Checklist */}
            <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-6 text-left space-y-3.5 backdrop-blur-md">
              {stages.map((text, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  {processingStage > idx ? (
                    <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
                  ) : processingStage === idx ? (
                    <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-white/20 shrink-0" />
                  )}
                  <span className={`text-xs sm:text-sm ${processingStage >= idx ? "text-white font-medium" : "text-white/40"}`}>
                    {text}
                  </span>
                </div>
              ))}
            </div>

            {processingStage >= 4 && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={handleNext}
                className="mt-8 px-8 py-3.5 rounded-full bg-accent text-brand-950 font-black text-sm hover:bg-white transition-all shadow-glow cursor-pointer"
              >
                Lihat Ringkasan & Mulai →
              </motion.button>
            )}
          </div>
        );

      /* ─── Step 12: Sales Page & Pricing ─── */
      case 12:
        return (
          <div className="flex flex-col h-full w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
            {/* Top Success Badge */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-accent-dark uppercase tracking-wider mb-4 shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-accent-dark" />
                Done! Nina Siap Menemanimu
              </div>
              <h1 className="font-serif text-3xl sm:text-5xl font-bold text-brand-950 mb-4">
                Mulai Perjalananmu Bersama Nina, {formData.name || "Kawan"}!
              </h1>
              <p className="text-sm sm:text-base text-text-secondary max-w-2xl mx-auto leading-relaxed">
                Semuanya bisa diatur bareng bersama Nina. Kamu tidak perlu pusing memikirkan hitungan rumit atau merasa bersalah saat lelah. Raih konsistensimu dengan satu langkah komitmen bersama Nina.
              </p>
            </div>

            {/* User Profile & Plan Overview Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-surface-border shadow-xs mb-12">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-surface-border">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-1">
                    Ringkasan Profil & Rekomendasi Awal
                  </span>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-brand-950">
                    Plan Personal {formData.name || "User"}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-brand-900">
                  <span className="px-3 py-1.5 rounded-full bg-surface-muted border border-surface-border">
                    {formData.gender || "Laki-laki"} • {formData.age || "25"} thn
                  </span>
                  <span className="px-3 py-1.5 rounded-full bg-surface-muted border border-surface-border">
                    BB: {formData.weight || "65"} kg • TB: {formData.height || "170"} cm
                  </span>
                  <span className="px-3 py-1.5 rounded-full bg-surface-muted border border-surface-border">
                    Aktivitas: {formData.activityLevel || "Moderat"}
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-6 pt-6">
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-semibold">
                    Kebutuhan Energi (TDEE)
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-brand-900">
                    ~{tdee} <span className="text-xs font-semibold text-text-secondary">kkal/hari</span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1">
                    Dipantau langsung lewat foto makanan di WhatsApp
                  </p>
                </div>
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-semibold">
                    Target Protein Harian
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-brand-900">
                    ~{proteinTarget} <span className="text-xs font-semibold text-text-secondary">gram/hari</span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1">
                    Menjaga kenyang & regenerasi massa otot
                  </p>
                </div>
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-semibold">
                    Fokus Target
                  </div>
                  <div className="text-xs text-brand-900 font-semibold space-y-1">
                    {formData.goals.slice(0, 2).map((g) => (
                      <div key={g} className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-accent-dark shrink-0" />
                        <span>{g}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1">
                    Audit berkala & penyesuaian strategi tiap minggu
                  </p>
                </div>
              </div>
            </div>

            {/* One-Time Purchase Trust Banner */}
            <div className="mb-10 text-center">
              <div className="inline-flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-5 py-2.5 rounded-full bg-white border border-brand-200 text-brand-900 text-xs sm:text-sm font-semibold shadow-xs">
                <span className="inline-flex items-center gap-1.5 text-accent-dark font-bold">
                  <ShieldCheck className="w-4 h-4 text-accent-dark" />
                  Sekali Bayar (One-Time Purchase)
                </span>
                <span className="text-brand-300 hidden sm:inline">•</span>
                <span className="text-text-secondary">Tanpa Tagihan Otomatis</span>
                <span className="text-brand-300 hidden sm:inline">•</span>
                <span className="text-text-secondary">Bebas Perpanjang Sesuai Kebutuhan</span>
              </div>
            </div>

            {/* Pricing Cards (3 Options, 3-Month Highlighted) */}
            <div className="grid md:grid-cols-3 gap-6 sm:gap-8 items-stretch mb-12">
              {/* Card 1: 1 Bulan */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-surface-border shadow-xs flex flex-col justify-between hover:border-brand-300 transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif text-xl font-bold text-brand-950">
                      Paket 1 Bulan
                    </h3>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-50 text-brand-800 border border-brand-100">
                      Akses 30 Hari
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mb-5 leading-relaxed">
                    Sekali bayar untuk mendampingi adaptasi kebiasaan baru di WhatsApp selama 30 hari penuh.
                  </p>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-black text-brand-900">
                        Rp 89.000
                      </span>
                      <span className="text-text-muted text-xs font-medium">/ sekali bayar</span>
                    </div>
                    <p className="text-[11px] font-semibold text-accent-dark mt-1">
                      ✓ Akses penuh 30 hari · Tanpa auto-debit
                    </p>
                  </div>

                  <div className="h-px bg-surface-border my-4" />

                  <ul className="space-y-3 text-xs sm:text-sm text-text-secondary mb-8">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Akses WhatsApp penuh ke Nina 24/7 (30 hari)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Bisa kirim foto makanan & screenshot Strava</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Check-in proaktif & pengingat konsistensi</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Rekomendasi split rutinitas personal</span>
                    </li>
                  </ul>
                </div>

                <a
                  href={CHECKOUT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-center py-3.5 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm transition-all shadow-xs hover:shadow-glow cursor-pointer"
                >
                  Ambil Paket 1 Bulan
                </a>
              </div>

              {/* Card 2: 3 Bulan (Highlighted / Recommended) */}
              <div className="bg-brand-950 text-white rounded-3xl p-6 sm:p-7 border-2 border-accent shadow-2xl relative flex flex-col justify-between md:-translate-y-3">
                <div 
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 px-3.5 py-1 rounded-full shadow-lg border-2 border-white text-[10px] sm:text-xs font-black tracking-wider uppercase"
                  style={{ backgroundColor: "#38AEC8", color: "#041622" }}
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "#041622" }} />
                  <span style={{ color: "#041622", fontWeight: 900 }}>PALING DIREKOMENDASIKAN</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3 mt-1">
                    <h3 className="font-serif text-xl font-bold text-white">
                      Paket Program 3 Bulan
                    </h3>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent/20 text-accent border border-accent/30">
                      Akses 90 Hari
                    </span>
                  </div>
                  <p className="text-xs text-brand-100 mb-5 leading-relaxed">
                    Sesuai sains adaptasi tubuh: butuh 8–12 minggu untuk transformasi kebiasaan dan metabolisme nyata.
                  </p>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-black text-white">
                        Rp 219.000
                      </span>
                      <span className="text-brand-200 text-xs font-medium">/ sekali bayar</span>
                    </div>
                    <p className="text-[11px] font-bold text-accent mt-1">
                      ✓ Setara ~Rp 73rb/bln · Hemat 18% · Tanpa tagihan otomatis
                    </p>
                  </div>

                  <div className="h-px bg-white/10 my-4" />

                  <ul className="space-y-3 text-xs sm:text-sm text-brand-100 mb-8">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span className="text-white font-medium">Semua fitur Paket 1 Bulan selama 90 hari</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Analisis foto makanan & screenshot Strava harian</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Audit berkala siklus Plateau & Deload mingguan</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>Memori jangka panjang untuk progres 12 minggu penuh</span>
                    </li>
                  </ul>
                </div>

                <a
                  href={CHECKOUT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-center py-4 rounded-full font-black text-sm transition-all shadow-glow hover:scale-[1.02] cursor-pointer"
                  style={{ backgroundColor: "#38AEC8", color: "#041622" }}
                >
                  <span style={{ color: "#041622", fontWeight: 900 }}>Ambil Paket 3 Bulan (Hemat 18%)</span>
                </a>
              </div>

              {/* Card 3: 6 Bulan */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-surface-border shadow-xs flex flex-col justify-between hover:border-brand-300 transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif text-xl font-bold text-brand-950">
                      Paket 6 Bulan
                    </h3>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-50 text-brand-800 border border-brand-100">
                      Akses 180 Hari
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mb-5 leading-relaxed">
                    Untuk transformasi jangka panjang dan penanaman gaya hidup baru yang permanen.
                  </p>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-black text-brand-900">
                        Rp 359.000
                      </span>
                      <span className="text-text-muted text-xs font-medium">/ sekali bayar</span>
                    </div>
                    <p className="text-[11px] font-bold text-accent-dark mt-1">
                      ✓ Setara ~Rp 60rb/bln · Hemat 33% · Sekali bayar
                    </p>
                  </div>

                  <div className="h-px bg-surface-border my-4" />

                  <ul className="space-y-3 text-xs sm:text-sm text-text-secondary mb-8">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Semua fitur Paket 3 Bulan selama 180 hari</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Pendampingan transformasi gaya hidup berkelanjutan</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Periodisasi program jangka panjang lengkap</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Evaluasi kebiasaan & nutrisi multi-fase</span>
                    </li>
                  </ul>
                </div>

                <a
                  href={CHECKOUT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-center py-3.5 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm transition-all shadow-xs hover:shadow-glow cursor-pointer"
                >
                  Ambil Paket 6 Bulan
                </a>
              </div>
            </div>

            {/* Bottom Support Note */}
            <div className="text-center text-xs text-text-muted pt-6 border-t border-surface-border">
              <p>
                Setelah menyelesaikan pembayaran, link invite WhatsApp Nina akan langsung otomatis dikirim ke nomor WhatsApp kamu.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-surface font-sans text-brand-900 selection:bg-brand-100 selection:text-brand-900 flex flex-col">
      {/* ─── Top Progress Navigation ─── */}
      {step > 0 && step < 11 && (
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-surface-border h-14 flex items-center px-4 sm:px-6">
          <div className="max-w-md mx-auto w-full flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-1.5 -ml-1.5 rounded-full hover:bg-surface-muted text-text-secondary hover:text-brand-900 transition-colors cursor-pointer"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            
            <div className="flex-1 bg-surface-border h-2 rounded-full overflow-hidden">
              <div 
                className="bg-brand-900 h-full transition-all duration-300 ease-out rounded-full"
                style={{ width: `${(step / 10) * 100}%` }}
              />
            </div>

            <span className="text-[11px] font-bold text-text-muted font-mono">
              {step}/10
            </span>
          </div>
        </header>
      )}

      {/* ─── Main Animated Content ─── */}
      <main className="flex-1 relative flex flex-col overflow-x-hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 320, damping: 32 } as const,
              opacity: { duration: 0.25 }
            }}
            className="w-full flex-1 flex flex-col"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
