import { AirdropPromoIcon } from "@/components/ui/AirdropGiftIcon";

type ArenaSymbolWithAirdropGiftProps = {
  symbol: string;
  tokenAddress: string;
  openAirdropTokens: Set<string>;
  className?: string;
  symbolClassName?: string;
};

export function ArenaSymbolWithAirdropGift({
  symbol,
  tokenAddress,
  openAirdropTokens,
  className = "",
  symbolClassName = "",
}: ArenaSymbolWithAirdropGiftProps) {
  const hasOpenAirdrop = openAirdropTokens.has(tokenAddress.toLowerCase());

  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 ${className}`}>
      <span className={`truncate ${symbolClassName}`}>{symbol}</span>
      {hasOpenAirdrop ? <AirdropPromoIcon /> : null}
    </span>
  );
}
