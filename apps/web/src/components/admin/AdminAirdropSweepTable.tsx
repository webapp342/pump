"use client";

import Link from "next/link";
import {
  AdminBtn,
  AdminStatusBadge,
} from "@/components/admin/AdminChrome";
import {
  AdminEnterpriseTable,
  type AdminTableColumn,
} from "@/components/admin/AdminEnterpriseTable";
import { ADMIN_COPY } from "@/lib/admin/copy";
import {
  formatQualifyDateTime,
} from "@/lib/airdrop-board-format";
import { formatUsdReadable } from "@/lib/format-usd";
import { explorerTxUrl, shortAddress } from "@/config/chain";

export type SweepRow = {
  id: string | number;
  onChainId: string;
  title: string | null;
  linkedSymbol: string | null;
  totalFunded: string;
  totalClaimedBnb: string;
  remainingBnb: string;
  rewardToken: string | null;
  rewardSymbol: string | null;
  rewardPriceBnb: string | null;
  claimEnd: string | null;
  claimEndUnix: number | null;
  canSweep: boolean;
  sweepStatus: string;
};

type AdminAirdropSweepTableProps = {
  rows: SweepRow[];
  loading?: boolean;
  bnbUsd: number | null;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  adminTxPending?: boolean;
  sweepingId?: string | null;
  adminTxHash?: string;
  onSweep: (row: SweepRow) => void;
  toolbar?: React.ReactNode;
  title?: string;
  subtitle?: string;
};

function sweepStatusLabel(status: string): string {
  const labels = ADMIN_COPY.airdrops.status;
  switch (status) {
    case "ready":
      return labels.ready;
    case "claim_window_open":
      return labels.claimWindowOpen;
    case "claim_window_open_no_winners":
      return labels.noWinners;
    case "swept":
      return labels.swept;
    case "not_finalized":
      return labels.notFinalized;
    case "nothing_to_sweep":
      return labels.fullyClaimed;
    default:
      return status;
  }
}

function AdminRewardText({
  amount,
  rewardToken,
  rewardSymbol,
  rewardPriceBnb,
  bnbUsd,
}: {
  amount: string;
  rewardToken: string | null;
  rewardSymbol: string | null;
  rewardPriceBnb: string | null;
  bnbUsd: number | null;
}) {
  const sym = rewardSymbol ?? (rewardToken ? "TOKEN" : "BNB");
  const usd =
    bnbUsd != null && rewardPriceBnb
      ? Number(amount) * Number(rewardPriceBnb) * bnbUsd
      : null;
  return (
    <span>
      {amount} {sym}
      {usd != null ? (
        <span className="admin-meta"> · {formatUsdReadable(usd, { compact: true })}</span>
      ) : null}
    </span>
  );
}

function AdminSweepCountdown({
  claimEndUnix,
  canSweep,
  sweepStatus,
}: {
  claimEndUnix: number | null;
  canSweep: boolean;
  sweepStatus: string;
}) {
  if (canSweep) return <span className="admin-status-ok">Ready</span>;
  if (sweepStatus === "swept") return <span className="admin-meta">Done</span>;
  if (!claimEndUnix) return <span className="admin-meta">—</span>;
  const ms = claimEndUnix * 1000 - Date.now();
  if (ms <= 0) return <span className="admin-meta">Window closed</span>;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return (
    <span className="admin-num">
      {h}h {m}m
    </span>
  );
}

export function AdminAirdropSweepTable({
  rows,
  loading,
  bnbUsd,
  searchQuery,
  onSearchQueryChange,
  adminTxPending,
  sweepingId,
  adminTxHash,
  onSweep,
  toolbar,
  title,
  subtitle,
}: AdminAirdropSweepTableProps) {
  const columns: AdminTableColumn<SweepRow>[] = [
    {
      id: "id",
      header: ADMIN_COPY.airdrops.columns.id,
      align: "right",
      width: "4.5rem",
      sortable: true,
      sortValue: (r) => Number(r.onChainId),
      cell: (r) => r.onChainId,
    },
    {
      id: "campaign",
      header: ADMIN_COPY.airdrops.columns.campaign,
      sortable: true,
      sortValue: (r) => r.title ?? r.linkedSymbol ?? "",
      cell: (r) => (
        <Link href={`/airdrops/${r.id}`} className="admin-link">
          {r.title ?? r.linkedSymbol ?? `#${r.id}`}
        </Link>
      ),
    },
    {
      id: "symbol",
      header: ADMIN_COPY.airdrops.columns.symbol,
      width: "5rem",
      cell: (r) => (r.linkedSymbol ? `$${r.linkedSymbol}` : "—"),
    },
    {
      id: "pool",
      header: ADMIN_COPY.airdrops.columns.pool,
      align: "right",
      sortable: true,
      sortValue: (r) => Number(r.totalFunded),
      cell: (r) => (
        <AdminRewardText
          amount={r.totalFunded}
          rewardToken={r.rewardToken}
          rewardSymbol={r.rewardSymbol}
          rewardPriceBnb={r.rewardPriceBnb}
          bnbUsd={bnbUsd}
        />
      ),
    },
    {
      id: "claimed",
      header: ADMIN_COPY.airdrops.columns.claimed,
      align: "right",
      sortable: true,
      sortValue: (r) => Number(r.totalClaimedBnb),
      cell: (r) => (
        <AdminRewardText
          amount={r.totalClaimedBnb}
          rewardToken={r.rewardToken}
          rewardSymbol={r.rewardSymbol}
          rewardPriceBnb={r.rewardPriceBnb}
          bnbUsd={bnbUsd}
        />
      ),
    },
    {
      id: "remaining",
      header: ADMIN_COPY.airdrops.columns.remaining,
      align: "right",
      sortable: true,
      sortValue: (r) => Number(r.remainingBnb),
      cell: (r) => (
        <AdminRewardText
          amount={r.remainingBnb}
          rewardToken={r.rewardToken}
          rewardSymbol={r.rewardSymbol}
          rewardPriceBnb={r.rewardPriceBnb}
          bnbUsd={bnbUsd}
        />
      ),
    },
    {
      id: "claimUntil",
      header: ADMIN_COPY.airdrops.columns.claimUntil,
      width: "9rem",
      cell: (r) =>
        r.claimEndUnix
          ? formatQualifyDateTime(new Date(r.claimEndUnix * 1000).toISOString())
          : r.claimEnd
            ? formatQualifyDateTime(r.claimEnd)
            : "—",
    },
    {
      id: "sweepIn",
      header: ADMIN_COPY.airdrops.columns.sweepIn,
      width: "6rem",
      cell: (r) => (
        <AdminSweepCountdown
          claimEndUnix={r.claimEndUnix}
          canSweep={r.canSweep}
          sweepStatus={r.sweepStatus}
        />
      ),
    },
    {
      id: "status",
      header: ADMIN_COPY.airdrops.columns.status,
      width: "7rem",
      cell: (r) => (
        <AdminStatusBadge
          tone={
            r.sweepStatus === "ready"
              ? "warn"
              : r.sweepStatus === "swept" || r.sweepStatus === "nothing_to_sweep"
                ? "ok"
                : "neutral"
          }
        >
          {sweepStatusLabel(r.sweepStatus)}
        </AdminStatusBadge>
      ),
    },
    {
      id: "action",
      header: ADMIN_COPY.airdrops.columns.action,
      width: "6.5rem",
      align: "right",
      cell: (r) =>
        r.canSweep ? (
          <AdminBtn
            size="sm"
            onClick={() => onSweep(r)}
            disabled={adminTxPending && sweepingId === r.onChainId}
          >
            {adminTxPending && sweepingId === r.onChainId ? "…" : ADMIN_COPY.actions.sweep}
          </AdminBtn>
        ) : r.sweepStatus === "swept" ? (
          <span className="admin-meta">{ADMIN_COPY.airdrops.status.swept}</span>
        ) : (
          <span className="admin-meta">—</span>
        ),
    },
  ];

  return (
    <AdminEnterpriseTable
      title={title}
      subtitle={subtitle}
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      loading={loading}
      emptyMessage={ADMIN_COPY.airdrops.empty}
      searchPlaceholder="Filter…"
      searchQuery={searchQuery}
      onSearchQueryChange={onSearchQueryChange}
      searchFilter={(row, q) => {
        const hay = [
          row.onChainId,
          row.title,
          row.linkedSymbol,
          row.sweepStatus,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      }}
      toolbar={toolbar}
      footer={
        adminTxHash && sweepingId ? (
          <span className="admin-ent-table-meta">
            Last sweep{" "}
            <a
              href={explorerTxUrl(adminTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-link admin-num"
            >
              {shortAddress(adminTxHash)}
            </a>
          </span>
        ) : undefined
      }
    />
  );
}
