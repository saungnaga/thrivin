"use client";

import { motion } from "framer-motion";
import { Check, ArrowRight, Instagram } from "lucide-react";
import Link from "next/link";

export default function Companion() {
  const features = [
    "Rekomendasi yang menyesuaikan ritme hidupmu",
    "Mengingatkan dan menjaga konsistensi tanpa menekan",
    "Mengingat tujuan, kebiasaan, dan progresmu",
    "Teman diskusi harian yang hangat dan empatik",
    "Membantu refleksi saat motivasi mulai memudar",
  ];

  const messages = [
    { id: 1, type: "nina", text: "Hai! Aku Nina 😊 Aku di sini buat nemenin perjalanan belajarmu di Thrivin." },
    { id: 2, type: "user", text: "Halo Nina! Mau mulai konsisten tapi sering mager pas pulang kerja 😅" },
    { id: 3, type: "nina", text: "Wajar banget kok! Kita mulai dari yang paling ringan dulu ya. 15 menit hari ini cukup banget 🌿" },
  ];

  // Container variants for left column staggered animation
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 30 } },
  } as const;

  const phoneVariants = {
    hidden: { opacity: 0, x: 50, rotate: 5 },
    visible: { 
      opacity: 1, 
      x: 0, 
      rotate: 0, 
      transition: { type: "spring" as const, stiffness: 100, damping: 30, delay: 0.2 } 
    }
  } as const;

  const chatVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.95 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { 
        type: "spring" as const, stiffness: 100, damping: 30,
        delay: 0.4 + (i * 0.6) 
      }
    })
  } as const;

  return (
    <section id="companion" className="py-24 lg:py-32 bg-gradient-dark overflow-hidden text-white relative">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          {/* Left Column */}
          <motion.div 
            className="flex flex-col gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            <div className="space-y-4">
              <motion.span variants={itemVariants} className="inline-block text-accent font-semibold tracking-wider text-sm uppercase">
                BUKAN CHATBOT. BUKAN GURU.
              </motion.span>
              <motion.h2 variants={itemVariants} className="font-serif text-3xl md:text-4xl lg:text-5xl text-white font-medium leading-tight">
                Pendamping yang hadir di keseharianmu.
              </motion.h2>
              <motion.p variants={itemVariants} className="text-brand-50 text-lg md:text-xl leading-relaxed max-w-xl">
                Nina adalah AI companion pertama di Thrivin. Dia mengenal tujuanmu, memahami konteksmu, dan hadir lewat WhatsApp — di tempat kamu sudah menjalani hari-hari.
              </motion.p>
            </div>

            <motion.ul variants={containerVariants} className="space-y-4">
              {features.map((feature, index) => (
                <motion.li key={index} variants={itemVariants} className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0 bg-brand-900/50 p-1 rounded-full text-accent">
                    <Check className="w-4 h-4" />
                  </div>
                  <span className="text-brand-50/90 text-lg">{feature}</span>
                </motion.li>
              ))}
            </motion.ul>

            <motion.div variants={itemVariants} className="pt-4 border-t border-brand-800/50 space-y-5">
              <p className="italic text-brand-300 text-lg">
                &quot;Website adalah tempat kamu belajar. WhatsApp adalah tempat kamu bertumbuh setiap hari.&quot;
              </p>
              <div>
                <Link
                  href="/companion/nina/onboarding"
                  className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-brand-900 hover:bg-brand-800 border-2 border-accent text-white font-bold text-sm transition-all shadow-glow hover:-translate-y-0.5"
                >
                  <span className="text-white">Kenali Nina & Ambil Akses</span>
                  <ArrowRight className="w-4 h-4 text-accent" />
                </Link>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Column - Phone Mockup */}
          <motion.div 
            className="flex justify-center lg:justify-end"
            variants={phoneVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            <div className="relative w-full max-w-[340px] rounded-[2.5rem] bg-slate-100 shadow-2xl ring-8 ring-brand-900 overflow-hidden shadow-brand-900/50 flex flex-col h-[550px]">
              
              {/* WhatsApp Header with Real Nina Avatar & Instagram Link */}
              <div className="bg-[#075E54] text-white p-4 flex items-center justify-between shadow-md z-10 shrink-0 rounded-t-[2.2rem]">
                <div className="flex items-center gap-3">
                  <a
                    href="https://instagram.com/ninathrivin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/80 shrink-0 relative bg-brand-900 flex items-center justify-center hover:opacity-90 transition-opacity"
                    title="Instagram @ninathrivin"
                  >
                    <img
                      src="/nina-pp.webp"
                      alt="Nina Companion"
                      className="w-full h-full object-cover object-top"
                    />
                  </a>
                  <div>
                    <h3 className="font-semibold leading-tight text-white">Nina · Thrivin</h3>
                    <p className="text-xs text-white/80">Online · Personal Companion</p>
                  </div>
                </div>
                <a
                  href="https://instagram.com/ninathrivin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/95 hover:text-white bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-full border border-white/25 transition-all shadow-xs"
                  title="Follow Instagram @ninathrivin"
                >
                  <Instagram className="w-3 h-3 text-pink-300" />
                  <span>@ninathrivin</span>
                </a>
              </div>

              {/* Chat Area */}
              <div className="flex-1 bg-[#efeae2] p-4 flex flex-col gap-3 overflow-y-auto relative bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-blend-soft-light bg-center">
                <div className="absolute inset-0 bg-[#efeae2]/80 z-0"></div>
                <div className="z-10 flex flex-col gap-3 relative mt-auto pt-10">
                  
                  {messages.map((msg, i) => (
                    <motion.div
                      key={msg.id}
                      custom={i}
                      variants={chatVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: "-50px" }}
                      className={`max-w-[85%] rounded-2xl p-3 shadow-sm ${
                        msg.type === "nina"
                          ? "bg-[#DCF8C6] rounded-tl-none self-start text-gray-800"
                          : "bg-white rounded-tr-none self-end text-gray-800"
                      }`}
                    >
                      <p className="text-[15px] leading-snug">{msg.text}</p>
                      <span className="text-[10px] text-gray-500 block text-right mt-1 opacity-70">
                        10:0{i} AM
                      </span>
                    </motion.div>
                  ))}

                  {/* Typing Indicator */}
                  <motion.div
                    custom={messages.length}
                    variants={chatVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-50px" }}
                    className="bg-[#DCF8C6] rounded-2xl rounded-tl-none self-start py-3 px-4 shadow-sm max-w-[85%] w-16 h-10 flex items-center justify-between"
                  >
                    <motion.span 
                      animate={{ opacity: [0.3, 1, 0.3] }} 
                      transition={{ repeat: Infinity, duration: 1.4, delay: 0 }} 
                      className="w-1.5 h-1.5 bg-gray-500 rounded-full" 
                    />
                    <motion.span 
                      animate={{ opacity: [0.3, 1, 0.3] }} 
                      transition={{ repeat: Infinity, duration: 1.4, delay: 0.2 }} 
                      className="w-1.5 h-1.5 bg-gray-500 rounded-full" 
                    />
                    <motion.span 
                      animate={{ opacity: [0.3, 1, 0.3] }} 
                      transition={{ repeat: Infinity, duration: 1.4, delay: 0.4 }} 
                      className="w-1.5 h-1.5 bg-gray-500 rounded-full" 
                    />
                  </motion.div>
                </div>
              </div>
              
              {/* Fake input area */}
              <div className="bg-[#f0f2f5] p-3 flex gap-2 items-center shrink-0 rounded-b-[2.2rem]">
                 <div className="flex-1 bg-white rounded-full py-2.5 px-4 text-gray-400 text-sm">
                   Ketik pesan...
                 </div>
                 <div className="w-10 h-10 bg-[#00A884] rounded-full flex items-center justify-center text-white shrink-0">
                   <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                     <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                   </svg>
                 </div>
              </div>

            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
