import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kurikulum & Panduan Wellness Nina — Nutrisi, Latihan & Habit",
  description:
    "Pelajari fundamental nutrisi, program latihan beban, panduan kardio & Strava, serta strategi membangun kebiasaan hidup sehat yang berkelanjutan bersama Nina.",
  alternates: {
    canonical: "/companion/nina/learning",
  },
  openGraph: {
    title: "Kurikulum Wellness Nina — Thrivin",
    description:
      "Panduan komprehensif nutrisi, strength training, dan recovery yang dipersonalisasi bersama AI Companion di WhatsApp.",
    url: "/companion/nina/learning",
  },
};

export default function NinaLearningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
