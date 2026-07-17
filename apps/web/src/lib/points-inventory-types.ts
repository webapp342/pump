export type PointsInventoryItem = {
  id: number;
  itemId: string;
  status: string;
  createdAt: string;
};

export type ActivatePerkResult =
  | {
      ok: true;
      inventoryId: number;
      itemId: string;
      expiresAt: string | null;
      tokenAddress?: string;
      airdropId?: string;
    }
  | {
      ok: false;
      error: string;
      code:
        | "NO_INVENTORY"
        | "ALREADY_PINNED"
        | "ALREADY_APPLIED"
        | "NOT_CREATOR"
        | "INVALID"
        | "UNAVAILABLE";
    };
