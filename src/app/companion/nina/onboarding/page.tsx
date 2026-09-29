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
  Dumbbell,
  Heart,
  Utensils,
  Smile,
  Zap,
  BookOpen
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type Gender = "Laki-laki" | "Perempuan" | "";
type ActivityLevel = "Sedentari" | "Ringan" | "Moderat" | "Aktif" | "Sangat Aktif" | "";
type ExperienceLevel = "Pemula Total" | "Sering Putus di Tengah" | "Stuck di Plateau" | "Butuh Teman Akuntabilitas" | "";
type WorkoutLocation = "Di Rumah" | "Di Gym" | "Luar Ruangan" | "Fleksibel Di Mana Saja" | "";
type BiggestChallenge = "Gampang Mager & Hilang Niat" | "Jadwal Sibuk Susah Konsisten" | "Bingung Menu & Porsi Makan" | "Ngerasa Berjuang Sendirian" | "";
type CommunicationStyle = "Santai & Akrab" | "Tegas & Terarah" | "Lembut & Empatik" | "";

type FormData = {
  name: string;
  age: string;
  gender: Gender;
  weight: string;
  height: string;
  activityLevel: ActivityLevel;
  programFocus: string[]; // max 3, or ["Hybrid Seimbang"]
  experienceLevel: ExperienceLevel;
  workoutLocation: WorkoutLocation;
  biggestChallenge: BiggestChallenge;
  communicationStyle: CommunicationStyle;
  goals: string[];
};

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  } as const),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  } as const,
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 300 : -300,
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

export default function NinaOnboardingPage() {
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
    programFocus: [],
    experienceLevel: "",
    workoutLocation: "",
    biggestChallenge: "",
    communicationStyle: "",
    goals: [],
  });

  const TOTAL_STEPS = 17;

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setStep((prev) => Math.min(Math.max(prev + newDirection, 0), TOTAL_STEPS));
  };

  const handleNext = () => paginate(1);
  const handleBack = () => paginate(-1);

  // Program focus logic: max 3 selections, OR exclusive "Hybrid Seimbang"
  const toggleProgramFocus = (focus: string) => {
    if (focus === "Hybrid Seimbang") {
      setFormData((prev) => ({
        ...prev,
        programFocus: prev.programFocus.includes("Hybrid Seimbang") ? [] : ["Hybrid Seimbang"]
      }));
      return;
    }

    setFormData((prev) => {
      let updated = prev.programFocus.filter((f) => f !== "Hybrid Seimbang");
      if (updated.includes(focus)) {
        updated = updated.filter((f) => f !== focus);
      } else {
        if (updated.length < 3) {
          updated.push(focus);
        }
      }
      return { ...prev, programFocus: updated };
    });
  };

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

  // Step 16: Sequential Processing Stages
  useEffect(() => {
    if (step === 16) {
      setProcessingStage(0);
      const timers = [
        setTimeout(() => setProcessingStage(1), 900),
        setTimeout(() => setProcessingStage(2), 2000),
        setTimeout(() => setProcessingStage(3), 3100),
        setTimeout(() => setProcessingStage(4), 4200),
        setTimeout(() => handleNext(), 5400),
      ];

      return () => timers.forEach(clearTimeout);
    }
  }, [step]);

  const renderContent = () => {
    switch (step) {
      /* ─── Step 0: Fitur 1 (Foto Makanan dengan Nasi Padang Asli) ─── */
      case 0:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-3 pb-8 px-4 sm:px-6">
            {/* Step 0 Top Navigation */}
            <div className="w-full flex items-center justify-between mb-3">
              <Link
                href="/companion/nina"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-brand-900 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-surface-muted"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Halaman Nina</span>
              </Link>
              <span className="text-[11px] font-bold text-accent-dark tracking-wider uppercase font-mono bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
                Fitur 1/5
              </span>
            </div>

            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark shadow-xs">
                <Camera className="w-5 h-5 text-accent-dark" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Nina bisa membaca foto makananmu
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Gak perlu repot timbang gram. Cukup kirim foto piring di WhatsApp, Nina kenali lauknya dan estimasi kalori serta proteinnya.
              </p>
            </div>
            
            <WAMockup>
              <BubbleUser time="12:30">
                <div className="relative w-full h-32 rounded-xl overflow-hidden mb-1.5 border border-brand-900/20 shadow-xs">
                  <Image
                    src="/nasi-padang.webp"
                    alt="Nasi Padang lauk ayam, telur, dan perkedel"
                    fill
                    className="object-cover"
                  />
                </div>
                Makan siang Nasi Padang nih Nina! 🍛
              </BubbleUser>
              <BubbleNina time="12:31">
                Wah Nasi Padang! Ada ayam, telur, sama perkedel ya 😍 Estimasi nutrisinya:<br />
                • Ayam: ~25g protein<br />
                • Telur: ~7g protein<br />
                • Perkedel: ~3g protein + karbo<br />
                • Nasi & daun singkong: energi & serat<br />
                Total ~680 kkal, ~35g protein. Asupan siang ini mantap, sisa target proteinmu tinggal porsi ringan sore nanti ya 💪
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

      /* ─── Step 1: Fitur 2 (Catat Progres Lari Strava & Smartwatch) ─── */
      case 1:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <Activity className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 2 dari 5
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Catat progres dari aplikasi lari & smartwatchmu
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Cukup kirim screenshot hasil lari dari Strava, Garmin, atau smartwatch. Nina membaca data performa dan memandu pemulihan fisikmu.
              </p>
            </div>
            
            <WAMockup>
              <BubbleUser time="06:50">
                <div className="relative w-full h-32 rounded-xl overflow-hidden mb-1.5 border border-brand-900/20 shadow-xs">
                  <Image
                    src="/strava.webp"
                    alt="Screenshot Aktivitas Strava"
                    fill
                    className="object-cover"
                  />
                </div>
                Lari pagi ini beres Nina! 🏃‍♂️💨
              </BubbleUser>
              <BubbleNina time="06:52">
                Keren lari 5.11 km pagi ini! 🔥 Analisis datanya:<br />
                • Jarak: 5.11 km<br />
                • Pace: 6:20 /km<br />
                • Waktu: 32:25 (Elev gain 16 m)<br />
                • Kalori: ~274 Cal<br />
                • HR rata-rata: 177 bpm<br /><br />
                Pace kamu stabil! Namun detak jantung rata-rata 177 bpm tergolong intensitas tinggi (Threshold). Besok disarankan pemulihan aktif (active recovery) atau peregangan ringan, dan jangan lupa penuhi asupan cairan ya 💧
              </BubbleNina>
            </WAMockup>

            <div className="w-full mt-6 flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-3.5 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );
      
      /* ─── Step 2: Fitur 3 (Proaktif Reminder Santai) ─── */
      case 2:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <BellRing className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 3 dari 5
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Nina proaktif menyapa lewat reminder santai
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Bukan sekadar bot pasif. Nina hadir menyapa dan mengecek progres harianmu di WhatsApp agar konsistensimu terjaga.
              </p>
            </div>
            
            <WAMockup>
              <BubbleNina time="07:30">
                Pagi! Ini reminder santai harianmu 🌿 Hari ini targetnya 25–30 menit aktivitas fisik santai ya. Semangat memulai hari!
              </BubbleNina>
              <BubbleUser time="07:45">
                Siap Nina! Rencana mau jalan santai sore sehabis kerja
              </BubbleUser>
              <BubbleNina time="07:46">
                Pilihan mantap! Jalan santai 30 menit bagus banget buat sirkulasi & bakar kalori. Nanti kabarin kalau udah beres ya 🔥
              </BubbleNina>
            </WAMockup>

            <div className="w-full mt-6 flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-3.5 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 3: Fitur 4 (Memori Personal Jangka Panjang) ─── */
      case 3:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <BrainCircuit className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 4 dari 5
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Nina mengingat semuanya tentangmu
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Riwayat cedera, preferensi latihan, dan makanan favorit — Nina simpan di memori jangka panjang tanpa perlu kamu ulang ceritanya.
              </p>
            </div>
            
            <WAMockup>
              <BubbleNina time="16:00">
                Eh lutut yang kemarin sempat ngilu sehabis latihan kaki jangan dipaksa dulu ya. Hari ini kita ganti menu yang lebih ramah sendi.
              </BubbleNina>
              <BubbleUser time="16:04">
                Wah iya bener, makasih udah diingetin Nina!
              </BubbleUser>
              <BubbleNina time="16:05">
                Sip! Nanti malam jangan lupa perbanyak minum air dan sempatkan peregangan ringan 5 menit ya 🧘‍♀️
              </BubbleNina>
            </WAMockup>

            <div className="w-full mt-6 flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-3.5 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 4: Fitur 5 (100% di WhatsApp) ─── */
      case 4:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <Smartphone className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 5 dari 5
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Semuanya di WhatsApp, tanpa instal apapun
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Tidak ada aplikasi baru yang membebani memori HP. Nina hadir langsung di WhatsApp yang kamu buka setiap hari.
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
                Itu goalnya! Aku mau ada di tempat yang lo buka setiap hari, bukan di aplikasi yang lo lupa buka 😄🌿
              </BubbleNina>
            </WAMockup>

            <div className="w-full mt-6 flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-3.5 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Mulai Survei Profil</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 5: Survey Nama ─── */
      case 5:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 1 dari 10
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
            <div className="mt-12 flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.name.trim()}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 6: Survey Usia ─── */
      case 6:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 2 dari 10
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
            <div className="mt-12 flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.age.trim() || isNaN(Number(formData.age)) || Number(formData.age) < 12}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 7: Survey Jenis Kelamin (Manual Next/Back) ─── */
      case 7:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 3 dari 10
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Apa jenis kelaminmu?
            </h2>
            <p className="text-sm text-text-secondary mb-8">
              Digunakan dalam rumus klinis Mifflin-St Jeor untuk menghitung BMR secara akurat.
            </p>
            <div className="grid grid-cols-1 gap-4 mb-8">
              {(["Laki-laki", "Perempuan"] as Gender[]).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => setFormData({ ...formData, gender })}
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
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.gender}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 8: Data Fisik (BB & TB) ─── */
      case 8:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 4 dari 10
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Berapa berat & tinggi badanmu?
            </h2>
            <p className="text-sm text-text-secondary mb-8">
              Dasar perhitungan kebutuhan energi harian dan rekomendasi beban awal.
            </p>
            <div className="flex gap-4 sm:gap-6 mb-8">
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
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.weight || !formData.height || Number(formData.weight) <= 0 || Number(formData.height) <= 0}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 9: Aktivitas Harian (Manual Next/Back) ─── */
      case 9:
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
              Langkah 5 dari 10
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Seberapa aktif keseharianmu?
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              Membantu menentukan multiplier pembakaran kalori harianmu.
            </p>
            <div className="grid grid-cols-1 gap-2.5 mb-8">
              {activities.map(({ level, desc }) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFormData({ ...formData, activityLevel: level })}
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
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.activityLevel}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 10: Fokus Program (Max 3, or Single Hybrid) ─── */
      case 10:
        const programOptions: { focus: string; icon: React.ReactNode; desc: string }[] = [
          {
            focus: "Workout & Strength",
            icon: <Dumbbell className="w-5 h-5 text-accent-dark" />,
            desc: "Bentuk massa otot, bakar lemak & program beban bertahap"
          },
          {
            focus: "Yoga & Mobility",
            icon: <Heart className="w-5 h-5 text-accent-dark" />,
            desc: "Kelenturan sendi, hilangkan pegal leher/punggung & relaksasi"
          },
          {
            focus: "Diet & Nutrisi",
            icon: <Utensils className="w-5 h-5 text-accent-dark" />,
            desc: "Perbaiki pola makan tanpa tersiksa via foto piring di WA"
          },
          {
            focus: "Running & Cardio",
            icon: <Activity className="w-5 h-5 text-accent-dark" />,
            desc: "Bangun stamina paru-paru, evaluasi pace & lari konsisten"
          },
          {
            focus: "Casual Habits",
            icon: <Smile className="w-5 h-5 text-accent-dark" />,
            desc: "Mulai gerak 15–20 menit/hari, jaga hidrasi & ritme tidur"
          },
          {
            focus: "Hybrid Seimbang",
            icon: <Zap className="w-5 h-5 text-accent-dark" />,
            desc: "Paket lengkap: kombinasi beban, mobilitas, dan nutrisi harian"
          }
        ];

        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 6 dari 10
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-2">
              Fokus program apa yang kamu mau?
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mb-5">
              Pilih <strong>maksimal 3 fokus</strong> (atau pilih <em>Hybrid Seimbang</em> untuk kombinasi otomatis):
            </p>
            <div className="grid grid-cols-1 gap-2.5 mb-6">
              {programOptions.map(({ focus, icon, desc }) => {
                const isSelected = formData.programFocus.includes(focus);
                return (
                  <button
                    key={focus}
                    type="button"
                    onClick={() => toggleProgramFocus(focus)}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                      isSelected
                        ? "border-brand-900 bg-brand-50 shadow-xs"
                        : "border-surface-border bg-white hover:border-brand-200"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-brand-100/60 flex items-center justify-center shrink-0 mt-0.5">
                      {icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-brand-950">{focus}</span>
                        {isSelected && <Check className="w-4 h-4 text-accent-dark shrink-0" />}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5 leading-snug">{desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={formData.programFocus.length === 0}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut ({formData.programFocus.length})</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 11: Pengalaman & Riwayat Olahraga ─── */
      case 11:
        const experienceOptions: { level: ExperienceLevel; desc: string }[] = [
          { level: "Pemula Total", desc: "Belum pernah rutin olahraga dan bingung mulai dari mana" },
          { level: "Sering Putus di Tengah", desc: "Niat ada tapi selalu kendor di minggu ke-2 atau ke-3" },
          { level: "Stuck di Plateau", desc: "Sudah rutin tapi progres bentuk badan/beban jalan di tempat" },
          { level: "Butuh Teman Akuntabilitas", desc: "Paham teori, cuma butuh seseorang yang tahu perjuanganku" },
        ];

        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 7 dari 10
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Bagaimana riwayat olahragamu?
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              Membantu Nina mengatur kurva adaptasi yang realistis buatmu.
            </p>
            <div className="grid grid-cols-1 gap-3 mb-8">
              {experienceOptions.map(({ level, desc }) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFormData({ ...formData, experienceLevel: level })}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    formData.experienceLevel === level
                      ? "border-brand-900 bg-brand-50 shadow-xs"
                      : "border-surface-border bg-white hover:border-brand-200"
                  }`}
                >
                  <div className="font-bold text-base text-brand-950">{level}</div>
                  <div className="text-xs text-text-secondary mt-1">{desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.experienceLevel}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 12: Preferensi Lokasi Latihan ─── */
      case 12:
        const locations: { loc: WorkoutLocation; desc: string }[] = [
          { loc: "Di Rumah", desc: "Cukup matras, bodyweight, atau sepasang dumbell" },
          { loc: "Di Gym", desc: "Punya akses ke barbell, mesin beban, dan treadmill" },
          { loc: "Luar Ruangan", desc: "Taman kota, jogging track, atau jalan lingkungan" },
          { loc: "Fleksibel Di Mana Saja", desc: "Tergantung jadwal dan tempat yang memungkinkan" },
        ];

        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 8 dari 10
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Di mana kamu lebih nyaman latihan?
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              Nina akan menyusun variasi gerakan yang cocok dengan fasilitas yang kamu punya.
            </p>
            <div className="grid grid-cols-1 gap-3 mb-8">
              {locations.map(({ loc, desc }) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setFormData({ ...formData, workoutLocation: loc })}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    formData.workoutLocation === loc
                      ? "border-brand-900 bg-brand-50 shadow-xs"
                      : "border-surface-border bg-white hover:border-brand-200"
                  }`}
                >
                  <div className="font-bold text-base text-brand-950">{loc}</div>
                  <div className="text-xs text-text-secondary mt-1">{desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.workoutLocation}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 13: Tantangan Terbesar ─── */
      case 13:
        const challenges: { item: BiggestChallenge; desc: string }[] = [
          { item: "Gampang Mager & Hilang Niat", desc: "Semangat di awal, tapi gampang skip saat motivasi turun" },
          { item: "Jadwal Sibuk Susah Konsisten", desc: "Pekerjaan kantor menyita waktu & energi di malam hari" },
          { item: "Bingung Menu & Porsi Makan", desc: "Niat diet tapi pusing hitung kalori makanan lokal sehari-hari" },
          { item: "Ngerasa Berjuang Sendirian", desc: "Gak ada orang yang tahu apa yang sedang diperjuangkan" },
        ];

        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 9 dari 10
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Apa hambatan terbesarmu selama ini?
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              Nina disetel secara khusus untuk mengantisipasi titik terlemahmu ini.
            </p>
            <div className="grid grid-cols-1 gap-3 mb-8">
              {challenges.map(({ item, desc }) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFormData({ ...formData, biggestChallenge: item })}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    formData.biggestChallenge === item
                      ? "border-brand-900 bg-brand-50 shadow-xs"
                      : "border-surface-border bg-white hover:border-brand-200"
                  }`}
                >
                  <div className="font-bold text-base text-brand-950">{item}</div>
                  <div className="text-xs text-text-secondary mt-1">{desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.biggestChallenge}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 14: Gaya Komunikasi Nina ─── */
      case 14:
        const styles: { style: CommunicationStyle; badge: string; desc: string }[] = [
          {
            style: "Santai & Akrab",
            badge: "Sahabat Dekat",
            desc: "Ngobrol santai pakai bahasa sehari-hari, humoris dan hangat tanpa kesan menggurui"
          },
          {
            style: "Tegas & Terarah",
            badge: "Coach Disiplin",
            desc: "Fokus ke target, akuntabilitas kuat, dan dorongan konsisten saat kamu mulai malas"
          },
          {
            style: "Lembut & Empatik",
            badge: "Pendengar Setia",
            desc: "Menenangkan saat lelah, tanpa membuatmu merasa bersalah saat harus istirahat"
          },
        ];

        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Langkah 10 dari 10
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Gaya komunikasi Nina yang kamu mau?
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              Setiap orang punya respon psikologis berbeda terhadap bimbingan.
            </p>
            <div className="grid grid-cols-1 gap-3 mb-8">
              {styles.map(({ style, badge, desc }) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setFormData({ ...formData, communicationStyle: style })}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    formData.communicationStyle === style
                      ? "border-brand-900 bg-brand-50 shadow-xs"
                      : "border-surface-border bg-white hover:border-brand-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-base text-brand-950">{style}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-900">
                      {badge}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary leading-relaxed">{desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                disabled={!formData.communicationStyle}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lihat Blueprint Personal</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 15: Hasil Kalkulasi TDEE & Personal Blueprint ─── */
      case 15:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-12">
            <div className="text-center mb-6">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-1">
                Personal Plan Blueprint
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Blueprint {formData.name || "Kamu"} & Nina
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Berdasarkan kalkulasi metabolisme sains & profil personalmu
              </p>
            </div>
            
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-brand-100 mb-6 space-y-4">
              {/* TDEE */}
              <div className="flex items-center justify-between pb-3.5 border-b border-surface-border">
                <div>
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                    <Flame className="w-3.5 h-3.5 text-accent-dark" />
                    Kebutuhan Kalori Harian (TDEE)
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-brand-900">
                    ~{tdee} <span className="text-xs font-semibold text-text-secondary">kkal / hari</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-accent-dark">
                  <Activity className="w-4 h-4 text-accent-dark" />
                </div>
              </div>
              
              {/* Target Protein */}
              <div className="flex items-center justify-between pb-3.5 border-b border-surface-border">
                <div>
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                    <Target className="w-3.5 h-3.5 text-accent-dark" />
                    Target Protein Harian
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-brand-900">
                    ~{proteinTarget} <span className="text-xs font-semibold text-text-secondary">gram / hari</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-accent-dark">
                  <Sparkles className="w-4 h-4 text-accent-dark" />
                </div>
              </div>

              {/* Personal Configuration Highlights */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted font-medium">Pilar Program:</span>
                  <span className="font-bold text-brand-900">
                    {formData.programFocus.length > 0 ? formData.programFocus.join(", ") : "Workout & Strength"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted font-medium">Lokasi Utama:</span>
                  <span className="font-bold text-brand-900">{formData.workoutLocation || "Di Rumah"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted font-medium">Gaya Nina:</span>
                  <span className="font-bold text-accent-dark">{formData.communicationStyle || "Santai & Akrab"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted font-medium">Solusi Hambatan:</span>
                  <span className="font-bold text-brand-900">{formData.biggestChallenge || "Gampang Mager"}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-text-secondary text-center mb-6 leading-relaxed">
              Nina akan menyelaraskan reminder sapaan santai harian, evaluasi foto piring, dan panduan latihan sesuai blueprint di atas.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Sinkronkan ke Nina</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 16: Animasi Pemrosesan Interaktif ─── */
      case 16:
        const stages = [
          `Menghitung metabolisme basal & target kalori (~${tdee} kkal)...`,
          `Mengadaptasi blueprint program: ${formData.programFocus.join(", ") || "Program Personal"}...`,
          `Menyetel mode interaksi: ${formData.communicationStyle || "Santai & Akrab"}...`,
          `Menyiapkan strategi solusi: ${formData.biggestChallenge || "Konsistensi Harian"}...`,
          "✨ Done! Nina sudah siap menemanimu di WhatsApp!",
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
              Menghubungkan data personalisasi kamu dengan asisten Nina di WhatsApp
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

      /* ─── Step 17: Sales Page & Pricing (Paket 1 bln 99rb, 3 bln 219rb, 6 bln 359rb) ─── */
      case 17:
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
                    Ringkasan Blueprint & Konfigurasi WhatsApp
                  </span>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-brand-950">
                    Plan Personal: {formData.name || "Kamu"}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-brand-900">
                  <span className="px-3 py-1 rounded-full bg-surface-muted border border-surface-border">
                    {formData.gender || "Laki-laki"} • {formData.age || "25"} thn
                  </span>
                  <span className="px-3 py-1 rounded-full bg-surface-muted border border-surface-border">
                    BB: {formData.weight || "65"}kg • TB: {formData.height || "170"}cm
                  </span>
                  <span className="px-3 py-1 rounded-full bg-brand-50 text-accent-dark border border-brand-200">
                    {formData.programFocus.length > 0 ? formData.programFocus.join(", ") : "Workout & Strength"}
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
                    Dipantau langsung lewat foto piring makanan di WhatsApp
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
                    Menjaga rasa kenyang & regenerasi jaringan otot
                  </p>
                </div>
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-semibold">
                    Mode Pendampingan Nina
                  </div>
                  <div className="text-xs text-brand-900 font-semibold space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-accent-dark shrink-0" />
                      <span>Gaya: {formData.communicationStyle || "Santai & Akrab"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-accent-dark shrink-0" />
                      <span>Fokus: {formData.workoutLocation || "Di Rumah"}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1">
                    Reminder santai harian & evaluasi berkala via WhatsApp
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

            {/* Pricing Cards (3 Options, 1-Month at 99rb, 3-Month Highlighted at 219rb) */}
            <div className="grid md:grid-cols-3 gap-6 sm:gap-8 items-stretch mb-12">
              {/* Card 1: 1 Bulan (Rp 99.000) */}
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
                        Rp 99.000
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
                      <span>Reminder santai harian & pengingat konsistensi</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Rekomendasi rutinitas personal berbasis blueprint</span>
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

              {/* Card 2: 3 Bulan (Highlighted / Recommended - Rp 219.000) */}
              <div className="bg-brand-950 text-white rounded-3xl p-6 sm:p-7 border-2 border-accent shadow-2xl relative flex flex-col justify-between md:-translate-y-3">
                <div 
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 px-3.5 py-1 rounded-full shadow-lg border-2 border-white text-[10px] sm:text-xs font-black tracking-wider uppercase"
                  style={{ backgroundColor: "#38AEC8", color: "#041622" }}
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "#041622" }} />
                  <span style={{ color: "#041622", fontWeight: 900 }}>PALING DISUKAI</span>
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
                      ✓ Setara ~Rp 73rb/bln · Hemat 26% · Tanpa tagihan otomatis
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
                  <span style={{ color: "#041622", fontWeight: 900 }}>Ambil Paket 3 Bulan (Paling Pas)</span>
                </a>
              </div>

              {/* Card 3: 6 Bulan (Rp 359.000) */}
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
                      ✓ Setara ~Rp 60rb/bln · Hemat 40% · Sekali bayar
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

            {/* Bottom Support Note with Link to Free Learning Hub */}
            <div className="text-center text-xs text-text-secondary pt-6 border-t border-surface-border space-y-2">
              <p>
                Setelah menyelesaikan pembayaran, link invite WhatsApp Nina akan langsung otomatis dikirim ke nomor WhatsApp kamu.
              </p>
              <p>
                Ingin pelajari sains di balik metodenya terlebih dahulu?{" "}
                <Link href="/path/wellness" className="text-accent-dark font-bold hover:underline inline-flex items-center gap-1">
                  <BookOpen className="w-3 h-3 inline" />
                  Buka Learning Hub Wellness (100% Gratis)
                </Link>
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-surface font-sans text-brand-900 selection:bg-brand-100 selection:text-brand-900 flex flex-col relative">
      {/* ─── Seamless Page Entrance Curtain (Smoothly dissolves from the Nina transition) ─── */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-50 bg-brand-950 pointer-events-none"
      />

      {/* ─── Top Progress Navigation (Visible during survey steps 1 to 15) ─── */}
      {step > 0 && step < 16 && (
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
                style={{ width: `${(step / 15) * 100}%` }}
              />
            </div>

            <span className="text-[11px] font-bold text-text-muted font-mono">
              {step <= 4 ? `Fitur ${step + 1}/5` : `Survey ${step - 4}/10`}
            </span>
          </div>
        </header>
      )}

      {/* ─── Main Animated Content with Smooth Entrance ─── */}
      <motion.main
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.48, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 relative flex flex-col overflow-x-hidden"
      >
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
              opacity: { duration: 0.22 }
            }}
            className="w-full flex-1 flex flex-col"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </motion.main>
    </div>
  );
}
