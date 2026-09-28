import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import Journey from "@/components/Journey";
import Companion from "@/components/Companion";
import Domains from "@/components/Domains";
import Philosophy from "@/components/Philosophy";
import CallToAction from "@/components/CallToAction";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <Navbar />
      <Hero />
      <Problem />
      <Journey />
      <Domains />
      <Companion />
      <Philosophy />
      <CallToAction />
      <Footer />
    </main>
  );
}
