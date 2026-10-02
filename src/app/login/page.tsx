"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Lock, User, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    await login(username, password);
    setIsLoading(false);
    router.push("/dashboard");
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    await login("Ari Pratama", "demo123");
    setIsLoading(false);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-brand-900 transition-colors mb-6 py-1 px-2.5 rounded-lg bg-surface border border-surface-border w-fit shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Beranda</span>
        </Link>

        {/* Brand & Heading */}
        <div className="text-center">
          <Link href="/" className="inline-block mb-3">
            <span className="font-black tracking-[0.22em] text-gradient text-2xl sm:text-3xl">
              THRIVIN
            </span>
          </Link>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950">
            Masuk ke Akunmu
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-text-secondary">
            Akses dashboard progres, companion aktif, dan materi pembelajaran.
          </p>
        </div>

        {/* Login Card */}
        <div className="mt-8 bg-surface py-8 px-6 sm:px-10 shadow-sm border border-surface-border rounded-3xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-brand-950 uppercase tracking-wider mb-2">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="contoh: aripratama"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-border text-sm text-brand-950 placeholder:text-text-muted/60 focus:border-brand-900 focus:ring-2 focus:ring-brand-900/10 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-950 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-border text-sm text-brand-950 placeholder:text-text-muted/60 focus:border-brand-900 focus:ring-2 focus:ring-brand-900/10 outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="w-full mt-2 rounded-full bg-brand-900 hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 text-sm transition-all shadow-glow hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isLoading ? "Memproses..." : "Masuk ke Dashboard"}</span>
              <ArrowRight className="w-4 h-4 text-accent" />
            </button>
          </form>

          {/* Quick Demo Login Option */}
          <div className="mt-6 pt-5 border-t border-surface-border text-center">
            <button
              type="button"
              onClick={handleDemoLogin}
              className="w-full py-2.5 px-4 rounded-xl bg-brand-50 hover:bg-brand-100 border border-brand-200 text-xs font-bold text-brand-900 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent-dark" />
              <span>Coba Masuk Instan (Mode Demo Sandbox)</span>
            </button>
          </div>

          <div className="mt-6 text-center text-xs text-text-secondary">
            Belum punya akun?{" "}
            <Link href="/signup" className="font-bold text-brand-900 hover:underline">
              Daftar di sini
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
