/** Catalog effect constants — durations / multipliers for activatable perks. */

export const LAUNCH_SPOTLIGHT_ITEM_ID = "launch_boost" as const;
export const AIRDROP_WEIGHT_ITEM_ID = "airdrop_weight" as const;
export const PROFILE_FRAME_ITEM_ID = "status_badge" as const;

/** Pin duration after Launch spotlight is used on a token. */
export const LAUNCH_SPOTLIGHT_DURATION_MS = 24 * 60 * 60 * 1000;

/** Score multiplier when Airdrop multiplier is applied to a campaign. */
export const AIRDROP_WEIGHT_MULTIPLIER = 1.5;

export type ActiveLaunchPin = {
  tokenAddress: string;
  pinnerAddress: string;
  expiresAt: string;
  inventoryId: number;
};
