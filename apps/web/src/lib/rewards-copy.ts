/**
 * User-facing copy for the loyalty hub (`/missions` route — internal path only).
 * Naming follows common fintech patterns: Rewards hub + Challenges + Ranks + Perks
 * (cf. Nubank Vantagens / Nu Perks, Enable3 missions→challenges, Loyalty Trends 2026).
 */

export const REWARDS_HUB = {
  navLabel: "Rewards",
  statusBrand: "XP",
  statusAria: "Rewards balance",
  hubTabsAria: "Rewards sections",
  unit: "XP",
  unitShort: "XP",
} as const;

export const REWARDS_TABS = {
  earn: "Challenges",
  market: "Perks",
  leaderboard: "Leaderboard",
} as const;

export const REWARDS_LEADERBOARD = {
  heading: "Leaderboard",
  seasonLabel: "Season 1",
  poolLabel: "Reward pool",
  poolHint:
    "Top 100 traders share 25% of protocol fees each season. Rankings are weighted by XP.",
  topShareLabel: "#1 share",
  seatsLabel: "Seats",
  yourRank: (rank: number) => `Your rank #${rank}`,
  yourReward: "Your reward",
  unranked: "Unranked — earn XP to enter the top 100.",
  empty: "No ranked traders yet. Earn XP to appear here.",
  loading: "Loading…",
  loadError: "Couldn’t load leaderboard",
  colRank: "#",
  colTrader: "Trader",
  colXp: "XP",
  colShare: "Share",
  you: "You",
} as const;

/** F1 — Redis weekly XP (not PG lifetime). */
export const REWARDS_WEEKLY_XP = {
  heading: "Weekly leaderboard",
  seasonLabel: (id: number) => `Season ${id}`,
  hint: "Rankings reset each season. Weekly XP comes from trades and completed challenges.",
  badgeLabel: "Weekly XP",
  badgeTitle: "View weekly XP leaderboard",
  cashbackOn: "Cashback",
  yourRank: (rank: number) => `Your rank #${rank}`,
  unranked: "Unranked — trade or complete challenges to earn weekly XP.",
  empty: "No weekly XP yet. Trade or complete challenges to appear here.",
  loading: "Loading…",
  loadError: "Couldn't load weekly leaderboard",
  colRank: "#",
  colTrader: "Trader",
  colXp: "Weekly XP",
  you: "You",
  clansHeading: "Top clans",
  clanFallback: "Clan",
  claimsPending: (seasonId: number) =>
    `Season ${seasonId} rewards are being settled on-chain. Claim opens soon.`,
  claimsOpen: (seasonId: number) =>
    `Season ${seasonId} pool rewards are ready to claim.`,
  claimsClosed: "Season rewards claim is not open yet.",
  claimSeasonCta: "Claim season rewards",
  claimSeasonLoading: "Claiming…",
  claimSeasonSuccess: "Season rewards claimed.",
  claimSeasonNone: "No season rewards for this wallet.",
} as const;

export const REWARDS_MARKET = {
  shop: "Catalog",
  inventory: "Owned",
  sectionsAria: "Perks sections",
  shopAria: "Perks catalog",
  ownedAria: "Owned perks",
  ownedEmpty: "Nothing redeemed yet. Browse the catalog to spend XP.",
  ownedGuest: "Sign in to see owned perks.",
  ownedLoading: "Loading…",
} as const;

export const REWARDS_CHALLENGES = {
  filtersAria: "Challenge filters",
  open: "Active",
  done: "Done",
  columnTitle: "Challenge",
  columnProgress: "Progress",
  columnReward: "Reward",
  columnStatus: "Status",
  refreshAria: "Refresh challenges",
  refreshLabel: "Refresh",
  refreshingLabel: "Refreshing",
  emptyOpen: "All caught up.",
  emptyDone: "Nothing completed yet.",
  loadError: "Couldn’t load challenges",
} as const;

export const REWARDS_REFERRAL_INVITE = {
  actionInvite: "Invite",
  modalTitle: "Invite friends",
  modalSubtitle: "Share your link — they must open it before their first trade.",
  xpNote: "50 XP once per invite when they start trading.",
  earningsNote: "Referral fee earnings continue on every trade they make.",
  challengeTooltip:
    "50 XP once per friend when their first trade binds your link — claim when ready. Referral fee earnings continue on every trade they make. Friends must open your invite link before their first trade.",
} as const;

export const REWARDS_RANKS = {
  heading: "Ranks",
  tipLabel: "About ranks",
  description: "Earn XP to unlock higher ranks and catalog perks.",
  thresholdLabel: "XP required",
} as const;

export const REWARDS_GUEST = {
  title: "Sign in to unlock Rewards",
  description:
    "Complete challenges for XP, climb ranks, and redeem catalog perks — all in one place.",
  cta: "Sign in",
} as const;

export const REWARDS_STATUS = {
  availableLabel: "Available XP",
  rankLabel: "Rank",
  toNext: (pts: number, tierName: string) =>
    `${pts.toLocaleString()} XP to ${tierName}`,
  maxTier: "Top rank reached",
} as const;

export function formatXp(amount: number): string {
  return `${amount.toLocaleString()} ${REWARDS_HUB.unit}`;
}

export function formatXpDelta(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${amount.toLocaleString()} ${REWARDS_HUB.unit}`;
}
