const BPS = 10_000n;
const RANK1_BPS = 1500n;
const RANK2_BPS = 1000n;
const RANK3_BPS = 500n;
const RANK4_100_BPS = 7000n;
const RANK4_100_COUNT = 97n;

/** Must match PumpAirdropManager.sol and indexer airdrop-distribution. */
export function rewardAmountForRank(totalReward: bigint, rank: number): bigint {
  if (rank < 1 || rank > 100 || totalReward <= 0n) return 0n;
  if (rank === 1) return (totalReward * RANK1_BPS) / BPS;
  if (rank === 2) return (totalReward * RANK2_BPS) / BPS;
  if (rank === 3) return (totalReward * RANK3_BPS) / BPS;
  return (totalReward * RANK4_100_BPS) / BPS / RANK4_100_COUNT;
}

export type AirdropDistributionTier = {
  rankLabel: string;
  poolSharePct: number;
  amount: bigint;
  /** True when every rank in the band receives the same amount. */
  perWinner: boolean;
  winnerCount: number;
};

export function getAirdropDistributionTiers(totalReward: bigint): AirdropDistributionTier[] {
  if (totalReward <= 0n) {
    return [
      { rankLabel: "#1", poolSharePct: 15, amount: 0n, perWinner: false, winnerCount: 1 },
      { rankLabel: "#2", poolSharePct: 10, amount: 0n, perWinner: false, winnerCount: 1 },
      { rankLabel: "#3", poolSharePct: 5, amount: 0n, perWinner: false, winnerCount: 1 },
      {
        rankLabel: "#4–#100",
        poolSharePct: 70,
        amount: 0n,
        perWinner: true,
        winnerCount: 97,
      },
    ];
  }

  const rank4Amount = rewardAmountForRank(totalReward, 4);

  return [
    {
      rankLabel: "#1",
      poolSharePct: 15,
      amount: rewardAmountForRank(totalReward, 1),
      perWinner: false,
      winnerCount: 1,
    },
    {
      rankLabel: "#2",
      poolSharePct: 10,
      amount: rewardAmountForRank(totalReward, 2),
      perWinner: false,
      winnerCount: 1,
    },
    {
      rankLabel: "#3",
      poolSharePct: 5,
      amount: rewardAmountForRank(totalReward, 3),
      perWinner: false,
      winnerCount: 1,
    },
    {
      rankLabel: "#4–#100",
      poolSharePct: 70,
      amount: rank4Amount,
      perWinner: true,
      winnerCount: Number(RANK4_100_COUNT),
    },
  ];
}

export function perWinnerSharePct(): number {
  return 70 / Number(RANK4_100_COUNT);
}

/** Display string for rank #4–#100 share (70% ÷ 97 ≈ 0.72%). */
export function formatPerWinnerSharePct(): string {
  return perWinnerSharePct().toFixed(2);
}
