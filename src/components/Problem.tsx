"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function Problem() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 30,
      },
    },
  } as const;

  const cards = [
    {
      num: "01",
      question: "Harus mulai dari mana?",
    },
    {
      num: "02",
      question: "Mana yang relevan untuk kondisi saya?",
    },
    {
      num: "03",
      question: "Sudah baca banyak, tapi bagaimana menerapkannya?",
    },
  ];

  return (
    <section id="concept" className="bg-surface-muted py-24 lg:py-32 px-5 sm:px-8 lg:px-12 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="flex flex-col items-center text-center mb-16 lg:mb-24"
        >
          <motion.span variants={itemVariants} className="text-accent uppercase tracking-wide text-xs font-bold mb-4 block">
            THE GAP BETWEEN KNOWING & DOING
          </motion.span>
          <motion.h2 variants={itemVariants} className="font-serif text-3xl md:text-5xl lg:text-6xl text-text-primary mb-6 max-w-4xl leading-tight">
            Internet memberi akses informasi tanpa batas.
          </motion.h2>
          <motion.h3 variants={itemVariants} className="font-serif italic text-xl md:text-2xl text-brand-800 max-w-2xl">
            "Masalahnya bukan lagi &quot;Di mana saya bisa belajar?&quot;"
          </motion.h3>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-20"
        >
          {cards.map((card, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="group relative flex flex-col justify-between rounded-2xl border border-black/5 bg-white/70 p-8 min-h-[220px] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl overflow-hidden backdrop-blur-sm"
            >
              <div>
                <span className="inline-block text-accent font-bold text-lg mb-6">
                  {card.num}
                </span>
                <h4 className="font-serif text-2xl text-text-primary leading-snug">
                  {card.question}
                </h4>
              </div>
              
              {/* Decorative bottom bar */}
              <div className="absolute bottom-0 left-0 h-1 w-full bg-brand-50 transition-colors duration-300 group-hover:bg-accent" />
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="border-t border-black/10 pt-12 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <motion.div variants={itemVariants} className="text-text-secondary text-lg md:text-xl text-center md:text-left">
            Thrivin hadir untuk menjembatani{" "}
            <br className="md:hidden" />
            <span className="font-bold text-text-primary block md:inline mt-2 md:mt-0">
              Information &rarr; Understanding &rarr; Application &rarr; Growth.
            </span>
          </motion.div>
          
          <motion.a
            variants={itemVariants}
            href="#journey"
            className="group flex items-center gap-2 text-brand-900 font-medium hover:text-accent transition-colors"
          >
            Lihat cara kerjanya
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}
