/** Client-safe announcement types/constants — no Node/pg imports. */

/** Soft anti-spam while still allowing announcement history. */
export const ANNOUNCE_COOLDOWN_MS = 5 * 60 * 1000;
/** Max length for callout description (UI + API). */
export const ANNOUNCE_MESSAGE_MAX_LEN = 280;

export type TokenAnnouncementRow = {
  id: string;
  tokenAddress: string;
  announcerAddress: string;
  announcerDisplayUsername: string;
  marketCapZugAtAnnounce: string;
  launchMcapZug: string;
  /** Snapshot at announce: mcap / launch (KOL stats). UI live X uses current/call mcap. */
  multiplierX: number;
  /** Optional user note. */
  message: string | null;
  /** Paid sponsor path. */
  isSponsored?: boolean;
  sponsorAddress?: string | null;
  createdAt: string;
};

export type PortfolioAnnouncementRow = TokenAnnouncementRow & {
  tokenSymbol: string;
  tokenName: string;
  tokenLogoUrl: string | null;
};

export function sanitizeAnnounceMessage(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, ANNOUNCE_MESSAGE_MAX_LEN);
}

/** Live performance vs call mcap — pure client math, no extra DB. */
export function liveCalloutMultiplierX(
  currentMarketCapZug: number | null | undefined,
  marketCapZugAtAnnounce: string | number | null | undefined
): number | null {
  const current = Number(currentMarketCapZug);
  const atCall = Number(marketCapZugAtAnnounce);
  if (!Number.isFinite(current) || current <= 0) return null;
  if (!Number.isFinite(atCall) || atCall <= 0) return null;
  const x = current / atCall;
  return Number.isFinite(x) && x > 0 ? x : null;
}
