import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Thrivin — Never Grow Alone",
  description:
    "Platform pertumbuhan pribadi yang membantu kamu menemukan apa yang perlu dipelajari, memahaminya, dan mengubahnya jadi pertumbuhan nyata — dengan pendamping yang hadir di setiap langkah.",
  keywords: [
    "personal growth",
    "wellness",
    "self-development",
    "AI companion",
    "learning platform",
    "thrivin",
  ],
  openGraph: {
    title: "Thrivin — Never Grow Alone",
    description:
      "Temukan apa yang perlu dipelajari. Pahami cara menerapkannya. Bertumbuh bersama pendamping.",
    siteName: "Thrivin",
    locale: "id_ID",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

import { AuthProvider } from "@/context/AuthContext";
import { AIChatWidget } from "@/components/AIChatWidget";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${inter.variable} ${lora.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
          <AIChatWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
