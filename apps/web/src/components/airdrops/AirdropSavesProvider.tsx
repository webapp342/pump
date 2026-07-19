"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { subscribeUserBootstrap } from "@/lib/user-bootstrap";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";

type AirdropSavesContextValue = {
  saves: Set<string>;
  isSaved: (airdropId: string) => boolean;
  toggleSave: (airdropId: string) => void;
  loading: boolean;
};

const AirdropSavesContext = createContext<AirdropSavesContextValue | null>(null);

export function AirdropSavesProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useActiveWalletAddress();
  const { openConnectModal } = useOpenConnectModal();
  const [saves, setSaves] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!address) {
      setSaves(new Set());
      return;
    }

    let cancelled = false;
    let bootstrapped = false;
    setLoading(true);

    const unsub = subscribeUserBootstrap(address, (data) => {
      if (cancelled) return;
      bootstrapped = true;
      setSaves(new Set(data.airdropSaves));
      setLoading(false);
    });

    const fallback = window.setTimeout(() => {
      if (cancelled || bootstrapped) return;
      void (async () => {
        try {
          const response = await fetch(
            `/api/airdrops/saves?address=${encodeURIComponent(address)}`,
            { cache: "no-store" }
          );
          const body = (await response.json()) as { data?: string[]; error?: string };
          if (!cancelled && response.ok && Array.isArray(body.data)) {
            setSaves(new Set(body.data));
          }
        } catch {
          // ignore fetch errors
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 2_000);

    return () => {
      cancelled = true;
      unsub();
      window.clearTimeout(fallback);
    };
  }, [address]);

  const isSaved = useCallback(
    (airdropId: string) => saves.has(airdropId),
    [saves]
  );

  const toggleSave = useCallback(
    (airdropId: string) => {
      if (!isConnected || !address) {
        openConnectModal?.();
        return;
      }

      if (pendingRef.current.has(airdropId)) return;

      const wasSaved = saves.has(airdropId);
      pendingRef.current.add(airdropId);

      setSaves((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(airdropId);
        else next.add(airdropId);
        return next;
      });

      void (async () => {
        try {
          const response = await fetch("/api/airdrops/saves/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, airdropId }),
          });
          const body = (await response.json()) as { data?: { saved?: boolean }; error?: string };
          if (!response.ok) {
            throw new Error(body.error ?? "Failed to update save");
          }

          const saved = Boolean(body.data?.saved);
          setSaves((prev) => {
            const next = new Set(prev);
            if (saved) next.add(airdropId);
            else next.delete(airdropId);
            return next;
          });
        } catch {
          setSaves((prev) => {
            const next = new Set(prev);
            if (wasSaved) next.add(airdropId);
            else next.delete(airdropId);
            return next;
          });
        } finally {
          pendingRef.current.delete(airdropId);
        }
      })();
    },
    [address, isConnected, saves, openConnectModal]
  );

  const value = useMemo(
    () => ({ saves, isSaved, toggleSave, loading }),
    [saves, isSaved, toggleSave, loading]
  );

  return (
    <AirdropSavesContext.Provider value={value}>{children}</AirdropSavesContext.Provider>
  );
}

export function useAirdropSaves() {
  const context = useContext(AirdropSavesContext);
  if (!context) {
    throw new Error("useAirdropSaves must be used within AirdropSavesProvider");
  }
  return context;
}
