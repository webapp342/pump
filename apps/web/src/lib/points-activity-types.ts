export type PointsLedgerEntry = {
  id: number;
  pointsDelta: number;
  taskType: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type PointsInventoryItem = {
  id: number;
  itemId: string;
  status: string;
  createdAt: string;
};
