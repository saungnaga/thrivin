"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Bot,
  User,
  ExternalLink
} from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp: string;
  cta?: {
    label: string;
    href: string;
  };
}

const QUICK_QUESTIONS = [
  "Apa itu Nina?",
  "Berapa harganya?",
  "Gimana cara kerja di WhatsApp?",
  "Ada garansi uang kembali?",
  "Bisa baca Strava & foto makanan?",
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    sender: "bot",
    text: "Halo! 👋 Aku asisten AI Thrivin. Ada yang ingin kamu tanyakan seputar sistem AI companion, Nina, integrasi WhatsApp & Strava, atau paket harga?",
    timestamp: "Baru saja",
  },
];

function getBotReply(input: string): { text: string; cta?: { label: string; href: string } } {
  const query = input.toLowerCase();

  if (query.includes("nina") || query.includes("siapa") || query.includes("apa itu")) {
    return {
      text: "Nina adalah AI Companion pertama Thrivin untuk Wellness & Fitness. Nina hidup 24/7 di WhatsApp-mu untuk menemani diet, evaluasi foto makanan, cek record data Strava, dan proaktif mengingatkan jadwal olahraga tanpa kamu harus cari duluan!",
      cta: {
        label: "Kenali Nina Lebih Dekat",
        href: "/companion/nina",
      },
    };
  }

  if (
    query.includes("harga") ||
    query.includes("biaya") ||
    query.includes("paket") ||
    query.includes("bayar") ||
    query.includes("promo") ||
    query.includes("berapa")
  ) {
    return {
      text: "Investasi Thrivin mulai dari Rp 39.000/bulan (sistem sekali bayar, tanpa tagihan otomatis!). Ada Paket 3 Bulan (Rp 231rb), 6 Bulan (Rp 357rb), dan 1 Tahun (Rp 465rb). Khusus pengguna baru, kamu bisa pakai kode promo 'TEMANBARU' untuk diskon ekstra 20%!",
      cta: {
        label: "Mulai Onboarding & Pilih Paket",
        href: "/companion/nina/onboarding/1",
      },
    };
  }

  if (
    query.includes("whatsapp") ||
    query.includes("wa") ||
    query.includes("aplikasi") ||
    query.includes("instal") ||
    query.includes("download")
  ) {
    return {
      text: "Kamu TIDAK PERLU menginstal aplikasi baru! Nina langsung aktif di WhatsApp pribadimu. Chatting santai layaknya kontak teman akrab yang selalu siap menyapa dan merespons 24/7.",
      cta: {
        label: "Coba Nina di WhatsApp",
        href: "/companion/nina",
      },
    };
  }

  if (
    query.includes("garansi") ||
    query.includes("kembali") ||
    query.includes("refund") ||
    query.includes("aman")
  ) {
    return {
      text: "Thrivin memberikan garansi 100% uang kembali dalam 3 hari pertama jika kamu merasa gaya pendampingan AI companion tidak cocok dengan ritmemu. Tanpa ribet, tanpa risiko!",
    };
  }

  if (
    query.includes("strava") ||
    query.includes("makan") ||
    query.includes("foto") ||
    query.includes("kalori") ||
    query.includes("protein") ||
    query.includes("lari")
  ) {
    return {
      text: "Cukup kirim foto piring makanmu ke WhatsApp Nina, dan Nina akan mengestimasi kalori & proteinnya. Kamu juga bisa kirim tangkapan layar lari Strava untuk dievaluasi pace, detak jantung (HR), dan saran pemulihannya!",
      cta: {
        label: "Lihat Fitur Lengkap",
        href: "/companion/nina",
      },
    };
  }

  if (query.includes("daftar") || query.includes("login") || query.includes("onboarding") || query.includes("mulai")) {
    return {
      text: "Proses setup hanya butuh 5 menit via onboarding singkat. Setelah itu, akunmu aktif dan Nina langsung menyapamu di nomor WhatsApp yang kamu daftarkan.",
      cta: {
        label: "Mulai Onboarding Sekarang",
        href: "/companion/nina/onboarding/1",
      },
    };
  }

  return {
    text: "Thrivin menyediakan personal AI companion di WhatsApp untuk membangun konsistensi nyata tanpa rasa sendirian. Kamu bisa langsung mencoba Nina (Wellness & Fitness) atau pelajari cara kerja Thrivin lebih lanjut!",
    cta: {
      label: "Pelajari Thrivin Lebih Jauh",
      href: "/about",
    },
  };
}

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isTyping]);

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "user",
      text,
      timestamp: "Baru saja",
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputVal("");
    setIsTyping(true);

    setTimeout(() => {
      const replyData = getBotReply(text);
      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: "bot",
        text: replyData.text,
        timestamp: "Baru saja",
        cta: replyData.cta,
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 600);
  };

  return (
    <>
      {/* ─── Floating Launcher Button in Bottom Right ─── */}
      <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setIsOpen((prev) => !prev)}
          className="relative w-14 h-14 rounded-full bg-brand-950 border-2 border-accent shadow-glow flex items-center justify-center cursor-pointer transition-shadow hover:shadow-xl focus:outline-none"
          aria-label={isOpen ? "Tutup AI Chatbot" : "Buka AI Chatbot Thrivin"}
        >
          {isOpen ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <div className="relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
              <Image
                src="/icon.png"
                alt="Thrivin AI Icon"
                fill
                className="object-contain"
                priority
              />
            </div>
          )}

          {/* Active Status Pulse Badge */}
          {!isOpen && (
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-brand-950 shadow-xs">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            </span>
          )}
        </motion.button>
      </div>

      {/* ─── Chat Window Overlay ─── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed bottom-22 right-4 sm:right-6 w-[92vw] sm:w-[380px] h-[520px] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-surface-border flex flex-col z-50 overflow-hidden font-sans"
          >
            {/* Window Header */}
            <div className="p-4 bg-linear-to-r from-brand-950 via-brand-900 to-brand-950 text-white flex items-center justify-between border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative w-9 h-9 rounded-full bg-brand-800 border border-accent/40 p-1 shrink-0 flex items-center justify-center">
                  <Image
                    src="/icon.png"
                    alt="Thrivin"
                    width={24}
                    height={24}
                    className="object-contain rounded-full"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-brand-950" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-1.5">
                    <span>Thrivin AI Assistant</span>
                    <Sparkles className="w-3 h-3 text-accent" />
                  </div>
                  <div className="text-[10px] text-accent/90 font-mono">
                    Online · Tanya Seputar Thrivin
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                aria-label="Tutup Chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#f8fafc]">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-2xs ${
                      msg.sender === "user"
                        ? "bg-brand-900 text-white rounded-br-none"
                        : "bg-white text-brand-950 border border-slate-200/90 rounded-bl-none"
                    }`}
                  >
                    <p>{msg.text}</p>

                    {msg.cta && (
                      <Link
                        href={msg.cta.href}
                        onClick={() => setIsOpen(false)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-accent-dark hover:underline pt-1 border-t border-slate-100 w-full"
                      >
                        <span>{msg.cta.label}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 px-1 font-mono">
                    {msg.timestamp}
                  </span>
                </div>
              ))}

              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-2xl rounded-bl-none px-3.5 py-2.5 w-fit shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0.3s]" />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Chips */}
            <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-900 text-slate-600 text-[11px] font-medium whitespace-nowrap transition-colors border border-slate-200 cursor-pointer shrink-0"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Tanya apa saja seputar Thrivin..."
                className="flex-1 text-xs sm:text-sm bg-slate-100 rounded-full px-4 py-2.5 border border-transparent focus:border-brand-900 focus:bg-white outline-none transition-all text-brand-950 placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!inputVal.trim()}
                className="w-9 h-9 rounded-full bg-accent hover:bg-accent-dark disabled:bg-slate-200 text-white flex items-center justify-center shrink-0 transition-all shadow-xs cursor-pointer"
                aria-label="Kirim Pesan"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default AIChatWidget;
