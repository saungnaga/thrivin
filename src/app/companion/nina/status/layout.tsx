import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status Langganan Nina",
  robots: {
    index: false,
    follow: false,
  },
};

export default function WaStatusLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
