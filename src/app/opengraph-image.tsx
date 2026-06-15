import { ImageResponse } from "next/og";

export const alt = "Pump — BSC Meme Launchpad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background: "linear-gradient(145deg, #0f1729 0%, #1a2744 55%, #0d1b33 100%)",
          color: "#f4f7fc",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #3d5a9a",
              background: "rgba(61, 90, 154, 0.2)",
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em" }}>Pump</div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, color: "#9eb4d8", marginBottom: 16 }}>
          BSC Meme Launchpad
        </div>
        <div style={{ fontSize: 24, color: "#7a92b8", maxWidth: 720, lineHeight: 1.4 }}>
          Launch, trade, and earn on bonding curves. Pro trader terminal with rewards layer.
        </div>
      </div>
    ),
    { ...size }
  );
}
