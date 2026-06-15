import { ImageResponse } from "next/og";
import { normalizeAddressParam } from "@/lib/address";
import { getTokenByAddress } from "@/lib/db/launchpad";

export const alt = "Pump token";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ImageProps = {
  params: Promise<{ address: string }>;
};

function formatMcapBnb(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K BNB`;
  if (n >= 1) return `${n.toFixed(2)} BNB`;
  return `${n.toFixed(4)} BNB`;
}

async function loadLogoSrc(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl, { cache: "force-cache" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function tokenInitials(symbol: string): string {
  const clean = symbol.replace(/^\$/, "").trim();
  return (clean.slice(0, 2) || "TK").toUpperCase();
}

function notFoundImage(message: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1729",
          color: "#9eb4d8",
          fontSize: 40,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {message}
      </div>
    ),
    { ...size }
  );
}

export default async function TokenOpenGraphImage({ params }: ImageProps) {
  const { address } = await params;
  const normalized = normalizeAddressParam(address);

  if (!normalized) {
    return notFoundImage("Token not found");
  }

  let token: Awaited<ReturnType<typeof getTokenByAddress>> = null;
  try {
    token = await getTokenByAddress(normalized);
  } catch {
    token = null;
  }

  if (!token) {
    return notFoundImage("Token not found");
  }

  const change24h = token.change24hPct;
  const changeLabel =
    change24h != null && Number.isFinite(change24h)
      ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`
      : "—";
  const changeColor =
    change24h != null && Number.isFinite(change24h)
      ? change24h >= 0
        ? "#38c581"
        : "#e35f5f"
      : "#9eb4d8";
  const logoSrc = await loadLogoSrc(token.logoUrl);
  const initials = tokenInitials(token.symbol);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(145deg, #0f1729 0%, #1a2744 55%, #0d1b33 100%)",
          color: "#f4f7fc",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#6b9fff",
              letterSpacing: "0.08em",
            }}
          >
            PUMP
          </div>
          <div style={{ fontSize: 22, color: "#7a92b8" }}>BSC Launchpad</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt=""
              width={120}
              height={120}
              style={{
                borderRadius: 4,
                border: "2px solid #3d5a9a",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: 120,
                height: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #3d5a9a",
                background: "rgba(61, 90, 154, 0.2)",
                fontSize: 40,
                fontWeight: 700,
                color: "#9eb4d8",
              }}
            >
              {initials}
            </div>
          )}
          <div>
            <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.02em" }}>
              ${token.symbol}
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 36,
                color: "#9eb4d8",
                maxWidth: 720,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {token.name}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 48, fontSize: 28 }}>
          <div>
            <div style={{ color: "#7a92b8", fontSize: 20, marginBottom: 6 }}>MCAP</div>
            <div style={{ fontWeight: 600 }}>{formatMcapBnb(token.marketCapBnb)}</div>
          </div>
          <div>
            <div style={{ color: "#7a92b8", fontSize: 20, marginBottom: 6 }}>24H</div>
            <div style={{ fontWeight: 600, color: changeColor }}>{changeLabel}</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
