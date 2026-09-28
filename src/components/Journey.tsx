"use client";

import { motion } from "framer-motion";
import { Compass, Sparkles, Target, TrendingUp } from "lucide-react";

const stages = [
  {
    num: "01",
    title: "DISCOVER",
    desc: "Kenali masalah dan kebutuhanmu dalam konteks yang lebih luas",
    icon: Compass,
  },
  {
    num: "02",
    title: "LEARN",
    desc: "Akses materi terstruktur: roadmap, konsep, dan latihan terarah",
    icon: Sparkles,
  },
  {
    num: "03",
    title: "APPLY",
    desc: "Terapkan pengetahuan ke dalam kehidupan nyatamu",
    icon: Target,
  },
  {
    num: "04",
    title: "GROW",
    desc: "Didampingi oleh AI Companion yang mengenal konteksmu",
    icon: TrendingUp,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
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

const lineVariants = {
  hidden: { width: 0 },
  visible: { 
    width: "100%", 
    transition: { duration: 0.8, ease: "easeOut" as const } 
  },
} as const;

const iconVariants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 100, damping: 30, delay: 0.2 },
  },
} as const;

export default function Journey() {
  return (
    <section id="journey" className="bg-white py-24 lg:py-36 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring" as const, stiffness: 100, damping: 30 }}
          className="text-center max-w-2xl mx-auto mb-20"
        >
          <span className="text-accent text-sm font-bold tracking-widest uppercase mb-4 block">
            THE THRIVIN EXPERIENCE
          </span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold text-text-primary mb-6">
            Bertumbuh, satu langkah yang berarti.
          </h2>
          <p className="text-text-secondary text-lg">
            Bukan tentang bergerak lebih cepat. Tentang bergerak ke arah yang tepat.
          </p>
        </motion.div>

        {/* Stages Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-6 relative"
        >
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <motion.div 
                key={stage.title} 
                variants={itemVariants} 
                className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left"
              >
                {/* Connecting Line (symmetric on all items including GROW) */}
                <div className="hidden md:block absolute top-8 left-16 right-[-1.5rem] h-[2px] bg-brand-100/70 -z-10 overflow-hidden">
                  <motion.div
                    variants={lineVariants}
                    className={`h-full origin-left ${
                      index === stages.length - 1
                        ? "bg-gradient-to-r from-accent to-accent-light/50"
                        : "bg-accent"
                    }`}
                  />
                </div>
                
                {/* Icon */}
                <motion.div 
                  variants={iconVariants}
                  className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 mb-6 shrink-0 relative z-20"
                >
                  <Icon className="w-8 h-8" />
                </motion.div>

                {/* Content */}
                <div className="flex flex-col gap-2">
                  <span className="text-text-muted font-mono tracking-wide text-sm font-medium">
                    {stage.num}
                  </span>
                  <h3 className="uppercase font-black tracking-wide text-brand-800 text-lg">
                    {stage.title}
                  </h3>
                  <p className="text-text-secondary text-sm md:text-base leading-relaxed">
                    {stage.desc}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring" as const, stiffness: 100, damping: 30, delay: 0.6 }}
          className="mt-20 max-w-3xl mx-auto text-center bg-surface-muted rounded-2xl p-8 md:p-10 border border-brand-100/50"
        >
          <p className="text-text-primary text-lg md:text-xl">
            <span className="font-normal">Dua tahap pertama tentang pengetahuan.</span>{" "}
            <span className="font-semibold text-brand-700">Dua tahap terakhir tentang hubungan dan konteks pribadi.</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
