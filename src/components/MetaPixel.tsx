"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, Suspense } from "react";

export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID || "1130657963058730";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

/**
 * Helper to trigger standard or custom Meta Pixel events
 * Example: fbqTrack("Lead", { content_name: "Onboarding Phone" })
 */
export const fbqTrack = (event: string, data?: Record<string, any>) => {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (data) {
      window.fbq("track", event, data);
    } else {
      window.fbq("track", event);
    }
  }
};

/**
 * Inner component to track PageView on client-side SPA route changes
 */
function PixelNavigationTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstLoad = useRef(true);

  useEffect(() => {
    // Initial page load is already tracked by the inline script in <head>
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }

    if (
      META_PIXEL_ID &&
      typeof window !== "undefined" &&
      typeof window.fbq === "function"
    ) {
      window.fbq("track", "PageView");
    }
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixel() {
  if (!META_PIXEL_ID) return null;

  return (
    <Suspense fallback={null}>
      <PixelNavigationTracker />
    </Suspense>
  );
}
