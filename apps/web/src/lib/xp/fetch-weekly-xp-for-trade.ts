import { USER_XP_IX_MAX } from "@pump/solana-sdk";

/** Fresh weekly XP for pre-trade IX (Redis via API — never cached). */
export async function fetchWeeklyXpForTrade(
  walletAddress: string
): Promise<number> {
  const address = walletAddress.trim();
  if (!address) return 0;
  try {
    const response = await fetch(
      `/api/xp/weekly?address=${encodeURIComponent(address)}`,
      { cache: "no-store" }
    );
    const body = (await response.json()) as {
      data?: { weeklyXp?: number };
    };
    if (!response.ok || body.data?.weeklyXp == null) return 0;
    const xp = Math.floor(body.data.weeklyXp);
    if (!Number.isFinite(xp) || xp <= 0) return 0;
    return Math.min(xp, USER_XP_IX_MAX);
  } catch {
    return 0;
  }
}
