import type { Metadata } from "next";
import { connection } from "next/server";
import { TokenDetailSsrSeed } from "@/components/token/TokenDetailSsrBridge";
import { normalizeAddressParam } from "@/lib/address";
import { fetchArenaHomePayload } from "@/lib/arena-server";
import { fetchBnbUsdPrice } from "@/lib/bnb-price-server";
import { getTokenByAddress } from "@/lib/db/launchpad";
import { tokenPriceUsd } from "@/lib/format-usd";
import { resolveMarkPriceBnb } from "@/lib/mark-price";
import { fetchTokenDetailBundle } from "@/lib/token-server";
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

/**
 * SSR seed for token shell + sidebar board.
 * Layout stays client (no remount on pair switch); live WS/poll continue after seed.
 */
export default async function TokenDetailPage({ params }: PageProps) {
  await connection();

  const { address } = await params;
  const normalized = normalizeAddressParam(address);
  if (!normalized) return null;

  const [initialBundle, boardSeed] = await Promise.all([
    fetchTokenDetailBundle(normalized).catch(() => null),
    fetchArenaHomePayload({
      filter: "new",
      sortKey: "age",
      sortDir: "desc",
      limit: 50,
    }).catch(() => null),
  ]);

  return (
    <TokenDetailSsrSeed
      address={normalized}
      initialBundle={initialBundle}
      boardSeed={boardSeed}
    />
  );
}
