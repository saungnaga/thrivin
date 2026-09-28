"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Ecosystem", href: "/#concept" },
  { label: "Learning Hub", href: "/explore" },
  { label: "Companion", href: "/#companion" },
];

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

  // Close mobile menu with Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-[76px] bg-surface/85 backdrop-blur-xl border-b border-surface-border">
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
            className="hidden md:flex items-center gap-8 lg:gap-10"
            aria-label="Main Navigation"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm lg:text-base font-medium text-text-secondary hover:text-brand-700 transition-colors duration-200"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right: CTA Button (Desktop) & Hamburger Menu Button (Mobile) */}
          <div className="flex items-center gap-4">
            <Link
              href="/explore"
              className="hidden md:inline-flex items-center justify-center rounded-full bg-brand-900 text-white px-6 py-2.5 text-sm font-semibold shadow hover:bg-brand-800 hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Mulai Bertumbuh
            </Link>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-label={isOpen ? "Tutup navigasi" : "Buka navigasi"}
              aria-expanded={isOpen}
              aria-controls="mobile-nav-overlay"
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-brand-900 hover:text-brand-700 hover:bg-surface-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            >
              {isOpen ? (
                <X className="w-6 h-6" aria-hidden="true" />
              ) : (
                <Menu className="w-6 h-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="mobile-nav-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 top-[76px] bottom-0 z-40 bg-surface/95 backdrop-blur-2xl border-b border-surface-border md:hidden overflow-y-auto"
          >
            <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col justify-between min-h-[calc(100dvh-76px)]">
              {/* Stacked Navigation Links */}
              <motion.nav
                initial="closed"
                animate="open"
                exit="closed"
                variants={{
                  closed: { opacity: 0 },
                  open: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.08,
                      delayChildren: 0.05,
                    },
                  },
                }}
                className="flex flex-col space-y-2 pt-2"
                aria-label="Mobile Navigation Links"
              >
                {NAV_ITEMS.map((item) => (
                  <motion.div
                    key={item.label}
                    variants={{
                      closed: { opacity: 0, y: 15 },
                      open: {
                        opacity: 1,
                        y: 0,
                        transition: {
                          type: "spring" as const,
                          stiffness: 100,
                          damping: 30,
                        },
                      },
                    }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className="font-serif text-2xl text-brand-900 hover:text-brand-700 transition-colors flex items-center justify-between py-3 border-b border-surface-border/60 group"
                    >
                      <span>{item.label}</span>
                      <span className="text-accent text-lg transform group-hover:translate-x-1 transition-transform">
                        &rarr;
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </motion.nav>

              {/* Mobile CTA Button & Brand Footer */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    delay: 0.25,
                    type: "spring" as const,
                    stiffness: 100,
                    damping: 30,
                  },
                }}
                className="pt-8 pb-4 flex flex-col gap-4"
              >
                <Link
                  href="/explore"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-center rounded-full bg-brand-900 hover:bg-brand-800 text-white font-semibold py-3.5 shadow-sm hover:shadow transition-all duration-200 active:translate-y-0"
                >
                  Mulai Bertumbuh
                </Link>
                <p className="text-center text-xs tracking-wider text-text-muted uppercase">
                  Never Grow Alone
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default Navbar;
