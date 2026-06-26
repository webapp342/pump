import type { TokenListItem } from "@/lib/db/launchpad";

/** Prefer `fresher` row when the same token appears in both lists (e.g. main board over top strip). */
export function mergeBoardTokenLists(
  base: TokenListItem[],
  fresher: TokenListItem[]
): TokenListItem[] {
  const freshBy = new Map(fresher.map((t) => [t.address.toLowerCase(), t]));
  const seen = new Set<string>();
  const merged: TokenListItem[] = [];

  for (const token of base) {
    const key = token.address.toLowerCase();
    merged.push(freshBy.get(key) ?? token);
    seen.add(key);
  }

  for (const token of fresher) {
    const key = token.address.toLowerCase();
    if (!seen.has(key)) merged.push(token);
  }

  return merged;
}

export function findBoardToken(
  address: string,
  ...lists: TokenListItem[][]
): TokenListItem | undefined {
  const key = address.toLowerCase();
  for (const list of lists) {
    const hit = list.find((t) => t.address.toLowerCase() === key);
    if (hit) return hit;
  }
  return undefined;
}

export function sortTokensByMcap(tokens: TokenListItem[]): TokenListItem[] {
  return [...tokens].sort(
    (a, b) => Number(b.marketCapBnb ?? 0) - Number(a.marketCapBnb ?? 0)
  );
}
