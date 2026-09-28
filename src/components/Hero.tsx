"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

const WORDS = [
  "dilakukan",
  "dimulai",
  "dikerjakan",
  "diusahakan",
  "didisiplinkan",
  "dibiasakan",
];

export function Hero() {
  const [wordIndex, setWordIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(WORDS[0].length);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(true);

  useEffect(() => {
    if (isPaused) {
      const pauseTimer = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, 2200);
      return () => clearTimeout(pauseTimer);
    }

    if (isDeleting) {
      if (subIndex > 0) {
        const timeout = setTimeout(() => {
          setSubIndex((prev) => prev - 1);
        }, 45);
        return () => clearTimeout(timeout);
      } else {
        setIsDeleting(false);
        setWordIndex((prev) => (prev + 1) % WORDS.length);
        return;
      }
    }

    // Typing
    const currentFullWord = WORDS[wordIndex];
    if (subIndex < currentFullWord.length) {
      const timeout = setTimeout(() => {
        setSubIndex((prev) => prev + 1);
      }, 85);
      return () => clearTimeout(timeout);
    } else {
      setIsPaused(true);
    }
  }, [subIndex, isDeleting, isPaused, wordIndex]);

  const currentText = WORDS[wordIndex].substring(0, subIndex);

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
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-elevated border border-surface-muted text-sm font-medium text-text-primary shadow-sm">
            <Sparkles className="w-4 h-4 text-accent" />
            Never Grow Alone
          </span>
        </motion.div>

        {/* Headline with Typewriter Animation */}
        <motion.h1 
          className="text-4xl md:text-5xl lg:text-6xl font-serif text-text-primary leading-tight md:leading-tight mb-8"
          variants={itemVariants}
        >
          <span className="block mb-2">
            Kamu tahu apa yang harus{" "}
            <span className="relative inline-block text-brand-900 border-b-2 border-accent/40 pb-0.5">
              <span>{currentText}</span>
              <span className="inline-block w-[3px] h-[0.85em] bg-accent ml-1 align-baseline animate-pulse rounded-full" />
            </span>
            .
          </span>
          <span className="block text-accent italic font-light">Tapi menjalaninya sendirian itu berat.</span>
        </motion.h1>

        {/* Sub-headline */}
        <motion.p 
          className="text-lg md:text-xl text-text-secondary max-w-3xl mx-auto mb-12 leading-relaxed font-sans"
          variants={itemVariants}
        >
          Thrivin membantu kamu menemukan apa yang perlu dipelajari, memahaminya, dan mengubahnya jadi pertumbuhan nyata — dengan pendamping yang hadir di setiap langkah.
        </motion.p>

        {/* CTAs */}
        <motion.div 
          className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-20"
          variants={itemVariants}
        >
          <a
            href="#domains"
            className="group flex items-center justify-center gap-2 px-8 py-4 bg-brand-900 text-white rounded-full font-semibold transition-all hover:bg-brand-800 hover:shadow-glow hover:-translate-y-0.5 w-full sm:w-auto cursor-pointer"
          >
            Jelajahi Learning Path
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#concept"
            className="flex items-center justify-center px-8 py-4 bg-white/70 border border-brand-200 text-brand-900 rounded-full font-semibold transition-all hover:border-accent hover:text-accent-dark hover:bg-white w-full sm:w-auto cursor-pointer shadow-sm"
          >
            Pelajari Konsep Thrivin
          </a>
        </motion.div>

        {/* Bottom Decorative */}
        <motion.div 
          className="flex items-center gap-4 text-text-muted text-sm tracking-widest uppercase font-medium"
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
