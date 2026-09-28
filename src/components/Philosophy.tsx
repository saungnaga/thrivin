"use client";

import { motion } from "framer-motion";

export default function Philosophy() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.1 },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 100, damping: 30 },
    },
  } as const;

  return (
    <section className="relative py-24 lg:py-36 bg-gradient-to-b from-surface to-surface-muted overflow-hidden flex justify-center items-center">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="flex flex-col items-center"
        >
          {/* Opening Symbol */}
          <motion.div variants={itemVariants} className="text-accent text-3xl mb-12">
            ✳
          </motion.div>

          {/* Main Quote */}
          <div className="font-serif text-3xl sm:text-5xl leading-tight text-text-primary">
            <motion.p variants={itemVariants} className="mb-2">
              Mengetahui apa yang harus dilakukan
            </motion.p>
            <motion.p variants={itemVariants} className="mb-2">
              tidak sama dengan mampu
            </motion.p>
            <motion.p variants={itemVariants} className="text-accent italic">
              melakukannya sendirian.
            </motion.p>
          </div>

          {/* Supporting Lines */}
          <motion.div variants={itemVariants} className="mt-10 text-lg text-text-secondary flex flex-col gap-2">
            <p>Sistem belajar memberi arah.</p>
            <p>Pengetahuan memberi pemahaman.</p>
            <p>Companion memberi konteks dan kehadiran.</p>
          </motion.div>

          {/* Closing */}
          <motion.p variants={itemVariants} className="mt-8 text-sm text-text-muted">
            Dan kamu tetap menjadi orang yang menjalani pertumbuhanmu sendiri.
          </motion.p>

          {/* Tagline */}
          <motion.p variants={itemVariants} className="mt-12 font-black tracking-wider text-brand-800 text-xl">
            — Never Grow Alone.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
