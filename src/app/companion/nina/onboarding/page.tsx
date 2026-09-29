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
  BookOpen,
  PlayCircle,
  Lock,
  Unlock,
  PhoneCall,
  Droplet,
  Calendar,
  AlertCircle,
  Loader2,
  MessageCircle
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
  whatsappNumber: string;
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
  <div className="mx-auto max-w-[320px] sm:max-w-[340px] w-full bg-slate-100 rounded-[2.2rem] ring-8 ring-brand-900 overflow-hidden shadow-2xl relative flex flex-col h-[450px] sm:h-[470px]">
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

// Indonesian Telco & WhatsApp Verification Engine
function evaluateWhatsAppNumber(rawPhone: string): { valid: boolean; operator?: string; error?: string; cleanNumber?: string } {
  const digitsOnly = rawPhone.replace(/\D/g, "");
  
  let normalized = digitsOnly;
  if (normalized.startsWith("62")) {
    normalized = "0" + normalized.slice(2);
  } else if (!normalized.startsWith("0") && normalized.length > 0) {
    normalized = "0" + normalized;
  }

  if (normalized.length < 10) {
    return { valid: false, error: "Nomor WhatsApp terlalu pendek. Masukkan minimal 10 digit (contoh: 0812xxxxxxxx)." };
  }
  if (normalized.length > 13) {
    return { valid: false, error: "Nomor WhatsApp melebihi batas standar (maksimal 13 digit)." };
  }

  const body = normalized.slice(2);
  // Check repetitive digits (e.g. 08111111111)
  if (/^(\d)\1+$/.test(body)) {
    return { valid: false, error: "Nomor tidak valid atau terdeteksi nomor percobaan (pola angka berulang)." };
  }
  // Check sequential sequences (e.g. 08123456789)
  if ("0123456789012345".includes(body) || "9876543210987654".includes(body)) {
    return { valid: false, error: "Nomor tidak terdaftar di sistem WhatsApp (urutan angka tidak wajar)." };
  }

  const prefix4 = normalized.slice(0, 4);

  const telkomsel = ["0811", "0812", "0813", "0821", "0822", "0823", "0851", "0852", "0853"];
  const indosat = ["0814", "0815", "0816", "0855", "0856", "0857", "0858"];
  const xlAxis = ["0817", "0818", "0819", "0831", "0832", "0833", "0838", "0859", "0877", "0878"];
  const smartfren = ["0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889"];
  const tri = ["0895", "0896", "0897", "0898", "0899"];

  let operator = "";
  if (telkomsel.includes(prefix4)) operator = "Telkomsel";
  else if (indosat.includes(prefix4)) operator = "Indosat Ooredoo";
  else if (xlAxis.includes(prefix4)) operator = "XL Axiata / Axis";
  else if (smartfren.includes(prefix4)) operator = "Smartfren";
  else if (tri.includes(prefix4)) operator = "Tri (3)";

  if (!operator) {
    return {
      valid: false,
      error: "Awalan nomor tidak dikenali oleh operator seluler WhatsApp Indonesia. Pastikan menggunakan nomor lokal aktif."
    };
  }

  return { valid: true, operator, cleanNumber: normalized };
}

export default function NinaOnboardingPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [processingStage, setProcessingStage] = useState(0);

  // WhatsApp verification states
  const [whatsappInput, setWhatsappInput] = useState("");
  const [whatsappError, setWhatsappError] = useState("");
  const [isValidatingWhatsApp, setIsValidatingWhatsApp] = useState(false);
  const [isWhatsAppVerified, setIsWhatsAppVerified] = useState(false);
  const [detectedOperator, setDetectedOperator] = useState<string | null>(null);

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
    whatsappNumber: "",
  });

  const TOTAL_STEPS = 22;

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
  const carbTarget = Math.round((tdee * 0.45) / 4);
  const fatTarget = Math.round((tdee * 0.25) / 9);
  const hydrationTarget = ((parseFloat(formData.weight || "65")) * 0.035).toFixed(1);

  // Step 20: Sequential Processing Animation after WhatsApp Verified
  useEffect(() => {
    if (step === 20) {
      setProcessingStage(0);
      const timers = [
        setTimeout(() => setProcessingStage(1), 800),
        setTimeout(() => setProcessingStage(2), 1700),
        setTimeout(() => setProcessingStage(3), 2700),
        setTimeout(() => setProcessingStage(4), 3700),
        setTimeout(() => handleNext(), 4800),
      ];

      return () => timers.forEach(clearTimeout);
    }
  }, [step]);

  // Real-time prefix detection while typing phone
  const handlePhoneInputChange = (val: string) => {
    setWhatsappInput(val);
    if (whatsappError) setWhatsappError("");
    const evalRes = evaluateWhatsAppNumber(val);
    if (evalRes.operator) {
      setDetectedOperator(evalRes.operator);
    } else {
      setDetectedOperator(null);
    }
  };

  // WhatsApp verification submit handler
  const handleVerifyWhatsApp = () => {
    const evalRes = evaluateWhatsAppNumber(whatsappInput);
    if (!evalRes.valid) {
      setWhatsappError(evalRes.error || "Nomor WhatsApp tidak valid. Masukkan nomor WhatsApp aktif.");
      setIsWhatsAppVerified(false);
      return;
    }

    setWhatsappError("");
    setIsValidatingWhatsApp(true);

    // Simulate real-time WhatsApp network ping validation
    setTimeout(() => {
      setIsValidatingWhatsApp(false);
      setIsWhatsAppVerified(true);
      const clean = evalRes.cleanNumber || whatsappInput;
      const formatted = clean.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3");
      setFormData((prev) => ({ ...prev, whatsappNumber: formatted }));
      
      // Auto advance to sync processing animation
      setTimeout(() => {
        handleNext();
      }, 700);
    }, 1300);
  };

  const renderContent = () => {
    switch (step) {
      /* ─── Step 0: Fitur 1 (Foto Makanan dengan Nasi Padang Asli) ─── */
      case 0:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-3 pb-8 px-4 sm:px-6">
            <div className="w-full flex items-center justify-between mb-3">
              <Link
                href="/companion/nina"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-brand-900 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-surface-muted"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Halaman Nina</span>
              </Link>
              <span className="text-[11px] font-bold text-accent-dark tracking-wider uppercase font-mono bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
                Fitur 1 dari 6
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
                Fitur 2 dari 6
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

      /* ─── Step 2: Fitur 3 (Kurasi Referensi Video Gerakan YouTube) ─── */
      case 2:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <PlayCircle className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 3 dari 6
              </span>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-brand-950">
                Kurasi referensi video saat bingung form gerakan
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                Bingung form gerakan seperti RDL atau Squat? Nina jelaskan titik kuncinya dan mengirimkan link video YouTube terkurasi yang to-the-point.
              </p>
            </div>
            
            <WAMockup>
              <BubbleUser time="10:14">
                Nina, pas Romanian Deadlift punggung bawahku kok rada pegel ya? Gerakanku salah ga ya? 🥲
              </BubbleUser>
              <BubbleNina time="10:16">
                Pegel di pinggang bawah saat RDL biasanya karena pinggul kurang mundur (*hip hinge*) atau punggung melengkung.<br /><br />
                Ini 3 kuncinya:<br />
                • Dorong pinggul ke belakang (bukan jongkok)<br />
                • Punggung netral & dada busung<br />
                • Dumbell rapat menempel tulang kering<br /><br />
                Biar makin jelas, aku kurasikan video YouTube 2 menit ini:
                
                <div className="mt-2 rounded-xl overflow-hidden border border-slate-300 bg-white shadow-xs">
                  <div className="relative h-20 bg-slate-900 flex items-center justify-center">
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent" />
                    <div className="relative z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600 text-white font-bold text-[10px] shadow-sm">
                      <PlayCircle className="w-3.5 h-3.5 fill-white text-red-600" />
                      <span>YouTube Tutorial</span>
                    </div>
                    <span className="absolute bottom-1 right-1.5 text-[9px] bg-black/80 text-white px-1 rounded font-mono">
                      2:14
                    </span>
                  </div>
                  <div className="p-2 text-left bg-slate-50">
                    <div className="font-bold text-[11px] text-slate-900 leading-snug">
                      Panduan Form Romanian Deadlift (RDL) Bebas Nyeri Pinggang
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5 font-mono">
                      youtu.be/proper-rdl-form
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 text-[12px]">
                  Tonton bentar sebelum set berikutnya ya! 💪
                </div>
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

      /* ─── Step 3: Fitur 4 (Proaktif Reminder Santai) ─── */
      case 3:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <BellRing className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 4 dari 6
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

      /* ─── Step 4: Fitur 5 (Memori Personal Jangka Panjang) ─── */
      case 4:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <BrainCircuit className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 5 dari 6
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

      /* ─── Step 5: Fitur 6 (100% di WhatsApp) ─── */
      case 5:
        return (
          <div className="flex flex-col h-full justify-between items-center w-full max-w-md mx-auto pt-4 pb-8 px-4 sm:px-6">
            <div className="text-center space-y-2 mb-4">
              <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-accent-dark">
                <Smartphone className="w-5 h-5 text-accent-dark" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-dark block">
                Fitur 6 dari 6
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

      /* ─── Step 6: Survey 1/10 (Nama) ─── */
      case 6:
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

      /* ─── Step 7: Survey 2/10 (Usia) ─── */
      case 7:
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

      /* ─── Step 8: Survey 3/10 (Jenis Kelamin) ─── */
      case 8:
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

      /* ─── Step 9: Survey 4/10 (Berat & Tinggi Badan) ─── */
      case 9:
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

      /* ─── Step 10: [INTERLEAVED 1] Analisis Profil Fisik & Revelation Sains Metabolisme ─── */
      case 10:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent-dark text-[11px] font-bold uppercase tracking-wider mb-4 w-fit">
              <Sparkles className="w-3.5 h-3.5 text-accent-dark" />
              <span>Analisis Profil Awal & Sains Metabolisme</span>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 mb-3">
              Insight Penting untuk Tubuhmu, {formData.name || "Kawan"}
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mb-6 leading-relaxed">
              Dengan profil fisik {formData.weight || "65"} kg dan tinggi {formData.height || "170"} cm, tubuhmu memiliki kurva adaptasi yang sangat potensial jika dipandu dengan cara yang benar.
            </p>

            {/* Scientific Revelation Card */}
            <div className="bg-white rounded-3xl p-5 border border-brand-200 shadow-sm space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700">
                  <Flame className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-950">
                    Mengapa 70% Diet Gagal di Minggu ke-3?
                  </h4>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    Riset fisiologi membuktikan: ketika memotong kalori terlalu ekstrem (*crash diet*), otak hipotalamus menganggap tubuh dalam kondisi bahaya kelaparan. Metabolisme basal menurun hingga 25% dan rasa lapar melonjak 3× lipat.
                  </p>
                </div>
              </div>

              <div className="h-px bg-surface-border" />

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-700">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-950">
                    Pendekatan Bersama Nina: Sustainable Recomposition
                  </h4>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    Bersama Nina, kita tidak membiarkanmu kelaparan. Fokus kita adalah asupan protein cukup, menjaga massa otot, dan defisit moderat yang tidak merusak sistem metabolisme alamimu.
                  </p>
                </div>
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
                className="w-2/3 bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut ke Pola Aktivitas</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 11: Survey 5/10 (Aktivitas Harian) ─── */
      case 11:
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

      /* ─── Step 12: Survey 6/10 (Fokus Program - Max 3, or Hybrid) ─── */
      case 12:
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

      /* ─── Step 13: Survey 7/10 (Riwayat & Pengalaman Olahraga) ─── */
      case 13:
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

      /* ─── Step 14: Survey 8/10 (Preferensi Lokasi Latihan) ─── */
      case 14:
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

      /* ─── Step 15: Survey 9/10 (Tantangan Terbesar) ─── */
      case 15:
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

      /* ─── Step 16: [INTERLEAVED 2] Analisis Tantangan Perilaku & Revelation Decision Fatigue ─── */
      case 16:
        const challengeInsights: Record<BiggestChallenge | "", { title: string; desc: string; strategy: string }> = {
          "Gampang Mager & Hilang Niat": {
            title: "Dopamine Friction & Cold Starts",
            desc: "Otak manusia dirancang untuk menghemat energi. Tanpa ada yang menyapa duluan, memulai selalu terasa berat.",
            strategy: "Nina akan mengirimkan pesan 'micro-action' (cukup 15 menit), sehingga gesekan mental untuk mulai hilang."
          },
          "Jadwal Sibuk Susah Konsisten": {
            title: "Decision Fatigue Pasca Kerja",
            desc: "Willpower otak terkuras setelah 8 jam bekerja. Berharap niat muncul di jam 6 sore adalah perang yang sering kalah.",
            strategy: "Nina menyusun variasi latihan modular 15–20 menit di rumah tanpa perlu persiapan ribet ke gym."
          },
          "Bingung Menu & Porsi Makan": {
            title: "Cognitive Overload Hitung Kalori",
            desc: "Menimbang gram makanan dan mencatat kalori manual membosankan dan jarang bertahan lebih dari 2 minggu.",
            strategy: "Cukup jepret foto piring makan di WhatsApp, Nina yang hitungkan estimasi gizi dan proteinnya untukmu."
          },
          "Ngerasa Berjuang Sendirian": {
            title: "The Social Proof & Accountability Gap",
            desc: "Riset Dominican University: orang yang memiliki rekan akuntabilitas menyelesaikan 76% target dibanding 43% sendirian.",
            strategy: "Nina hadir setiap hari di WhatsApp, menyapa dan mengingat setiap target dan progres perjuanganmu."
          },
          "": {
            title: "Konsistensi Butuh Pendamping",
            desc: "Konsistensi bukan soal kemauan keras, melainkan sistem akuntabilitas yang meringankan beban mental harian.",
            strategy: "Nina hadir mendampingi di WhatsApp agar kamu tidak lagi merasa berjuang sendirian."
          }
        };

        const activeInsight = challengeInsights[formData.biggestChallenge];

        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent-dark text-[11px] font-bold uppercase tracking-wider mb-4 w-fit">
              <BrainCircuit className="w-3.5 h-3.5 text-accent-dark" />
              <span>Analisa Tantangan & Solusi Neurosains</span>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 mb-3">
              Kabar Baik: Hambatan Ini Sangat Normal
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mb-6 leading-relaxed">
              Tantangan <strong>&quot;{formData.biggestChallenge || "Konsistensi"}&quot;</strong> bukan karena kamu lemah tekad, melainkan cara kerja alami otak manusia.
            </p>

            <div className="bg-white rounded-3xl p-5 border border-brand-200 shadow-sm space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0 text-indigo-700">
                  <Zap className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-950">
                    Fakta Sains: {activeInsight.title}
                  </h4>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    {activeInsight.desc}
                  </p>
                </div>
              </div>

              <div className="h-px bg-surface-border" />

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/40 flex items-center justify-center shrink-0 text-accent-dark">
                  <Sparkles className="w-5 h-5 text-accent-dark" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-950">
                    Solusi Terarah Bersama Nina
                  </h4>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    {activeInsight.strategy}
                  </p>
                </div>
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
                className="w-2/3 bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lanjut ke Preferensi Interaksi</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 17: Survey 10/10 (Gaya Komunikasi Nina) ─── */
      case 17:
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
                <span>Lihat Ringkasan Blueprint</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 18: Overview Personal Blueprint (Preview / Teaser with Locked Modules) ─── */
      case 18:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-10">
            <div className="text-center mb-6">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-1">
                Blueprint Preview (Overview)
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Blueprint Awal {formData.name || "Kamu"} & Nina
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Kalkulasi metabolisme sains berdasarkan data profilmu
              </p>
            </div>
            
            {/* Unlocked Core Metrics Preview */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-brand-100 mb-5 space-y-4">
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

              {/* Locked Sections Teaser */}
              <div className="pt-1 space-y-2.5">
                <div className="text-xs font-bold text-brand-950 uppercase tracking-wider mb-2 flex items-center gap-1.5 text-accent-dark">
                  <Lock className="w-3.5 h-3.5" />
                  Bagian Detail Full Blueprint (Terkunci):
                </div>

                <div className="p-3 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-between text-xs opacity-75">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-semibold text-brand-950">Rasio Karbohidrat, Lemak Sehat & Target Hidrasi</span>
                  </div>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-surface-border font-mono text-text-muted">Terkunci</span>
                </div>

                <div className="p-3 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-between text-xs opacity-75">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-semibold text-brand-950">Jadwal Periodisasi & Struktur Split Mingguan</span>
                  </div>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-surface-border font-mono text-text-muted">Terkunci</span>
                </div>

                <div className="p-3 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-between text-xs opacity-75">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-semibold text-brand-950">Modul Kurasi Video Form & Referensi YouTube di WA</span>
                  </div>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-surface-border font-mono text-text-muted">Terkunci</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-text-secondary text-center mb-6 leading-relaxed">
              Masukkan nomor WhatsApp kamu di langkah berikutnya untuk membuka rincian lengkap dan mengaktifkan jalur pendampingan Nina.
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
                <span>Buka Full Blueprint</span>
                <Unlock className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 19: Masukkan & Validasi Otomatis Nomor WhatsApp ─── */
      case 19:
        return (
          <div className="flex flex-col h-full justify-center w-full max-w-md mx-auto px-6 py-10">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark mb-2">
              Validasi & Sinkronisasi
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mb-3">
              Masukkan Nomor WhatsApp Kamu
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mb-6 leading-relaxed">
              Nomor ini akan digunakan Nina untuk mengirimkan sapaan santai, feedback foto makanan, dan referensi video langsung di kontak WhatsApp-mu.
            </p>

            {/* WhatsApp Input Card */}
            <div className="bg-white rounded-3xl p-5 border border-brand-200 shadow-sm mb-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-brand-950 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-accent-dark" />
                    Nomor WhatsApp Aktif
                  </span>
                  {detectedOperator && (
                    <span className="text-[11px] font-semibold text-accent-dark bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                      {detectedOperator}
                    </span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 flex items-center gap-1.5 text-sm font-bold text-brand-950 pr-2 border-r border-slate-200">
                    <span>🇮🇩</span>
                    <span>+62</span>
                  </div>
                  <input
                    type="tel"
                    value={whatsappInput}
                    onChange={(e) => handlePhoneInputChange(e.target.value)}
                    placeholder="812-3456-7890"
                    className="w-full pl-22 pr-4 py-3.5 text-lg font-bold text-brand-950 border border-slate-200 rounded-xl focus:border-brand-900 focus:ring-2 focus:ring-brand-900/10 outline-none transition-all placeholder:text-gray-300"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyWhatsApp();
                    }}
                  />
                </div>
                <p className="text-[11px] text-text-muted mt-2">
                  Bisa dimulai dari 08... atau 8... Sistem memverifikasi otomatis apakah nomor terdaftar aktif di WhatsApp.
                </p>
              </div>

              {/* Error Box if invalid */}
              {whatsappError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs leading-relaxed"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Verifikasi Gagal:</span> {whatsappError}
                  </div>
                </motion.div>
              )}

              {/* Verification Success Box */}
              {isWhatsAppVerified && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-800 text-xs font-semibold"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Nomor WhatsApp terverifikasi aktif ({detectedOperator})! Mengalihkan ke Full Blueprint...</span>
                </motion.div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                disabled={isValidatingWhatsApp}
                className="w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                onClick={handleVerifyWhatsApp}
                disabled={isValidatingWhatsApp || !whatsappInput.trim()}
                className="w-2/3 bg-brand-900 hover:bg-brand-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                {isValidatingWhatsApp ? (
                  <>
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    <span>Cek WhatsApp...</span>
                  </>
                ) : (
                  <>
                    <span>Verifikasi & Buka Plan</span>
                    <ArrowRight className="w-4 h-4 text-accent" />
                  </>
                )}
              </button>
            </div>
          </div>
        );

      /* ─── Step 20: Processing & Sync Animation ─── */
      case 20:
        const syncStages = [
          `Memvalidasi format nomor WhatsApp aktif: ${formData.whatsappNumber || "Terhubung"}...`,
          `Membuka kalkulasi makronutrisi presisi & hidrasi (${hydrationTarget}L/hari)...`,
          `Menyusun kurva periodisasi latihan untuk ${formData.workoutLocation || "Di Rumah"}...`,
          `Mengaktifkan modul kurasi video form & referensi YouTube di WA...`,
          "✨ Selesai! Full Personal Blueprint berhasil dibuka!",
        ];

        return (
          <div className="fixed inset-0 bg-brand-950 z-50 flex flex-col items-center justify-center px-6 text-white text-center">
            <div className="relative mb-10">
              <div className="w-20 h-20 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-accent animate-pulse" />
              </div>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl font-bold mb-3">
              Membuka Kunci Full Personal Blueprint...
            </h2>
            <p className="text-xs sm:text-sm text-brand-200/80 mb-10 max-w-sm">
              Menghubungkan data metabolisme {formData.name || "kamu"} dengan kontak WhatsApp Nina
            </p>

            <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-6 text-left space-y-3.5 backdrop-blur-md">
              {syncStages.map((text, idx) => (
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
                Lihat Full Blueprint Lengkap →
              </motion.button>
            )}
          </div>
        );

      /* ─── Step 21: Full Personal Blueprint Lengkap ─── */
      case 21:
        return (
          <div className="flex flex-col h-full w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
            {/* Top Verified Badge */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 uppercase tracking-wider mb-3 shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Full Blueprint Terbuka · WA: {formData.whatsappNumber || "Terverifikasi"}</span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950">
                Full Personal Blueprint {formData.name} & Nina
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Rancangan sains lengkap: nutrisi, hidrasi, jadwal latihan, dan modul referensi WhatsApp
              </p>
            </div>

            {/* Deep Metric Cards */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-brand-200 shadow-sm space-y-6 mb-8">
              {/* Section 1: Metabolisme & Kalori */}
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2">
                  1. Energi & Metabolisme Harian
                </span>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-surface-muted border border-surface-border">
                    <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">
                      Kebutuhan Kalori Total (TDEE)
                    </div>
                    <div className="text-2xl font-black text-brand-950">
                      ~{tdee} <span className="text-xs font-normal text-text-secondary">kkal/hari</span>
                    </div>
                    <p className="text-[11px] text-text-secondary mt-1">
                      Batas pemeliharaan energi sesuai tingkat aktivitas {formData.activityLevel || "Moderat"}.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-brand-50 border border-brand-200">
                    <div className="text-xs text-brand-900 font-bold uppercase tracking-wider mb-1">
                      Rekomendasi Pola Bersama Nina
                    </div>
                    <div className="text-base font-bold text-brand-950">
                      Defisit Moderat Berkelanjutan
                    </div>
                    <p className="text-[11px] text-brand-900/80 mt-1">
                      Target ~{Math.max(tdee - 300, 1400)} kkal/hari tanpa rasa kelaparan menyiksa.
                    </p>
                  </div>
                </div>
              </div>

              <div className="h-px bg-surface-border" />

              {/* Section 2: Distribusi Makronutrisi & Hidrasi Presisi */}
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2">
                  2. Distribusi Makronutrisi & Hidrasi
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-surface-muted border border-surface-border text-center">
                    <Target className="w-4 h-4 text-accent-dark mx-auto mb-1" />
                    <div className="text-[11px] text-text-muted uppercase font-semibold">Protein</div>
                    <div className="text-xl font-bold text-brand-950">~{proteinTarget}g</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">Regenerasi otot</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-surface-muted border border-surface-border text-center">
                    <Flame className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                    <div className="text-[11px] text-text-muted uppercase font-semibold">Karbohidrat</div>
                    <div className="text-xl font-bold text-brand-950">~{carbTarget}g</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">Bahan bakar energi</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-surface-muted border border-surface-border text-center">
                    <Sparkles className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
                    <div className="text-[11px] text-text-muted uppercase font-semibold">Lemak Sehat</div>
                    <div className="text-xl font-bold text-brand-950">~{fatTarget}g</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">Keseimbangan hormon</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-surface-muted border border-surface-border text-center">
                    <Droplet className="w-4 h-4 text-sky-600 mx-auto mb-1" />
                    <div className="text-[11px] text-text-muted uppercase font-semibold">Air / Hidrasi</div>
                    <div className="text-xl font-bold text-brand-950">{hydrationTarget}L</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">Performa metabolik</div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-surface-border" />

              {/* Section 3: Struktur Rutinitas & Modul WhatsApp */}
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-2">
                  3. Rutinitas Mingguan & Modul Terhubung
                </span>
                <div className="space-y-2.5 text-xs text-brand-950 font-medium">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-muted border border-surface-border">
                    <Calendar className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Periodisasi Latihan ({formData.workoutLocation || "Di Rumah"}):</span> 3–4 hari sesi terarah, 2 hari pemulihan aktif (jalan kaki / mobility), dan 1 hari rest penuh.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-muted border border-surface-border">
                    <PlayCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Kurasi Video & Form Guide YouTube Aktif:</span> Setiap kali kamu bingung form gerakan (RDL, Squat, dll.), tanyakan langsung di WhatsApp — Nina kirimkan panduan video terkurasi.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-muted border border-surface-border">
                    <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Gaya Interaksi Nina:</span> Disetel dengan karakter <strong>{formData.communicationStyle || "Santai & Akrab"}</strong> dan pengingat konsistensi harian.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Proceed Button */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
              <button
                onClick={handleBack}
                className="w-full sm:w-1/3 border border-surface-border text-text-secondary font-bold py-4 rounded-full hover:bg-surface-muted transition-colors cursor-pointer"
              >
                Kembali
              </button>
              <button
                onClick={handleNext}
                className="w-full sm:w-2/3 bg-brand-900 hover:bg-brand-800 text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-glow cursor-pointer"
              >
                <span>Lihat Pilihan Paket Pendampingan</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </button>
            </div>
          </div>
        );

      /* ─── Step 22: Sales Page & Pricing (Paket 1 bln 99rb, 3 bln 219rb [PALING DISUKAI], 6 bln 359rb) ─── */
      case 22:
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
                Semuanya bisa diatur bareng bersama Nina di WhatsApp. Kamu tidak perlu pusing memikirkan hitungan rumit atau merasa bersalah saat lelah. Raih konsistensimu dengan satu langkah komitmen bersama Nina.
              </p>
            </div>

            {/* User Profile & Plan Overview Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-surface-border shadow-xs mb-10">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-surface-border">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark block mb-1">
                    Ringkasan Blueprint & Nomor WhatsApp
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
                    WA: {formData.whatsappNumber || "Terhubung"}
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
                      <span>Fitur Video YouTube & Strava Aktif</span>
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
                      <span>Kurasi video gerakan YouTube & evaluasi form</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-accent-dark shrink-0 mt-0.5" />
                      <span>Reminder santai harian & pengingat konsistensi</span>
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
                      <span>Kurasi video gerakan YouTube & evaluasi form</span>
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
                Setelah menyelesaikan pembayaran, link invite WhatsApp Nina akan langsung otomatis dikirim ke nomor WhatsApp {formData.whatsappNumber || "kamu"}.
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
      {/* ─── Seamless Page Entrance Curtain ─── */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-50 bg-brand-950 pointer-events-none"
      />

      {/* ─── Top Progress Navigation (Visible during survey steps 1 to 21, except full-screen modal step 20) ─── */}
      {step > 0 && step < 22 && step !== 20 && (
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
                style={{ width: `${(step / 22) * 100}%` }}
              />
            </div>

            <span className="text-[11px] font-bold text-text-muted font-mono">
              {step <= 5
                ? `Fitur ${step + 1}/6`
                : step <= 9
                ? `Survey ${step - 5}/10`
                : step === 10
                ? `Sains Metabolisme`
                : step <= 15
                ? `Survey ${step - 6}/10`
                : step === 16
                ? `Analisa Hambatan`
                : step === 17
                ? `Survey 10/10`
                : step === 18
                ? `Blueprint Preview`
                : step === 19
                ? `Verifikasi WA`
                : `Full Blueprint`}
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
