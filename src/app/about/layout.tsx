import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tentang Kami — Visi & Cara Kerja Platform Thrivin",
  description:
    "Pelajari visi Thrivin dalam membangun ekosistem pendampingan personal berbasis AI. Bukan sekadar bot ensiklopedia, melainkan partner akuntabilitas nyata yang hadir di WhatsApp.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "Tentang Thrivin — Never Grow Alone",
    description:
      "Pertumbuhan yang paling sering gagal bukan karena rencananya buruk, tapi karena dijalani sendirian. Kenali cara kerja Thrivin.",
    url: "/about",
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
