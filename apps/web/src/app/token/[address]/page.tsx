import { Suspense } from "react";
import type { Metadata } from "next";
import { AppShellFrame } from "@/components/layout/AppShell";
import { TokenDetailPageLoader } from "@/components/token/TokenDetailPageLoader";
import { TokenDetailBodySkeleton } from "@/components/token/TokenDetailBodySkeleton";
import { normalizeAddressParam } from "@/lib/address";
import { fetchBnbUsdPrice } from "@/lib/bnb-price-server";
import { getTokenByAddress } from "@/lib/db/launchpad";
import { tokenPriceUsd } from "@/lib/format-usd";
import { resolveMarkPriceBnb } from "@/lib/mark-price";
import { formatTokenPageTitle } from "@/lib/token-tab-title";

type PageProps = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { address } = await params;
  const normalized = normalizeAddressParam(address);
  if (!normalized) {
    return { title: "Token" };
  }

  try {
    const [token, { bnbUsd }] = await Promise.all([
      getTokenByAddress(normalized),
      fetchBnbUsdPrice(),
    ]);
    if (!token) {
      return { title: "Token not found" };
    }

    const markBnb = resolveMarkPriceBnb(token, []);
    const priceUsd = tokenPriceUsd(markBnb, bnbUsd);
    const title = formatTokenPageTitle(token.symbol, priceUsd);
    const description = `Trade ${token.symbol}/USD on Pump. BSC bonding curve meme launchpad.`;

    return {
      title,
      description,
      openGraph: {
        title: `${title} | Pump`,
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
        title: `${title} | Pump`,
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

  return (
    <Suspense
      fallback={
        <AppShellFrame wide pathname={`/token/${address}`}>
          <TokenDetailBodySkeleton />
        </AppShellFrame>
      }
    >
      <TokenDetailPageLoader address={address} />
    </Suspense>
  );
}
