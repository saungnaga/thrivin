import React from "react";
import { siteConfig } from "@/lib/site";
import { offerRange } from "@/lib/pricing-copy";

export function OrganizationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    legalName: "Thrivin",
    url: siteConfig.url,
    logo: `${siteConfig.url}/icon.png`,
    description: siteConfig.description,
    sameAs: [
      siteConfig.links.instagram,
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: "+62-877-8814-1388",
        contactType: "customer service",
        availableLanguage: ["Indonesian", "English"],
        contactOption: "WhatsApp",
        url: siteConfig.links.whatsapp,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebSiteJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    alternateName: "Thrivin AI Companion",
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: "id-ID",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function NinaCompanionJsonLd() {
  // Harga wajib sama dengan katalog server (PLAN_CATALOG). Angka lama
  // (low 39.000 / high 219.000) tidak pernah ada di katalog.
  const { low, high, count } = offerRange();
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Nina — Thrivin AI Companion",
    applicationCategory: "HealthApplication",
    operatingSystem: "WhatsApp",
    description:
      "AI Companion personal di WhatsApp untuk wellness dan fitness: analisis foto nutrisi makanan, integrasi aktivitas Strava, pengingat kebiasaan harian, dan akuntabilitas 24/7.",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "IDR",
      lowPrice: String(low),
      highPrice: String(high),
      offerCount: String(count),
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
