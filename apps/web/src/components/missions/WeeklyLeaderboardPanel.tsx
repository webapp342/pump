"use client";

import { useEffect, useMemo, useState } from "react";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { REWARDS_WEEKLY_XP } from "@/lib/rewards-copy";

type WeeklyUserRow = {
  rank: number;
  walletAddress: string;
  weeklyXp: number;
};

type WeeklyClanRow = {
  rank: number;
  clanId: string;
  name: string | null;
  weeklyXp: number;
};

type WeeklyLeaderboardData = {
  season: { id: number; startedAt: string };
  users: WeeklyUserRow[];
  clans: WeeklyClanRow[];
};

type WeeklyLeaderboardPanelProps = {
  address?: string;
  refreshKey?: number;
};

export function WeeklyLeaderboardPanel({
  address = "",
  refreshKey = 0,
}: WeeklyLeaderboardPanelProps) {
  const [data, setData] = useState<WeeklyLeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/leaderboard/weekly?limit=100&clans=1", {
          cache: "no-store",
        });
        const body = (await response.json()) as {
          data?: WeeklyLeaderboardData;
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? REWARDS_WEEKLY_XP.loadError);
        if (cancelled) return;
        setData(body.data ?? null);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : REWARDS_WEEKLY_XP.loadError);
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

  const selfRank = useMemo(() => {
    if (!address.trim() || !data?.users.length) return null;
    const key = address.trim();
    return data.users.find((row) => row.walletAddress === key) ?? null;
  }, [address, data?.users]);

  if (loading && !data) {
    return (
      <div className="weekly-leaderboard-panel">
        <p className="text-pump-muted text-sm">{REWARDS_WEEKLY_XP.loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weekly-leaderboard-panel">
        <p className="text-pump-danger text-sm">{error}</p>
      </div>
    );
  }

  const users = data?.users ?? [];
  const clans = data?.clans ?? [];
  const seasonId = data?.season.id ?? 1;

  return (
    <div className="weekly-leaderboard-panel">
      <header className="weekly-leaderboard-panel__header">
        <div>
          <h2 className="weekly-leaderboard-panel__title">{REWARDS_WEEKLY_XP.heading}</h2>
          <p className="weekly-leaderboard-panel__hint">{REWARDS_WEEKLY_XP.hint}</p>
        </div>
        <span className="weekly-leaderboard-panel__season">
          {REWARDS_WEEKLY_XP.seasonLabel(seasonId)}
        </span>
      </header>

      {selfRank ? (
        <p className="weekly-leaderboard-panel__self text-pump-muted text-sm">
          {REWARDS_WEEKLY_XP.yourRank(selfRank.rank)} ·{" "}
          <span className="financial-value text-pump-text">
            {selfRank.weeklyXp.toLocaleString()} XP
          </span>
        </p>
      ) : address ? (
        <p className="weekly-leaderboard-panel__self text-pump-muted text-sm">
          {REWARDS_WEEKLY_XP.unranked}
        </p>
      ) : null}

      {users.length === 0 ? (
        <div className="empty-state missions-empty-state">
          <p className="empty-state-copy">{REWARDS_WEEKLY_XP.empty}</p>
        </div>
      ) : (
        <div className="weekly-leaderboard-panel__table-wrap">
          <table className="weekly-leaderboard-panel__table">
            <thead>
              <tr>
                <th>{REWARDS_WEEKLY_XP.colRank}</th>
                <th>{REWARDS_WEEKLY_XP.colTrader}</th>
                <th className="weekly-leaderboard-panel__col-xp">{REWARDS_WEEKLY_XP.colXp}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => {
                const isSelf = Boolean(address && row.walletAddress === address.trim());
                return (
                  <tr
                    key={row.walletAddress}
                    className={isSelf ? "weekly-leaderboard-panel__row--self" : undefined}
                  >
                    <td className="financial-value">{row.rank}</td>
                    <td>
                      <div className="weekly-leaderboard-panel__trader">
                        <UserAvatarForAddress address={row.walletAddress} size={24} />
                        <UserDisplayName address={row.walletAddress} />
                        {isSelf ? (
                          <span className="weekly-leaderboard-panel__you">{REWARDS_WEEKLY_XP.you}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="weekly-leaderboard-panel__col-xp financial-value">
                      {row.weeklyXp.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {clans.length > 0 ? (
        <section className="weekly-leaderboard-panel__clans">
          <h3 className="weekly-leaderboard-panel__clans-title">{REWARDS_WEEKLY_XP.clansHeading}</h3>
          <ul className="weekly-leaderboard-panel__clans-list">
            {clans.slice(0, 10).map((row) => (
              <li key={row.clanId} className="weekly-leaderboard-panel__clans-row">
                <span className="financial-value text-pump-muted">#{row.rank}</span>
                <span className="weekly-leaderboard-panel__clan-name">
                  {row.name ?? REWARDS_WEEKLY_XP.clanFallback}
                </span>
                <span className="financial-value">{row.weeklyXp.toLocaleString()} XP</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
