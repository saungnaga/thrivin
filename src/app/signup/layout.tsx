import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daftar Akun Baru",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
