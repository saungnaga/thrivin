import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge Base Sains Nina — Science-Proven Wellness & Habit",
  description:
    "Dasar pengetahuan ilmiah di balik Nina: riset nutrisi, fisiologi latihan, panduan kardio & Strava, serta strategi konsistensi berbasis sains (science-proven).",
  alternates: {
    canonical: "/nina/learning",
  },
  openGraph: {
    title: "Knowledge Base Sains Nina (Science-Proven) — Thrivin",
    description:
      "Dasar sains teruji di balik AI Wellness Companion Nina di WhatsApp. Pelajari fundamental fisiologi, nutrisi, dan kebiasaan sehat.",
    url: "/nina/learning",
  },
};

export default function NinaLearningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
