"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useScwBalance } from "@/hooks/useScwBalance";
import { fetchWithdrawAssets, type WithdrawAsset } from "@/lib/withdraw-assets";

export function useWithdrawAssets(address?: Address, enabled = true) {
  const { data: nativeBalance, refetch: refetchNative } = useScwBalance(address);
  const [assets, setAssets] = useState<WithdrawAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!address || !enabled) {
      setAssets([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data: freshNative } = await refetchNative();
      const balanceWei = freshNative?.value ?? nativeBalance?.value ?? 0n;
      const next = await fetchWithdrawAssets(address, balanceWei);
      setAssets(next);
    } catch (err) {
      setAssets([]);
      setError(err instanceof Error ? err.message : "Could not load wallet assets.");
    } finally {
      setLoading(false);
    }
  }, [address, enabled, nativeBalance?.value, refetchNative]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { assets, loading, error, reload };
}
