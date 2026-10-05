import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jelajahi AI Companion & Path Pertumbuhan",
  description:
    "Eksplorasi AI companion yang dirancang khusus untuk berbagai aspek kehidupan: Wellness, Habits, Mindset, dan Karier. Mulai perjalanan konsistensimu bersama Thrivin.",
  alternates: {
    canonical: "/explore",
  },
  openGraph: {
    title: "Jelajahi AI Companion & Path Pertumbuhan | Thrivin",
    description:
      "Temukan AI Companion yang sesuai dengan target hidupmu. Hadir 24/7 di WhatsApp.",
    url: "/explore",
  },
};

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
