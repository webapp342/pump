"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { formatArenaQuoteUsd } from "@/lib/arena-board-format";
import { bnbToUsd } from "@/lib/format-usd";

type TokenFavoritesStripProps = {
  activeTokenAddress: string;
};

export function TokenFavoritesStrip({ activeTokenAddress }: TokenFavoritesStripProps) {
  const { isConnected } = useAccount();
  const { favoriteTokens } = useFavorites();
  const { bnbUsd } = useBnbUsdPrice();

  if (!isConnected) return null;

  const activeKey = activeTokenAddress.toLowerCase();

  return (
    <section className="token-favorites-strip" aria-label="Favorite tokens">
      <div className="token-favorites-strip__scroll">
        {favoriteTokens.length === 0 ? (
          <p className="token-favorites-strip__empty text-caption text-pump-muted">No favorites yet</p>
        ) : (
          favoriteTokens.map((token) => {
            const addressKey = token.address.toLowerCase();
            const mcapUsd = bnbToUsd(Number(token.marketCapBnb), bnbUsd);
            const isActive = addressKey === activeKey;

            return (
              <Link
                key={addressKey}
                href={`/token/${token.address}`}
                className={
                  isActive
                    ? "token-favorites-strip__chip token-favorites-strip__chip--active"
                    : "token-favorites-strip__chip"
                }
                aria-current={isActive ? "page" : undefined}
              >
                <TokenAvatar
                  address={token.address}
                  symbol={token.symbol}
                  logoUrl={token.logoUrl}
                  size={18}
                  shape="rounded"
                  className="token-favorites-strip__logo shrink-0 !ring-0"
                />
                <span className="token-favorites-strip__symbol financial-value">{token.symbol}</span>
                <span className="token-favorites-strip__mcap financial-value text-pump-muted">
                  {formatArenaQuoteUsd(mcapUsd)}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
