import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Pump — BSC Meme Launchpad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function loadRoundedLogoDataUri(): string | null {
  try {
    const filePath = path.join(process.cwd(), "public/logos/light-rounded.svg");
    const svg = readFileSync(filePath, "utf8");
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return null;
  }
}

export default function OpenGraphImage() {
  const logoSrc = loadRoundedLogoDataUri();

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
          background: "linear-gradient(160deg, #0A0B0D 0%, #141519 45%, #0A0B0D 100%)",
          color: "#FFFFFF",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            marginBottom: 36,
          }}
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- OG ImageResponse requires img
            <img src={logoSrc} alt="" width={88} height={88} />
          ) : (
            <div
              style={{
                width: 88,
                height: 88,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 20,
                background: "#0052FF",
                fontSize: 40,
                fontWeight: 700,
              }}
            >
              P
            </div>
          )}
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em" }}>Pump</div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, color: "#8A919E", marginBottom: 16 }}>
          BSC Meme Launchpad
        </div>
        <div style={{ fontSize: 24, color: "#8A919E", maxWidth: 720, lineHeight: 1.45, opacity: 0.9 }}>
          Launch, trade, and earn on bonding curves. Pro trader terminal with rewards layer.
        </div>
      </div>
    ),
    { ...size }
  );
}
