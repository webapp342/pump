"use client";

import { useEffect, useState } from "react";
import type { CreatorFollowNetwork } from "@/lib/db/launchpad";
import { CreatorProfileModal } from "@/components/creators/CreatorProfileModal";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { UserDisplayName } from "@/components/user/UserDisplayName";

type FollowTab = "following" | "followers";

type FollowNetworkModalProps = {
  open: boolean;
  onClose: () => void;
  address: string;
  initialTab?: FollowTab;
};

function formatFollowDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function FollowList({
  entries,
  emptyLabel,
  onViewProfile,
}: {
  entries: CreatorFollowNetwork["following"];
  emptyLabel: string;
  onViewProfile: (address: string) => void;
}) {
  if (entries.length === 0) {
    return <p className="py-8 text-center text-body-sm text-pump-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="divide-y divide-pump-border/10">
      {entries.map((entry) => (
        <li
          key={entry.address}
          className="flex items-center justify-between gap-3 py-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatarForAddress address={entry.address} size="xl" />
            <div className="min-w-0">
              <span className="text-body-sm font-medium text-pump-text">
                <UserDisplayName address={entry.address} compact />
              </span>
              <p className="mt-0.5 text-caption text-pump-muted">
                {formatFollowDate(entry.followedAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onViewProfile(entry.address)}
            className="shrink-0 text-caption font-medium text-pump-accent hover:underline"
          >
            View profile
          </button>
        </li>
      ))}
    </ul>
  );
}

export function FollowNetworkModal({
  open,
  onClose,
  address,
  initialTab = "following",
}: FollowNetworkModalProps) {
  const [tab, setTab] = useState<FollowTab>(initialTab);
  const [network, setNetwork] = useState<CreatorFollowNetwork | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileAddress, setProfileAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) setProfileAddress(null);
  }, [open]);

  useEffect(() => {
    if (!open || !address) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/creators/follows/network?address=${encodeURIComponent(address)}`,
          { cache: "no-store" }
        );
        const body = (await response.json()) as { data?: CreatorFollowNetwork; error?: string };
        if (cancelled) return;
        if (!response.ok || !body.data) {
          throw new Error(body.error ?? "Failed to load follow network");
        }
        setNetwork(body.data);
      } catch (err) {
        if (!cancelled) {
          setNetwork(null);
          setError(err instanceof Error ? err.message : "Failed to load follow network");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, address]);

  if (!open) return null;

  const followingCount = network?.followingCount ?? 0;
  const followerCount = network?.followerCount ?? 0;

  const profileOpen = profileAddress !== null;

  return (
    <>
      <CreatorProfileModal
        open={profileOpen}
        creatorAddress={profileAddress ?? ""}
        onClose={() => setProfileAddress(null)}
      />

      {!profileOpen ? (
        <AppBottomSheet
          open={open}
          onClose={onClose}
          ariaLabel="Creator network"
          title="Creator network"
          subtitle={`${followingCount} following · ${followerCount} followers`}
          zIndex={50}
          panelClassName="max-w-md"
          dragEntirePanel={false}
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("following")}
              className={tab === "following" ? "chip-button chip-button-active" : "chip-button"}
            >
              Following ({followingCount})
            </button>
            <button
              type="button"
              onClick={() => setTab("followers")}
              className={tab === "followers" ? "chip-button chip-button-active" : "chip-button"}
            >
              Followers ({followerCount})
            </button>
          </div>

          <div className="mt-4 max-h-[min(50vh,360px)] overflow-y-auto">
            {loading ? (
              <p className="py-8 text-center text-body-sm text-pump-muted">Loading…</p>
            ) : error ? (
              <p className="notice-error py-4 text-body-sm">{error}</p>
            ) : (
              <FollowList
                entries={
                  tab === "following"
                    ? (network?.following ?? [])
                    : (network?.followers ?? [])
                }
                emptyLabel={
                  tab === "following"
                    ? "You are not following any creators yet."
                    : "No followers yet."
                }
                onViewProfile={setProfileAddress}
              />
            )}
          </div>

          <button type="button" onClick={onClose} className="secondary-button mt-5 w-full py-2.5">
            Close
          </button>
        </AppBottomSheet>
      ) : null}
    </>
  );
}
