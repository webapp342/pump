/** Client-safe announcement types/constants — no Node/pg imports. */

/** Soft anti-spam while still allowing announcement history. */
export const ANNOUNCE_COOLDOWN_MS = 5 * 60 * 1000;
/** Minimum token balance (human units) required to create a callout. */
export const ANNOUNCE_MIN_TOKEN_BALANCE = 1;
export const ANNOUNCE_HOLDINGS_ERROR =
  "Hold at least 1 of this token to announce";

export type TokenAnnouncementRow = {
  id: string;
  tokenAddress: string;
  announcerAddress: string;
  announcerDisplayUsername: string;
  marketCapZugAtAnnounce: string;
  launchMcapZug: string;
  multiplierX: number;
  /** Human-unit balance at announce time (null = legacy row). */
  tokenBalanceAtAnnounce: number | null;
  /** USD value of that balance at announce time (null if FX missing / legacy). */
  tokenBalanceUsdAtAnnounce: number | null;
  /** Paid sponsor path — no holdings snapshot shown. */
  isSponsored?: boolean;
  sponsorAddress?: string | null;
  createdAt: string;
};

export type PortfolioAnnouncementRow = TokenAnnouncementRow & {
  tokenSymbol: string;
  tokenName: string;
  tokenLogoUrl: string | null;
};

/** Compact human balance for callout snapshots (1.2K / 3.4M). */
export function formatAnnounceBalance(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "—";
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
  if (amount >= 100) return amount.toFixed(0);
  if (amount >= 1) return amount.toFixed(2);
  return amount.toFixed(4);
}
