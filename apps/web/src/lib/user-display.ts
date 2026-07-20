import { addressCacheKey } from "@/lib/address";
import { getUsernamesMap } from "@/lib/db/users";
import type { TokenListItem, TradeItem, TokenHolderSnapshot } from "@/lib/db/launchpad";
import { resolveDisplayUsername } from "@/lib/username";

function usernameMapKey(address: string): string {
  return addressCacheKey(address) ?? address.trim();
}

export function displayUsernameFor(
  address: string,
  usernameMap: Map<string, string | null>,
  compact = false
): string {
  return resolveDisplayUsername(
    address,
    usernameMap.get(usernameMapKey(address)) ?? null,
    compact
  );
}

export async function attachCreatorDisplayNames(
  tokens: TokenListItem[]
): Promise<TokenListItem[]> {
  if (tokens.length === 0) return tokens;
  const map = await getUsernamesMap(tokens.map((token) => token.creatorAddress));
  return tokens.map((token) => {
    const username = map.get(usernameMapKey(token.creatorAddress)) ?? null;
    return {
      ...token,
      creatorUsername: username,
      creatorDisplayUsername: resolveDisplayUsername(token.creatorAddress, username, true),
    };
  });
}

export async function attachTraderDisplayNames(trades: TradeItem[]): Promise<TradeItem[]> {
  if (trades.length === 0) return trades;
  const map = await getUsernamesMap(trades.map((trade) => trade.traderAddress));
  return trades.map((trade) => {
    const username = map.get(usernameMapKey(trade.traderAddress)) ?? null;
    return {
      ...trade,
      traderUsername: username,
      traderDisplayUsername: resolveDisplayUsername(trade.traderAddress, username, true),
    };
  });
}

export async function attachHolderDisplayNames(
  holders: TokenHolderSnapshot[]
): Promise<TokenHolderSnapshot[]> {
  if (holders.length === 0) return holders;
  const map = await getUsernamesMap(holders.map((holder) => holder.address));
  return holders.map((holder) => ({
    ...holder,
    displayUsername: displayUsernameFor(holder.address, map, true),
  }));
}

export async function attachAddressDisplayNames<T extends { address: string }>(
  entries: T[],
  compact = false
): Promise<Array<T & { displayUsername: string }>> {
  if (entries.length === 0) return [];
  const map = await getUsernamesMap(entries.map((entry) => entry.address));
  return entries.map((entry) => ({
    ...entry,
    displayUsername: displayUsernameFor(entry.address, map, compact),
  }));
}

export async function buildDisplayUsernameRecord(
  addresses: string[],
  compact = false
): Promise<Record<string, string>> {
  const map = await getUsernamesMap(addresses);
  const record: Record<string, string> = {};
  for (const address of addresses) {
    const key = usernameMapKey(address);
    record[key] = displayUsernameFor(address, map, compact);
  }
  return record;
}
