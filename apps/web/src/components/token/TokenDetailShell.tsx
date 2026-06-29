"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import type { TokenDetailBundle, InitialChartCandles } from "@/lib/token-server";
import { AppShell } from "@/components/layout/AppShell";
import { TokenDetailLive } from "@/components/token/TokenDetailLive";
import { TokenDetailBodySkeleton } from "@/components/token/TokenDetailBodySkeleton";
import {
  buildOptimisticTokenDetail,
  getPendingCreateForToken,
} from "@/lib/optimistic-activity";
import {
  fetchTokenDetailBundleClient,
  peekTokenDetailBundle,
  seedTokenDetailBundle,
} from "@/lib/token-detail-client";

const POLL_MS = 2_000;
const POLL_MAX_MS = 90_000;

type TokenDetailShellProps = {
  address: string;
  initialBundle?: TokenDetailBundle | null;
};

type ResolvedBundle = {
  token: TokenDetail;
  trades: TradeItem[];
  holders: TokenDetailBundle["holders"];
  initialCandles?: InitialChartCandles;
};

function bundleFromPayload(payload: TokenDetailBundle): ResolvedBundle {
  return {
    token: payload.token,
    trades: payload.trades,
    holders: payload.holders ?? [],
    initialCandles: payload.initialCandles,
  };
}

export function TokenDetailShell({
  address,
  initialBundle = null,
}: TokenDetailShellProps) {
  const normalized = address.toLowerCase();

  useEffect(() => {
    if (initialBundle) seedTokenDetailBundle(normalized, initialBundle);
  }, [initialBundle, normalized]);

  const initialCached = initialBundle ?? peekTokenDetailBundle(normalized) ?? null;

  const [resolved, setResolved] = useState<ResolvedBundle | null>(
    initialCached ? bundleFromPayload(initialCached) : null
  );
  const [optimisticToken, setOptimisticToken] = useState<TokenDetail | null>(() => {
    const pending = getPendingCreateForToken(normalized);
    return pending ? buildOptimisticTokenDetail(normalized, pending) : null;
  });
  const [indexerSyncing, setIndexerSyncing] = useState(() =>
    Boolean(getPendingCreateForToken(normalized))
  );
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const layoutMountedRef = useRef(Boolean(initialCached || optimisticToken));
  const pollUntilRef = useRef(0);
  const loadGenerationRef = useRef(0);

  const contentSynced =
    resolved != null && resolved.token.address.toLowerCase() === normalized;

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const generation = ++loadGenerationRef.current;
      const hadLayout = layoutMountedRef.current;

      if (!options.silent && hadLayout) {
        setRefreshing(true);
      }

      try {
        const payload = await fetchTokenDetailBundleClient(normalized);
        if (generation !== loadGenerationRef.current) return false;

        if (!payload) return false;

        setResolved(bundleFromPayload(payload));
        setOptimisticToken(null);
        setIndexerSyncing(false);
        setFatalError(null);
        layoutMountedRef.current = true;
        return true;
      } catch {
        return false;
      } finally {
        if (generation === loadGenerationRef.current) {
          setRefreshing(false);
        }
      }
    },
    [normalized]
  );

  useLayoutEffect(() => {
    const cached = peekTokenDetailBundle(normalized);
    if (!cached) return;
    setResolved(bundleFromPayload(cached));
    layoutMountedRef.current = true;
    setFatalError(null);
  }, [normalized]);

  useEffect(() => {
    const cached = peekTokenDetailBundle(normalized);
    const pending = getPendingCreateForToken(normalized);

    if (cached) {
      setResolved(bundleFromPayload(cached));
      layoutMountedRef.current = true;
      setFatalError(null);
      pollUntilRef.current = Date.now() + POLL_MAX_MS;
      void load({ silent: true });
      return;
    }

    if (pending) {
      setOptimisticToken(buildOptimisticTokenDetail(normalized, pending));
      setIndexerSyncing(true);
    } else {
      setOptimisticToken(null);
      setIndexerSyncing(false);
    }

    pollUntilRef.current = Date.now() + POLL_MAX_MS;

    if (!layoutMountedRef.current && !pending) {
      setResolved(null);
      setFatalError(null);
    }

    void (async () => {
      const found = await load({ silent: layoutMountedRef.current });
      if (found) return;
      if (!pending && !layoutMountedRef.current) {
        setFatalError("Token not found");
      }
    })();
  }, [load, normalized]);

  useEffect(() => {
    if (contentSynced || fatalError) return;

    const timer = setInterval(async () => {
      if (Date.now() > pollUntilRef.current) {
        if (!optimisticToken && !layoutMountedRef.current) {
          setFatalError(
            "Token not found — indexer may still be catching up. Try refresh in a minute."
          );
        }
        clearInterval(timer);
        return;
      }

      const found = await load({ silent: true });
      if (found) clearInterval(timer);
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [contentSynced, fatalError, load, optimisticToken]);

  const showFullSkeleton = !layoutMountedRef.current && !resolved && !optimisticToken;

  if (showFullSkeleton) {
    return (
      <AppShell wide>
        <TokenDetailBodySkeleton />
      </AppShell>
    );
  }

  if (fatalError && !resolved && !optimisticToken) {
    return (
      <AppShell wide>
        <div className="notice-error mt-6 p-4">{fatalError}</div>
        <button
          type="button"
          onClick={() => {
            setFatalError(null);
            void load({ silent: false });
          }}
          className="secondary-button mt-4 w-full max-w-md"
        >
          Retry
        </button>
      </AppShell>
    );
  }

  const display = resolved ?? (optimisticToken ? { token: optimisticToken, trades: [], holders: [] } : null);
  if (!display) {
    return (
      <AppShell wide>
        <TokenDetailBodySkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      {indexerSyncing && !contentSynced ? (
        <p className="notice-warning mt-4 text-xs">
          On-chain confirmed — indexer syncing token to Arena. Stats update automatically.
        </p>
      ) : null}

      <TokenDetailLive
        tokenAddress={normalized}
        symbol={display.token.symbol}
        status={display.token.status}
        initialToken={display.token}
        initialTrades={display.trades}
        initialHolders={display.holders}
        initialCandles={display.initialCandles}
        contentSynced={contentSynced}
        isRefreshing={refreshing || !contentSynced}
      />
    </AppShell>
  );
}
