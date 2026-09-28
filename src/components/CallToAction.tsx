"use client";

import { motion } from "framer-motion";

export default function CallToAction() {
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
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 100, damping: 30 },
    },
  } as const;

  return (
    <section id="cta" className="relative py-28 lg:py-40 flex justify-center items-center">
      {/* Background Split */}
      <div className="absolute inset-0 z-0 flex flex-col">
        <div className="flex-1 bg-surface"></div>
        <div className="flex-1 bg-surface-muted"></div>
      </div>

      <div className="container relative z-10 mx-auto px-4 max-w-3xl text-center">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="flex flex-col items-center"
        >
          {/* Decorative Symbol */}
          <motion.div variants={itemVariants} className="text-accent text-3xl mb-8">
            ✳
          </motion.div>

          {/* Heading */}
          <motion.h2 variants={itemVariants} className="font-serif text-5xl sm:text-7xl leading-tight text-text-primary mb-6">
            Siap memulai perjalananmu?
          </motion.h2>

          {/* Subheading */}
          <motion.p variants={itemVariants} className="text-lg text-text-secondary mb-12 max-w-xl mx-auto">
            Know what to learn. Know how to apply it. Never grow alone.
          </motion.p>

          {/* CTA Button */}
          <motion.div variants={itemVariants} className="relative">
            <motion.a
              href="#domains"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex relative z-10 items-center justify-center px-10 py-5 text-lg font-semibold text-white bg-brand-900 rounded-full transition-all hover:bg-brand-800 shadow-glow"
            >
              Mulai Eksplorasi Sekarang &rarr;
            </motion.a>
            {/* Pulsing Glow Effect */}
            <motion.div
              className="absolute inset-0 rounded-full bg-accent/40 z-0 blur-md"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.2, 0.6, 0.2]
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut" as const
              }}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
