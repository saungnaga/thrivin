"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, User, LogOut, Sparkles, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    setUserDropdownOpen(false);
    setIsOpen(false);
    router.push("/");
  };

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
            className="hidden md:flex items-center gap-7 lg:gap-9"
            aria-label="Main Navigation"
          >
            {user ? (
              // Logged in navigation
              <>
                <Link
                  href="/dashboard"
                  className="text-sm font-semibold text-brand-900 hover:text-accent transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>Dashboard</span>
                </Link>
                <Link
                  href="/companion/nina/learning"
                  className="text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
                >
                  Learning
                </Link>
                <Link
                  href={user?.activeCompanion === "nina" ? "/dashboard" : "/companion/nina"}
                  className="text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
                >
                  Companion
                </Link>
              </>
            ) : (
              // Guest navigation
              <>
                <Link
                  href="/#companions"
                  className="text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
                >
                  Companion
                </Link>
                <Link
                  href="/about"
                  className="text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
                >
                  About Thrivin
                </Link>
                <Link
                  href="/privacy"
                  className="text-sm font-medium text-text-secondary hover:text-brand-900 transition-colors"
                >
                  Privacy Policy
                </Link>
              </>
            )}
            <a
              href="https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20butuh%20bantuan"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
              aria-label="Customer Service WhatsApp 0877-8814-1388"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>CS: 0877-8814-1388</span>
            </a>
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {user ? (
              // Logged In: User Profile & Logout
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-colors cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-full bg-brand-900 text-accent flex items-center justify-center text-xs font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-brand-950 max-w-[100px] truncate">
                    {user.username}
                  </span>
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                  {userDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-surface-border p-2 z-50"
                    >
                      <div className="px-3 py-2 border-b border-surface-border/60">
                        <div className="text-xs font-bold text-brand-950 truncate">
                          {user.username}
                        </div>
                        <div className="text-[10px] text-accent-dark font-medium">
                          {user.plan || "Aktif"}
                        </div>
                      </div>
                      <Link
                        href="/dashboard"
                        onClick={() => setUserDropdownOpen(false)}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-text-secondary hover:text-brand-900 hover:bg-surface-muted rounded-xl flex items-center gap-2 transition-colors mt-1"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Buka Dashboard</span>
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Keluar (Logout)</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              // Guest: Login / Signup
              <div className="hidden sm:flex items-center gap-2.5">
                <Link
                  href="/login"
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-text-secondary hover:text-brand-900 transition-colors"
                >
                  Masuk
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-brand-900 text-white px-5 py-2 text-xs sm:text-sm font-bold shadow-xs hover:bg-brand-800 hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                >
                  Daftar
                </Link>
              </div>
            )}

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
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={() => setIsOpen(false)}
                    className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
                  >
                    <span>Dashboard</span>
                    <Sparkles className="w-5 h-5 text-accent" />
                  </Link>
                  <Link
                    href="/companion/nina/learning"
                    onClick={() => setIsOpen(false)}
                    className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
                  >
                    <span>Learning</span>
                    <span className="text-text-muted text-sm">&rarr;</span>
                  </Link>
                  <Link
                    href={user?.activeCompanion === "nina" ? "/dashboard" : "/companion/nina"}
                    onClick={() => setIsOpen(false)}
                    className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
                  >
                    <span>{user?.activeCompanion === "nina" ? "Dashboard Nina" : "Companion Nina"}</span>
                    <MessageCircle className="w-5 h-5 text-accent" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/#companions"
                    onClick={() => setIsOpen(false)}
                    className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
                  >
                    <span>Pilihan Companion</span>
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
                </>
              )}

              {/* Customer Service Mobile Link */}
              <a
                href="https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20butuh%20bantuan"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="font-sans text-xl font-bold text-brand-900 py-2.5 border-b border-surface-border/60 flex items-center justify-between"
              >
                <span>Customer Service</span>
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  0877-8814-1388
                </span>
              </a>
            </nav>

            <div className="pt-6 pb-4 flex flex-col gap-3">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="w-full text-center rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-bold py-3 text-sm cursor-pointer"
                >
                  Keluar dari Akun
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href="/signup"
                    onClick={() => setIsOpen(false)}
                    className="w-full text-center rounded-full bg-brand-900 text-white font-bold py-3.5 text-sm shadow-md"
                  >
                    Daftar Akun Baru
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="w-full text-center rounded-full bg-surface-muted border border-surface-border text-brand-900 font-semibold py-3 text-sm"
                  >
                    Sudah Punya Akun? Masuk
                  </Link>
                </div>
              )}
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
