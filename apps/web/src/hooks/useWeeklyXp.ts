"use client";

import { useCallback, useEffect, useState } from "react";

export type WeeklyXpSnapshot = {
  weeklyXp: number;
  cashbackEligible: boolean;
  threshold: number;
};

export function useWeeklyXp(walletAddress: string | null | undefined, refreshKey = 0) {
  const [data, setData] = useState<WeeklyXpSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    const address = walletAddress?.trim();
    if (!address) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/xp/weekly?address=${encodeURIComponent(address)}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as {
        data?: WeeklyXpSnapshot & { address: string };
      };
      if (!response.ok || !body.data) {
        setData(null);
        return;
      }
      setData({
        weeklyXp: body.data.weeklyXp,
        cashbackEligible: body.data.cashbackEligible,
        threshold: body.data.threshold,
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

  return { data, loading, refetch };
}
