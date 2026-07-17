"use client";

import { useEffect, useMemo, useState } from "react";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { useNativeUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd } from "@/lib/format-usd";
import { REWARDS_LEADERBOARD } from "@/lib/rewards-copy";

type LeaderboardRow = {
  rank: number;
  address: string;
  username: string | null;
  lifetimePoints: number;
  shareWeight: number;
  shareNative: number;
};

type LeaderboardData = {
  rewardPoolNative: number;
  poolSharePercent: number;
  topShareNative: number;
  leaderboardSize: number;
  seatCount: number;
  entries: LeaderboardRow[];
};

/** Match admin treasury USD style: $6.11 not compact $6.1 / subscript. */
function formatShareUsd(
  nativeAmount: number | null | undefined,
  nativeUsd: number | null
): string {
  const usd = bnbToUsd(nativeAmount ?? 0, nativeUsd);
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 10_000) return `$${(usd / 1_000).toFixed(1)}K`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

type PointsLeaderboardPanelProps = {
  address?: string;
  refreshKey?: number;
};

export function PointsLeaderboardPanel({
  address = "",
  refreshKey = 0,
}: PointsLeaderboardPanelProps) {
  const { nativeUsd } = useNativeUsdPrice();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/missions/leaderboard");
        const body = (await response.json()) as { data?: LeaderboardData; error?: string };
        if (!response.ok) throw new Error(body.error ?? REWARDS_LEADERBOARD.loadError);
        if (cancelled) return;
        setData(body.data ?? null);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : REWARDS_LEADERBOARD.loadError);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const viewer = address.toLowerCase();
  const priceReady = nativeUsd != null && nativeUsd > 0;

  const viewerRow = useMemo(() => {
    if (!viewer || !data?.entries.length) return null;
    return data.entries.find((row) => row.address.toLowerCase() === viewer) ?? null;
  }, [data, viewer]);

  return (
    <div className="points-hub-panel points-leaderboard">
      <header className="points-leaderboard__head">
        <div className="points-leaderboard__title-row">
          <h2 className="section-heading">{REWARDS_LEADERBOARD.heading}</h2>
          <span className="points-leaderboard__season">{REWARDS_LEADERBOARD.seasonLabel}</span>
        </div>
        <p className="type-legal text-pump-muted">{REWARDS_LEADERBOARD.poolHint}</p>
      </header>

      <div className="points-leaderboard__stats">
        <div className="points-leaderboard__stat points-leaderboard__stat--pool">
          <span className="section-label">{REWARDS_LEADERBOARD.poolLabel}</span>
          <span className="financial-value text-pump-accent">
            {loading || !data || !priceReady
              ? "—"
              : formatShareUsd(data.rewardPoolNative, nativeUsd)}
          </span>
        </div>
        <div className="points-leaderboard__stat points-leaderboard__stat--top">
          <span className="section-label">{REWARDS_LEADERBOARD.topShareLabel}</span>
          <span className="financial-value">
            {loading || !data || !priceReady
              ? "—"
              : formatShareUsd(data.topShareNative, nativeUsd)}
          </span>
        </div>
        <div className="points-leaderboard__stat points-leaderboard__stat--seats">
          <span className="section-label">{REWARDS_LEADERBOARD.seatsLabel}</span>
          <span className="financial-value">
            {loading || !data ? "—" : `${data.seatCount}/${data.leaderboardSize}`}
          </span>
        </div>
      </div>

      {error ? <div className="missions-notice notice-error">{error}</div> : null}

      {loading && !data ? (
        <p className="type-legal text-pump-muted">{REWARDS_LEADERBOARD.loading}</p>
      ) : null}

      {!loading && data && data.entries.length === 0 ? (
        <p className="type-legal text-pump-muted">{REWARDS_LEADERBOARD.empty}</p>
      ) : null}

      {data && data.entries.length > 0 ? (
        <div className="points-leaderboard__table-wrap">
          {viewer ? (
            <div className="points-leaderboard__you-banner">
              {viewerRow ? (
                <p className="points-leaderboard__you-banner-copy">
                  <span className="financial-value">
                    {REWARDS_LEADERBOARD.yourRank(viewerRow.rank)}
                  </span>
                  <span className="text-pump-muted">·</span>
                  <span>{REWARDS_LEADERBOARD.yourReward}</span>
                  <span className="financial-value text-pump-accent">
                    {priceReady ? formatShareUsd(viewerRow.shareNative, nativeUsd) : "—"}
                  </span>
                </p>
              ) : (
                <p className="points-leaderboard__you-banner-copy text-pump-muted">
                  {REWARDS_LEADERBOARD.unranked}
                </p>
              )}
            </div>
          ) : null}

          <div className="points-leaderboard__head-row" aria-hidden>
            <span>{REWARDS_LEADERBOARD.colRank}</span>
            <span>{REWARDS_LEADERBOARD.colTrader}</span>
            <span className="points-leaderboard__num">{REWARDS_LEADERBOARD.colXp}</span>
            <span className="points-leaderboard__num">{REWARDS_LEADERBOARD.colShare}</span>
          </div>
          <ul className="points-leaderboard__list">
            {data.entries.map((row) => {
              const isYou = Boolean(viewer && row.address.toLowerCase() === viewer);
              return (
                <li
                  key={row.address}
                  className={`points-leaderboard__row${isYou ? " points-leaderboard__row--you" : ""}`}
                >
                  <span className="financial-value points-leaderboard__rank">{row.rank}</span>
                  <span className="points-leaderboard__trader">
                    <UserAvatarForAddress
                      address={row.address}
                      size="md"
                      className="points-leaderboard__avatar"
                    />
                    <span className="points-leaderboard__name">
                      <UserDisplayName
                        address={row.address}
                        username={row.username}
                        compact
                      />
                    </span>
                  </span>
                  <span className="financial-value points-leaderboard__num">
                    {row.lifetimePoints.toLocaleString()}
                  </span>
                  <span className="financial-value points-leaderboard__num text-pump-accent">
                    {priceReady ? formatShareUsd(row.shareNative, nativeUsd) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
