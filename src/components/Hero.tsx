"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

const ROTATING_WORDS = ["Berubah", "Konsisten", "Bertumbuh", "Mulai Lagi"];

export function Hero() {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
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

  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center pt-40 pb-28 px-4 sm:px-6 lg:px-8 bg-gradient-hero overflow-hidden">
      {/* Background Floating Orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-brand-200/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-float pointer-events-none"></div>
      <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-float-delayed pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-brand-300/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse-soft pointer-events-none"></div>

      <motion.div
        className="relative z-10 w-full max-w-5xl mx-auto text-center flex flex-col items-center"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        {/* Badge */}
        <motion.div variants={itemVariants} className="mb-8">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-elevated border border-surface-muted text-sm font-medium text-text-primary shadow-sm font-sans">
            <Sparkles className="w-4 h-4 text-accent" />
            Never Grow Alone
          </span>
        </motion.div>

        {/* Headline with Speed-Dash Effect (Same as companion/nina) */}
        <motion.h1 
          className="text-4xl md:text-5xl lg:text-6xl font-sans font-extrabold text-brand-950 tracking-tight leading-[1.25] sm:leading-[1.18] mb-8"
          variants={itemVariants}
        >
          Kamu Ga Harus{" "}
          <span className="inline-block max-w-full relative overflow-hidden sm:overflow-visible px-1 py-0.5 align-baseline">
            <AnimatePresence mode="wait">
              <motion.span
                key={wordIndex}
                initial={{ x: -28, opacity: 0, skewX: -14, filter: "blur(3px)" }}
                animate={{
                  x: 0,
                  opacity: 1,
                  skewX: 0,
                  filter: "blur(0px)",
                  transition: {
                    type: "spring",
                    stiffness: 380,
                    damping: 24,
                    mass: 0.8,
                  },
                }}
                exit={{
                  x: 30,
                  opacity: 0,
                  skewX: 14,
                  filter: "blur(4px)",
                  transition: { duration: 0.18, ease: "easeIn" },
                }}
                className="relative inline-block text-accent font-sans font-extrabold whitespace-nowrap"
              >
                {/* Ghost Echo Trail 1 */}
                <motion.span
                  initial={{ opacity: 0.7, x: -10 }}
                  animate={{ opacity: 0, x: -22 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute inset-0 text-accent/60 blur-[1.5px] pointer-events-none select-none"
                  aria-hidden="true"
                >
                  {ROTATING_WORDS[wordIndex]}
                </motion.span>

                {/* Ghost Echo Trail 2 */}
                <motion.span
                  initial={{ opacity: 0.45, x: -18 }}
                  animate={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="absolute inset-0 text-accent-light/40 blur-[3px] pointer-events-none select-none"
                  aria-hidden="true"
                >
                  {ROTATING_WORDS[wordIndex]}
                </motion.span>

                {/* Main Sharp Text */}
                <span className="relative z-10 text-accent drop-shadow-[0_0_16px_rgba(56,174,200,0.5)]">
                  {ROTATING_WORDS[wordIndex]}
                </span>
              </motion.span>
            </AnimatePresence>
          </span>{" "}
          Sendirian.
        </motion.h1>

        {/* Sub-headline */}
        <motion.p 
          className="text-lg md:text-xl text-text-secondary max-w-3xl mx-auto mb-12 leading-relaxed font-sans font-normal"
          variants={itemVariants}
        >
          AI companion yang nyapa duluan, inget progress lo, dan nemenin tiap hari — langsung di WhatsApp yang udah lo pakai.
        </motion.p>

        {/* CTAs */}
        <motion.div 
          className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-20"
          variants={itemVariants}
        >
          <a
            href="#domains"
            className="group flex items-center justify-center gap-2 px-8 py-4 bg-brand-900 text-white rounded-full font-sans font-semibold transition-all hover:bg-brand-800 hover:shadow-glow hover:-translate-y-0.5 w-full sm:w-auto cursor-pointer"
          >
            Jelajahi Learning Path
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#concept"
            className="flex items-center justify-center px-8 py-4 bg-white/70 border border-brand-200 text-brand-900 rounded-full font-sans font-semibold transition-all hover:border-accent hover:text-accent-dark hover:bg-white w-full sm:w-auto cursor-pointer shadow-sm"
          >
            Pelajari Konsep Thrivin
          </a>
        </motion.div>

        {/* Bottom Decorative */}
        <motion.div 
          className="flex items-center gap-4 text-text-muted text-sm tracking-widest uppercase font-medium font-sans"
          variants={itemVariants}
        >
          <span className="w-12 h-[1px] bg-brand-200"></span>
          <span>A new way to grow</span>
          <span className="w-12 h-[1px] bg-brand-200"></span>
        </motion.div>
      </motion.div>
    </section>
  );
}
