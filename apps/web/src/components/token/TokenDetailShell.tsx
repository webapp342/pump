"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { TokenDetail, TradeItem } from "@/lib/db/launchpad";
import type { TokenDetailBundle, InitialChartCandles } from "@/lib/token-server";
import { AppShell } from "@/components/layout/AppShell";
import { PageBackLink } from "@/components/ui/PageBackLink";
import { TokenDetailLive } from "@/components/token/TokenDetailLive";
import { TokenDetailBackLink } from "@/components/token/TokenDetailBackLink";
import { TokenDetailBodySkeleton } from "@/components/token/TokenDetailBodySkeleton";
import {
  buildOptimisticTokenDetail,
  getPendingCreateForToken,
} from "@/lib/optimistic-activity";

const POLL_MS = 2_000;
const POLL_MAX_MS = 90_000;

type TokenDetailShellProps = {
  address: string;
  initialBundle?: TokenDetailBundle | null;
};

function TokenDetailView({
  token,
  trades,
  initialHolders,
  initialCandles,
  indexerSyncing,
}: {
  token: TokenDetail;
  trades: TradeItem[];
  initialHolders?: TokenDetailBundle["holders"];
  initialCandles?: InitialChartCandles;
  indexerSyncing: boolean;
}) {
  return (
    <>
      <Suspense fallback={<PageBackLink href="/" />}>
        <TokenDetailBackLink />
      </Suspense>

      {indexerSyncing ? (
        <p className="notice-warning mt-4 text-xs">
          On-chain confirmed — indexer syncing token to Arena. Stats update automatically.
        </p>
      ) : null}

      <Suspense fallback={<TokenDetailBodySkeleton />}>
        <TokenDetailLive
          tokenAddress={token.address}
          symbol={token.symbol}
          status={token.status}
          initialToken={token}
          initialTrades={trades}
          initialHolders={initialHolders}
          initialCandles={initialCandles}
        />
      </Suspense>
    </>
  );
}

export function TokenDetailShell({
  address,
  initialBundle = null,
}: TokenDetailShellProps) {
  const normalized = address.toLowerCase();
  const [data, setData] = useState<{
    token: TokenDetail;
    trades: TradeItem[];
    holders: TokenDetailBundle["holders"];
    initialCandles?: InitialChartCandles;
  } | null>(
    initialBundle
      ? {
          token: initialBundle.token,
          trades: initialBundle.trades,
          holders: initialBundle.holders,
          initialCandles: initialBundle.initialCandles,
        }
      : null
  );
  const [optimisticToken, setOptimisticToken] = useState<TokenDetail | null>(() => {
    const pending = getPendingCreateForToken(normalized);
    return pending ? buildOptimisticTokenDetail(normalized, pending) : null;
  });
  const [indexerSyncing, setIndexerSyncing] = useState(() =>
    Boolean(getPendingCreateForToken(normalized))
  );
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(!initialBundle);
  const initialBundleRef = useRef(initialBundle);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`/api/tokens/${normalized}`, { cache: "no-store" });
      const body = (await response.json()) as {
        data?: TokenDetailBundle;
        error?: string;
      };

      if (!response.ok || !body.data) {
        return false;
      }

      setData({
        token: body.data.token,
        trades: body.data.trades,
        holders: body.data.holders ?? [],
        initialCandles: body.data.initialCandles,
      });
      setOptimisticToken(null);
      setIndexerSyncing(false);
      setFatalError(null);
      return true;
    } catch {
      return false;
    }
  }, [normalized]);

  const pollUntilRef = useRef(0);

  useEffect(() => {
    if (initialBundleRef.current) {
      initialBundleRef.current = null;
      pollUntilRef.current = Date.now() + POLL_MAX_MS;
      void load();
      return;
    }

    setData(null);
    setFatalError(null);
    setInitialLoading(true);

    const pending = getPendingCreateForToken(normalized);
    if (pending) {
      setOptimisticToken(buildOptimisticTokenDetail(normalized, pending));
      setIndexerSyncing(true);
    } else {
      setOptimisticToken(null);
      setIndexerSyncing(false);
    }

    pollUntilRef.current = Date.now() + POLL_MAX_MS;

    void (async () => {
      const found = await load();
      setInitialLoading(false);
      if (found) return;

      if (!pending) {
        setFatalError("Token not found");
      }
    })();
  }, [load, normalized]);

  useEffect(() => {
    if (data || fatalError) return;

    const timer = setInterval(async () => {
      if (Date.now() > pollUntilRef.current) {
        if (!optimisticToken) {
          setFatalError(
            "Token not found — indexer may still be catching up. Try refresh in a minute."
          );
        }
        clearInterval(timer);
        return;
      }

      const found = await load();
      if (found) clearInterval(timer);
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [data, fatalError, load, optimisticToken]);

  if (initialLoading && !optimisticToken) {
    return (
      <AppShell wide>
        <PageBackLink href="/" />
        <TokenDetailBodySkeleton />
      </AppShell>
    );
  }

  if (fatalError && !data && !optimisticToken) {
    return (
      <AppShell wide>
        <PageBackLink href="/" />
        <div className="notice-error mt-6 p-4">
          {fatalError}
        </div>
        <button
          type="button"
          onClick={() => {
            setFatalError(null);
            setInitialLoading(true);
            pollUntilRef.current = Date.now() + POLL_MAX_MS;
            void load().finally(() => setInitialLoading(false));
          }}
          className="secondary-button mt-4 w-full max-w-md"
        >
          Retry
        </button>
      </AppShell>
    );
  }

  const token = data?.token ?? optimisticToken;
  if (!token) {
    return (
      <AppShell wide>
        <TokenDetailBodySkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <TokenDetailView
        token={token}
        trades={data?.trades ?? []}
        initialHolders={data?.holders}
        initialCandles={data?.initialCandles}
        indexerSyncing={indexerSyncing && !data}
      />
    </AppShell>
  );
}
