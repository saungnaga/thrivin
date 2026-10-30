"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowRight, MessageCircle, BookOpen } from "lucide-react";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  // Close mobile menu on resize to desktop breakpoint
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent background scroll when mobile menu is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-[76px] bg-surface/90 backdrop-blur-xl border-b border-surface-border">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Left: Brand Logo */}
          <Link
            href="/"
            className="flex items-center transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 rounded-sm"
            aria-label="Thrivin Homepage"
            onClick={() => setIsOpen(false)}
          >
            <span className="font-black tracking-[0.22em] text-gradient text-xl sm:text-2xl">
              THRIVIN
            </span>
          </Link>

          {/* Center: Desktop Navigation Links */}
          <nav
            className="hidden md:flex items-center gap-6 lg:gap-8"
            aria-label="Main Navigation"
          >
            <Link
              href="/nina"
              className="text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
            >
              Companion Nina
            </Link>

            <Link
              href="/nina/learning"
              className="text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors flex items-center gap-1.5 group"
            >
              <span>Knowledge Base</span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:bg-emerald-100 transition-colors">
                Science Proven
              </span>
            </Link>

            <Link
              href="/about"
              className="text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
            >
              About Thrivin
            </Link>

            <a
              href="https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20butuh%20bantuan"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
              aria-label="Customer Service WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Customer Service</span>
            </a>
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center">
              <Link
                href="/nina/onboarding/1"
                className="rounded-full bg-brand-900 text-white px-5 py-2.5 text-xs sm:text-sm font-bold shadow-xs hover:bg-brand-800 hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center gap-2 cursor-pointer"
              >
                <span>Mulai Sekarang</span>
                <ArrowRight className="w-3.5 h-3.5 text-accent" />
              </Link>
            </div>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-label={isOpen ? "Tutup navigasi" : "Buka navigasi"}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-brand-900 hover:bg-surface-muted transition-colors cursor-pointer"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-x-0 top-[76px] bottom-0 z-40 bg-surface/95 backdrop-blur-2xl border-b border-surface-border md:hidden overflow-y-auto px-6 py-6 flex flex-col justify-between"
          >
            <nav className="flex flex-col space-y-3 pt-2">
              <Link
                href="/nina"
                onClick={() => setIsOpen(false)}
                className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
              >
                <span>Companion Nina</span>
                <span className="text-text-muted text-sm">&rarr;</span>
              </Link>

              <Link
                href="/nina/learning"
                onClick={() => setIsOpen(false)}
                className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span>Knowledge Base</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Science Proven
                  </span>
                </div>
                <span className="text-text-muted text-sm">&rarr;</span>
              </Link>

              <Link
                href="/about"
                onClick={() => setIsOpen(false)}
                className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
              >
                <span>About Thrivin</span>
                <span className="text-text-muted text-sm">&rarr;</span>
              </Link>

              <Link
                href="/privacy"
                onClick={() => setIsOpen(false)}
                className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
              >
                <span>Privacy Policy</span>
                <span className="text-text-muted text-sm">&rarr;</span>
              </Link>

              {/* Customer Service Mobile Link */}
              <a
                href="https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20butuh%20bantuan"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
              >
                <span>Customer Service</span>
                <span className="text-xs font-sans font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  WhatsApp &rarr;
                </span>
              </a>
            </nav>

            <div className="pt-6 pb-4 flex flex-col gap-3">
              <Link
                href="/nina/onboarding/1"
                onClick={() => setIsOpen(false)}
                className="w-full text-center rounded-full bg-brand-900 text-white font-bold py-3.5 text-sm shadow-md flex items-center justify-center gap-2"
              >
                <span>Mulai Bersama Nina</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </Link>
              <p className="text-center text-[10px] tracking-widest text-text-muted uppercase mt-2">
                THRIVIN · AI COMPANION PLATFORM
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default Navbar;
