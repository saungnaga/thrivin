import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Thrivin — Never Grow Alone";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#08201D",
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(16, 185, 129, 0.18) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(245, 158, 11, 0.15) 0%, transparent 50%)",
          fontFamily: "sans-serif",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        {/* Subtle decorative border */}
        <div
          style={{
            position: "absolute",
            inset: "20px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "28px",
          }}
        />

        {/* Top Tag / Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 22px",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            borderRadius: "9999px",
            color: "#6ee7b7",
            fontSize: "20px",
            fontWeight: 600,
            letterSpacing: "0.05em",
            marginBottom: "32px",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#34D399",
              marginRight: "10px",
            }}
          />
          <span>AI Companion 24/7 di WhatsApp</span>
        </div>

        {/* Main Headline */}
        <div
          style={{
            fontSize: "68px",
            fontWeight: 800,
            color: "#FFFFFF",
            letterSpacing: "-0.03em",
            textAlign: "center",
            lineHeight: 1.1,
            marginBottom: "16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span>THRIVIN</span>
          <span
            style={{
              fontSize: "46px",
              color: "#FBBF24",
              fontWeight: 600,
              fontStyle: "italic",
              marginTop: "8px",
            }}
          >
            Never Grow Alone
          </span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "24px",
            color: "#D1D5DB",
            textAlign: "center",
            maxWidth: "850px",
            lineHeight: 1.45,
            marginTop: "8px",
          }}
        >
          Bangun konsistensi nutrisi, fitness & kebiasaan harian bersama pendamping personal langsung di WhatsApp.
        </div>

        {/* Footer Brand */}
        <div
          style={{
            position: "absolute",
            bottom: "45px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            color: "#9CA3AF",
            fontSize: "18px",
          }}
        >
          <span style={{ fontWeight: 700, color: "#FFFFFF" }}>thrivin.id</span>
          <span style={{ margin: "0 8px" }}>·</span>
          <span>Meet Nina, Wellness Companion</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
