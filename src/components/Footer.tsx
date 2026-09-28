import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-surface-muted border-t border-surface-border">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left: Copyright */}
        <p className="text-sm text-text-muted text-center sm:text-left">
          &copy; 2026 Thrivin. Bertumbuh bersama.
        </p>

        {/* Right: Horizontal links */}
        <nav
          aria-label="Footer Navigation"
          className="flex flex-wrap items-center justify-center sm:justify-end gap-5 text-sm text-text-muted"
        >
          <Link
            href="https://instagram.com/thrivin_id"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-700 transition-colors"
          >
            Instagram @thrivin_id
          </Link>
          <Link
            href="/privacy"
            className="hover:text-brand-700 transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-brand-700 transition-colors"
          >
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
