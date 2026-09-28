"use client";

import { motion } from "framer-motion";
import { Dumbbell, Brain, Rocket, Heart, ArrowRight } from "lucide-react";
import Link from "next/link";

const domains = [
  {
    id: "wellness",
    icon: Dumbbell,
    category: "Tubuh & energi",
    title: "Wellness",
    description: "Bangun fondasi fisik yang membuatmu hadir penuh untuk hal-hal penting.",
    tags: ["Workout", "Yoga", "Nutrisi"],
    active: true,
    linkText: "Lihat learning path",
    linkHref: "/path/wellness",
    badge: "✦ Nina Companion Available",
  },
  {
    id: "self-development",
    icon: Brain,
    category: "Pola pikir & kebiasaan",
    title: "Self-Development",
    description: "Kenali diri, bangun kebiasaan, dan ubah insight menjadi gerak.",
    tags: ["Habits", "Books", "Awareness"],
    active: false,
    linkText: "Segera hadir",
    linkHref: "#",
  },
  {
    id: "skills-business",
    icon: Rocket,
    category: "Kerja & karya",
    title: "Skills & Business",
    description: "Pelajari keterampilan praktis dengan konteks yang dekat dengan duniamu.",
    tags: ["AI Content", "Digital Marketing"],
    active: false,
    linkText: "Segera hadir",
    linkHref: "#",
  },
  {
    id: "life-connection",
    icon: Heart,
    category: "Relasi & keseharian",
    title: "Life & Connection",
    description: "Navigasi hubungan dan keterampilan hidup yang membentuk keseharian.",
    tags: ["Parenting", "Communication", "Social"],
    active: false,
    linkText: "Segera hadir",
    linkHref: "#",
  },
];

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

export default function Domains() {
  return (
    <section id="domains" className="py-20 lg:py-28 bg-white overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="max-w-7xl mx-auto"
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 lg:mb-16 gap-6">
            <motion.div variants={itemVariants} className="max-w-2xl">
              <span className="inline-block text-brand-700 font-bold uppercase tracking-wider text-sm mb-3">
                Explore by Domain
              </span>
              <h2 className="font-serif text-3xl md:text-4xl text-text-primary">
                Ruang untuk bertumbuh
              </h2>
            </motion.div>
            
            <motion.div variants={itemVariants} className="hidden md:block">
              <span className="text-text-muted font-medium">
                4 domain tersedia
              </span>
            </motion.div>
          </div>

          {/* Grid */}
          <motion.div 
            variants={containerVariants}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {domains.map((domain) => {
              const Icon = domain.icon;
              return (
                <motion.div
                  key={domain.id}
                  variants={itemVariants}
                  className={`
                    relative flex flex-col h-full p-7 rounded-2xl bg-white
                    border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl
                    ${domain.active 
                      ? 'border-brand-200 shadow-sm border-l-4 border-l-brand-600' 
                      : 'border-surface-border md:border-gray-200'}
                  `}
                >
                  {/* Top section */}
                  <div className="mb-6 flex-grow">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mb-6">
                      <Icon className="w-6 h-6 text-brand-700" />
                    </div>
                    
                    <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                      {domain.category}
                    </div>
                    
                    <h3 className="font-serif text-2xl text-text-primary mb-3">
                      {domain.title}
                    </h3>
                    
                    <p className="text-text-secondary text-sm leading-relaxed mb-6">
                      {domain.description}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {domain.tags.map(tag => (
                        <span 
                          key={tag}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-surface-muted text-text-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bottom section */}
                  <div className="mt-auto pt-6 border-t border-surface-border md:border-gray-100 space-y-4">
                    {domain.badge && (
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-brand-50 text-brand-800 text-xs font-semibold">
                        {domain.badge}
                      </div>
                    )}
                    
                    <div>
                      {domain.active ? (
                        <Link 
                          href={domain.linkHref}
                          className="inline-flex items-center text-brand-700 font-bold hover:text-brand-800 transition-colors text-sm group"
                        >
                          {domain.linkText}
                          <ArrowRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      ) : (
                        <span className="inline-flex items-center text-text-muted text-sm font-medium">
                          {domain.linkText}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
