"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useAccount } from "wagmi";
import type { AirdropListItem } from "@/lib/db/airdrops";
import {
  airdropStatusBadgeClass,
  formatAirdropDisplayStatus,
  type AirdropDisplayStatus,
} from "@/lib/airdrop-status";
import {
  airdropRewardUsd,
  formatAirdropReward,
} from "@/lib/airdrop-board-format";
import { useAirdropSaves } from "@/components/airdrops/AirdropSavesProvider";
import { ToolbarSheet } from "@/components/ui/ToolbarSheet";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { PumpIcon, faBookmarkRegular } from "@/lib/icons";
import { shortAddress } from "@/config/chain";
import { formatUsdReadable } from "@/lib/format-usd";

type SavedAirdropItem = AirdropListItem & {
  displayStatus: AirdropDisplayStatus;
};

type AirdropsSavedSheetProps = {
  items: SavedAirdropItem[];
  bnbUsd: number | null;
};

function poolSymbol(item: AirdropListItem): string {
  return item.linkedSymbol ?? shortAddress(item.linkedToken);
}

function SavedAirdropRow({
  item,
  bnbUsd,
  onToggleSave,
}: {
  item: SavedAirdropItem;
  bnbUsd: number | null;
  onToggleSave: (airdropId: string) => void;
}) {
  const symbol = poolSymbol(item);
  const isBnb = !item.rewardToken;
  const usd = airdropRewardUsd(item, bnbUsd);
  const poolLabel = formatAirdropReward(item.totalFunded, {
    isBnb,
    symbol: item.rewardSymbol,
  });
  const rewardDisplay = formatUsdReadable(usd, { compact: true }) ?? poolLabel;

  return (
    <li>
      <div className="toolbar-sheet-row">
        <button
          type="button"
          onClick={() => onToggleSave(item.id)}
          className="toolbar-sheet-row__action text-pump-accent"
          aria-label="Remove from saved"
        >
          <PumpIcon icon={faBookmarkRegular} active className="h-3.5 w-3.5" />
        </button>
        <Link href={`/airdrops/${item.id}`} className="toolbar-sheet-row__main">
          <TokenAvatar
            address={item.linkedToken}
            symbol={symbol}
            size="lg"
            className="toolbar-sheet-row__avatar"
          />
          <span className="toolbar-sheet-row__symbol">{symbol}</span>
          <span className="toolbar-sheet-row__metric">
            <span className="toolbar-sheet-row__metric-label">Pool</span>
            <span className="financial-value toolbar-sheet-row__metric-value">{rewardDisplay}</span>
          </span>
          <span
            className={`toolbar-sheet-row__badge shrink-0 ${airdropStatusBadgeClass(item.displayStatus)}`}
          >
            {formatAirdropDisplayStatus(item.displayStatus)}
          </span>
        </Link>
      </div>
    </li>
  );
}

export function AirdropsSavedSheet({ items, bnbUsd }: AirdropsSavedSheetProps) {
  const [open, setOpen] = useState(false);
  const { saves, toggleSave, loading } = useAirdropSaves();
  const { isConnected } = useAccount();
  const { openConnectModal } = useOpenConnectModal();

  const savedItems = useMemo(
    () => items.filter((item) => saves.has(item.id)),
    [items, saves]
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const ariaLabel = `Open saved campaigns${savedItems.length > 0 ? `, ${savedItems.length} saved` : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="arena-watchlist-btn toolbar-btn shrink-0 md:hidden"
        aria-label={ariaLabel}
      >
        <PumpIcon icon={faBookmarkRegular} active className="h-3.5 w-3.5 shrink-0 text-pump-accent" />
        <span className="arena-watchlist-btn__label text-caption">Saved</span>
        {savedItems.length > 0 ? (
          <span className="arena-watchlist-btn__count financial-value text-caption text-pump-muted">
            ({savedItems.length})
          </span>
        ) : null}
      </button>

      <ToolbarSheet
        open={open}
        onClose={close}
        ariaLabel="Saved campaigns"
        title="Saved"
        count={savedItems.length}
        icon={<PumpIcon icon={faBookmarkRegular} active className="h-4 w-4 text-pump-accent" />}
      >
        {!isConnected ? (
          <div className="empty-state px-3 py-6">
            <p className="empty-state-copy text-caption">
              Connect wallet to sync saved campaigns across devices.
            </p>
            <button
              type="button"
              onClick={() => openConnectModal?.()}
              className="secondary-button mt-3 w-full text-caption"
            >
              Connect
            </button>
          </div>
        ) : loading ? (
          <p className="p-4 text-center text-caption text-pump-muted">Loading…</p>
        ) : savedItems.length === 0 ? (
          <div className="empty-state px-3 py-6">
            <p className="empty-state-copy text-caption">
              Bookmark campaigns to pin them here.
            </p>
          </div>
        ) : (
          <ul className="toolbar-sheet-list">
            {savedItems.map((item) => (
              <SavedAirdropRow
                key={item.id}
                item={item}
                bnbUsd={bnbUsd}
                onToggleSave={toggleSave}
              />
            ))}
          </ul>
        )}
      </ToolbarSheet>
    </>
  );
}
