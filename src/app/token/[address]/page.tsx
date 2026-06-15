import type { Metadata } from "next";
import { TokenDetailShell } from "@/components/token/TokenDetailShell";
import { normalizeAddressParam } from "@/lib/address";
import { getTokenByAddress } from "@/lib/db/launchpad";

type PageProps = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { address } = await params;
  const normalized = normalizeAddressParam(address);
  if (!normalized) {
    return { title: "Token" };
  }

  try {
    const token = await getTokenByAddress(normalized);
    if (!token) {
      return { title: "Token not found" };
    }

    const title = `${token.symbol} — ${token.name}`;
    const description = `Trade $${token.symbol} on Pump. BSC bonding curve meme launchpad.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: [
          {
            url: `/token/${normalized}/opengraph-image`,
            width: 1200,
            height: 630,
            alt: `${token.symbol} on Pump`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [`/token/${normalized}/opengraph-image`],
      },
    };
  } catch {
    return { title: "Token" };
  }
}

export default async function TokenDetailPage({ params }: PageProps) {
  const { address } = await params;
  return <TokenDetailShell address={address} />;
}
