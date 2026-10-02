import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-surface-muted border-t border-surface-border mt-auto">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left: Copyright */}
        <p className="text-xs sm:text-sm text-text-muted text-center sm:text-left">
          &copy; 2026 Thrivin. Never Grow Alone. AI Companion Platform.
        </p>

        {/* Right: Horizontal links */}
        <nav
          aria-label="Footer Navigation"
          className="flex flex-wrap items-center justify-center sm:justify-end gap-5 text-xs sm:text-sm text-text-muted"
        >
          <Link
            href="/companion/nina"
            className="hover:text-brand-900 transition-colors"
          >
            Companion Nina
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
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
