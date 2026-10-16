import Link from "next/link";
import { MessageCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-surface-muted border-t border-surface-border mt-auto">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
        {/* Left: Copyright (Rule 9: Inter Regular small) */}
        <p className="font-sans font-normal text-xs sm:text-sm text-text-muted text-center sm:text-left">
          &copy; 2026 Thrivin. Never Grow Alone. AI Companion Platform.
        </p>

        {/* Right: Horizontal links (Rule 9: Inter Regular small) */}
        <nav
          aria-label="Footer Navigation"
          className="font-sans font-normal flex flex-wrap items-center justify-center sm:justify-end gap-5 text-xs sm:text-sm text-text-muted"
        >
          <Link
            href="/companion/nina"
            className="hover:text-brand-900 transition-colors"
          >
            Companion Nina
          </Link>
          <Link
            href="/companion/nina/learning"
            className="hover:text-brand-900 transition-colors"
          >
            Knowledge Base
          </Link>
          <Link
            href="/about"
            className="hover:text-brand-900 transition-colors"
          >
            About Thrivin
          </Link>
          <Link
            href="/privacy"
            className="hover:text-brand-900 transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-brand-900 transition-colors"
          >
            Syarat &amp; Ketentuan
          </Link>
          <a
            href="https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20butuh%20bantuan"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950 font-medium transition-all shadow-2xs"
            aria-label="Hubungi Customer Service Thrivin via WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Customer Service</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
