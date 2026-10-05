import type { Metadata } from "next";
import { NinaCompanionJsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "Nina — Personal AI Fitness & Wellness Companion di WhatsApp",
  description:
    "Temui Nina, AI Companion pertama Thrivin untuk wellness & fitness. Analisis foto makanan, tracking Strava, reach out proaktif, dan memori jangka panjang 24/7 di WhatsApp.",
  keywords: [
    "Nina Thrivin",
    "AI Fitness Companion",
    "Personal Trainer WhatsApp",
    "Baca Foto Makanan AI",
    "Diet Companion WhatsApp",
    "Integrasi Strava AI",
    "Akuntabilitas Olahraga",
  ],
  alternates: {
    canonical: "/companion/nina",
  },
  openGraph: {
    title: "Meet Nina — AI Companion Pribadimu di WhatsApp | Thrivin",
    description:
      "Teman yang tumbuh bareng kamu. Baca foto makanan, evaluasi Strava, reach out proaktif di jam genting, langsung di WhatsApp.",
    url: "/companion/nina",
  },
};

export default function NinaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NinaCompanionJsonLd />
      {children}
    </>
  );
}
