import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${sourceSerif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
