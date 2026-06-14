"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, isAddress, parseEther } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ADMIN_ADDRESS, isAdminWallet } from "@/config/admin";
import { contracts, explorerAddressUrl, explorerTxUrl, pumpChain, shortAddress } from "@/config/chain";
import { erc20Abi } from "@/lib/abis/erc20";
import { launchpadTreasuryAbi } from "@/lib/abis/launchpad-treasury";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import {
  airdropRewardAmountUsd,
  formatAirdropReward,
  formatQualifyDateTime,
} from "@/lib/airdrop-board-format";
import { AdminAirdropCreateFeeModal } from "@/components/admin/AdminAirdropCreateFeeModal";
import { AdminCreatorShareModal } from "@/components/admin/AdminCreatorShareModal";
import { AdminReferrerShareModal } from "@/components/admin/AdminReferrerShareModal";
import { AdminMemeCreateFeeModal } from "@/components/admin/AdminMemeCreateFeeModal";
import { AdminProtocolFeeModal } from "@/components/admin/AdminProtocolFeeModal";
import { AdminSystemHealth } from "@/components/admin/AdminSystemHealth";
import {
  AdminAlert,
  AdminBlock,
  AdminBtn,
  AdminDataRow,
  AdminDataTable,
  AdminEmptyState,
  AdminGridTable,
  AdminNum,
  AdminPageHeader,
  AdminShell,
  AdminTabPanel,
  AdminTabs,
  AdminTextButton,
  type AdminTabId,
} from "@/components/admin/AdminChrome";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd, formatBnbWithUsd, formatUsdReadable } from "@/lib/format-usd";
import {
  creatorShareBpsToPercent,
  protocolFeeBpsToPercent,
  referrerShareBpsToPercent,
  treasurySharePercentFromSplit,
} from "@/lib/trade-fee-config";

type ProtocolSnapshot = {
  memeFactory: { address: string; owner: string; treasury: string; createFeeBnb: string };
  bondingCurveManager: {
    address: string;
    owner: string;
    treasury: string;
    protocolFeeBps: number;
    creatorFeeShareBps: number;
    referrerShareBps: number;
    contractBalanceBnb: string;
  };
  airdropManager: {
    address: string;
    admin: string;
    treasury: string;
    createFeeBnb: string;
    contractBalanceBnb: string;
  } | null;
  treasury: { address: string; owner: string; balanceBnb: string };
};

type TreasuryWithdrawMode = "bnb" | "token";

type SweepRow = {
  id: string;
  onChainId: string;
  title: string | null;
  linkedSymbol: string | null;
  rewardToken: string | null;
  rewardSymbol: string | null;
  rewardPriceBnb: string | null;
  totalFunded: string;
  totalClaimedBnb: string;
  remainingBnb: string;
  claimEnd: string;
  canSweep: boolean;
  sweepStatus: string;
  sweepRecipient: string | null;
};

type AdminLinkTask = {
  taskKey: string;
  title: string;
  description: string | null;
  rewardPoints: number;
  targetUrl: string;
  isActive: boolean;
  createdAt: string;
  completionCount: number;
};

type AdminPlatformStats = {
  usersRegistered: number;
  usersRegistered24h: number;
  usersTraded: number;
  totalTrades: number;
  trades24h: number;
  totalTokens: number;
  tokensToday: number;
  totalAirdrops: number;
  airdropsToday: number;
  treasuryShareFromTradesBnb: string;
  creatorAllocatedBnb: string;
  referrerAllocatedBnb: string;
  claimedCreatorBnb: string;
  claimedReferrerBnb: string;
  pendingCreatorBnb: string;
  pendingReferrerBnb: string;
  claimedTotalBnb: string;
  treasuryBalanceBnb: string;
  availableTotalBnb: string;
  feesNote: string;
};

function formatBnb(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n >= 1) return n.toFixed(4);
  if (n > 0) return n.toFixed(6);
  return "0";
}

function sweepStatusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "Ready to sweep";
    case "claim_window_open":
      return "Claim window open";
    case "swept":
      return "Already swept";
    case "not_finalized":
      return "Not finalized";
    case "nothing_to_sweep":
      return "Fully claimed";
    default:
      return status;
  }
}

function BnbAmountWithUsd({
  bnb,
  bnbUsd,
  compact = false,
  inline = false,
}: {
  bnb: string;
  bnbUsd: number | null;
  compact?: boolean;
  inline?: boolean;
}) {
  const n = Number(bnb);
  const formatted = formatBnbWithUsd(Number.isFinite(n) ? n : 0, bnbUsd, { compact });
  if (inline) {
    return (
      <span className="admin-num">
        {formatted.bnb}
        {formatted.usd ? <span className="admin-meta"> · {formatted.usd}</span> : null}
      </span>
    );
  }
  const amountClass = compact
    ? "financial-value text-caption font-semibold text-pump-text"
    : "financial-value text-body-sm font-semibold text-pump-text";

  return (
    <div>
      <p className={amountClass}>{formatted.bnb}</p>
      {formatted.usd ? (
        <p className="text-[10px] text-pump-muted md:text-caption">{formatted.usd}</p>
      ) : null}
    </div>
  );
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
  const isBnb = !rewardToken;
  const text = formatAirdropReward(amount, { isBnb, symbol: rewardSymbol });
  const usd = airdropRewardAmountUsd(
    amount,
    { rewardToken, rewardSymbol, rewardPriceBnb, totalFunded: amount },
    bnbUsd
  );
  return (
    <span className="admin-num">
      {text}
      {usd != null ? <span className="admin-meta"> · {formatUsdReadable(usd, { compact: true })}</span> : null}
    </span>
  );
}

function sweepStatusClass(status: string): string {
  switch (status) {
    case "ready":
      return "admin-status-ok";
    case "claim_window_open":
      return "admin-status-warn";
    case "down":
      return "admin-status-bad";
    default:
      return "";
  }
}

export function AdminPanel() {
  const { address } = useAccount();
  const { bnbUsd } = useBnbUsdPrice();
  const [protocol, setProtocol] = useState<ProtocolSnapshot | null>(null);
  const [airdrops, setAirdrops] = useState<SweepRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweepingId, setSweepingId] = useState<string | null>(null);
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTokenAddress, setWithdrawTokenAddress] = useState("");
  const [withdrawTokenAmount, setWithdrawTokenAmount] = useState("");
  const [withdrawMode, setWithdrawMode] = useState<TreasuryWithdrawMode>("bnb");
  const [promoTasks, setPromoTasks] = useState<AdminLinkTask[]>([]);
  const [promoLoading, setPromoLoading] = useState(true);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoTitle, setPromoTitle] = useState("");
  const [promoDescription, setPromoDescription] = useState("");
  const [promoPoints, setPromoPoints] = useState("");
  const [promoUrl, setPromoUrl] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [protocolFeeModalOpen, setProtocolFeeModalOpen] = useState(false);
  const [creatorShareModalOpen, setCreatorShareModalOpen] = useState(false);
  const [referrerShareModalOpen, setReferrerShareModalOpen] = useState(false);
  const [memeCreateFeeModalOpen, setMemeCreateFeeModalOpen] = useState(false);
  const [airdropCreateFeeModalOpen, setAirdropCreateFeeModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTabId>("dashboard");
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const isAdmin = isAdminWallet(address);
  const treasuryContract = protocol?.treasury.address as `0x${string}` | undefined;
  const treasuryOwner = protocol?.treasury.owner;
  const canWithdrawTreasury =
    isAdmin &&
    Boolean(address) &&
    Boolean(treasuryContract) &&
    treasuryOwner != null &&
    address!.toLowerCase() === treasuryOwner.toLowerCase();

  const bondingOwner = protocol?.bondingCurveManager.owner;
  const memeFactoryOwner = protocol?.memeFactory.owner;
  const airdropAdmin = protocol?.airdropManager?.admin;

  const { data: treasuryLiveBalance, refetch: refetchTreasuryBalance } = useBalance({
    address: treasuryContract,
    chainId: pumpChain.id,
    query: { enabled: Boolean(treasuryContract), refetchInterval: 15_000 },
  });

  const tokenWithdrawAddress = isAddress(withdrawTokenAddress)
    ? (withdrawTokenAddress as `0x${string}`)
    : undefined;

  const { data: treasuryTokenBalance, refetch: refetchTreasuryTokenBalance } = useReadContract({
    address: tokenWithdrawAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: treasuryContract ? [treasuryContract] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(treasuryContract && tokenWithdrawAddress), refetchInterval: 15_000 },
  });

  const {
    writeContract,
    data: adminTxHash,
    isPending: adminTxPending,
    reset: resetAdminTx,
  } = useWriteContract();
  const { isSuccess: adminTxDone } = useWaitForTransactionReceipt({ hash: adminTxHash });

  const loadPromoTasks = useCallback(async () => {
    if (!address) return;
    setPromoLoading(true);
    try {
      const res = await fetch(`/api/admin/tasks?address=${address}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: { tasks: AdminLinkTask[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load promo tasks");
      setPromoTasks(json.data?.tasks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load promo tasks");
    } finally {
      setPromoLoading(false);
    }
  }, [address]);

  const loadStats = useCallback(async () => {
    if (!address) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/admin/stats?address=${address}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: AdminPlatformStats; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load platform stats");
      setStats(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform stats");
    } finally {
      setStatsLoading(false);
    }
  }, [address]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (!address) return;
      const res = await fetch(`/api/admin/overview?address=${address}`, { cache: "no-store" });
      const json = (await res.json()) as {
        data?: { protocol: ProtocolSnapshot; airdrops: SweepRow[] };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load admin data");
      setProtocol(json.data?.protocol ?? null);
      setAirdrops(json.data?.airdrops ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
    void loadStats();
    void loadPromoTasks();
  }, [load, loadStats, loadPromoTasks]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadStats(), loadPromoTasks()]);
  }, [load, loadStats, loadPromoTasks]);

  useEffect(() => {
    if (!adminTxDone) return;

    if (sweepingId) {
      setSweepingId(null);
      void load();
      return;
    }

    setWithdrawAmount("");
    setWithdrawTokenAmount("");
    resetAdminTx();
    void refetchTreasuryBalance();
    void refetchTreasuryTokenBalance();
    void load();
    void loadStats();
  }, [
    adminTxDone,
    sweepingId,
    load,
    loadStats,
    resetAdminTx,
    refetchTreasuryBalance,
    refetchTreasuryTokenBalance,
  ]);

  useEffect(() => {
    if (address && !withdrawTo) {
      setWithdrawTo(address);
    }
  }, [address, withdrawTo]);

  function onSweep(row: SweepRow) {
    if (!contracts.airdropManager) return;
    setSweepingId(row.onChainId);
    writeContract({
      address: contracts.airdropManager,
      abi: pumpAirdropManagerAbi,
      functionName: "sweepRemainder",
      args: [BigInt(row.onChainId)],
      chainId: pumpChain.id,
    });
  }

  function onWithdrawTreasuryBnb() {
    if (!canWithdrawTreasury || !treasuryContract) return;
    if (!isAddress(withdrawTo)) {
      setError("Enter a valid recipient address");
      return;
    }
    let amount: bigint;
    try {
      amount = parseEther(withdrawAmount.trim() || "0");
    } catch {
      setError("Invalid BNB amount");
      return;
    }
    if (amount <= 0n) {
      setError("Amount must be greater than 0");
      return;
    }
    setError(null);
    writeContract({
      address: treasuryContract,
      abi: launchpadTreasuryAbi,
      functionName: "withdrawNative",
      args: [withdrawTo as `0x${string}`, amount],
      chainId: pumpChain.id,
    });
  }

  function onWithdrawTreasuryToken() {
    if (!canWithdrawTreasury || !treasuryContract) return;
    if (!isAddress(withdrawTo)) {
      setError("Enter a valid recipient address");
      return;
    }
    if (!isAddress(withdrawTokenAddress)) {
      setError("Enter a valid token contract address");
      return;
    }
    let amount: bigint;
    try {
      amount = parseEther(withdrawTokenAmount.trim() || "0");
    } catch {
      setError("Invalid token amount");
      return;
    }
    if (amount <= 0n) {
      setError("Amount must be greater than 0");
      return;
    }
    setError(null);
    writeContract({
      address: treasuryContract,
      abi: launchpadTreasuryAbi,
      functionName: "withdrawToken",
      args: [withdrawTokenAddress as `0x${string}`, withdrawTo as `0x${string}`, amount],
      chainId: pumpChain.id,
    });
  }

  function fillMaxTreasuryBnb() {
    if (!treasuryLiveBalance?.value) return;
    setWithdrawAmount(formatEther(treasuryLiveBalance.value));
  }

  function fillMaxTreasuryToken() {
    if (treasuryTokenBalance == null) return;
    setWithdrawTokenAmount(formatEther(treasuryTokenBalance));
  }

  async function onCreatePromoTask() {
    if (!address) return;
    setPromoSaving(true);
    setError(null);
    try {
      const rewardPoints = Number.parseInt(promoPoints.trim(), 10);
      const res = await fetch(`/api/admin/tasks?address=${address}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: promoTitle,
          description: promoDescription || null,
          rewardPoints,
          targetUrl: promoUrl,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create task");

      setPromoTitle("");
      setPromoDescription("");
      setPromoPoints("");
      setPromoUrl("");
      await loadPromoTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setPromoSaving(false);
    }
  }

  async function onDeletePromoTask(taskKey: string, title: string) {
    if (!address) return;
    if (!window.confirm(`Delete "${title}"? Users keep any points already earned.`)) return;

    setDeletingKey(taskKey);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tasks?address=${address}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to delete task");
      await loadPromoTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeletingKey(null);
    }
  }

  const readySweeps = airdrops.filter((r) => r.canSweep);
  const treasuryBnb = treasuryLiveBalance
    ? formatEther(treasuryLiveBalance.value)
    : (protocol?.treasury.balanceBnb ?? "0");

  const sweepStats = useMemo(() => {
    let remainingUsd = 0;
    let pricedRemaining = 0;
    for (const row of readySweeps) {
      const usd = airdropRewardAmountUsd(
        row.remainingBnb,
        {
          rewardToken: row.rewardToken,
          rewardSymbol: row.rewardSymbol,
          rewardPriceBnb: row.rewardPriceBnb,
          totalFunded: row.totalFunded,
        },
        bnbUsd
      );
      if (usd != null) {
        remainingUsd += usd;
        pricedRemaining += 1;
      }
    }
    return {
      readyCount: readySweeps.length,
      remainingUsd: pricedRemaining > 0 ? remainingUsd : null,
    };
  }, [readySweeps, bnbUsd]);

  const escrowBnb = protocol?.airdropManager?.contractBalanceBnb ?? "0";
  const memeFeeUsd = bnbToUsd(Number(protocol?.memeFactory.createFeeBnb ?? 0), bnbUsd);
  const airdropFeeUsd = bnbToUsd(Number(protocol?.airdropManager?.createFeeBnb ?? 0), bnbUsd);
  const protocolFeeBps = protocol?.bondingCurveManager.protocolFeeBps ?? 0;
  const creatorFeeShareBps = protocol?.bondingCurveManager.creatorFeeShareBps ?? 0;
  const referrerShareBps = protocol?.bondingCurveManager.referrerShareBps ?? 0;
  const treasuryFeeSharePct = treasurySharePercentFromSplit(creatorFeeShareBps, referrerShareBps);

  return (
    <AdminShell>
      <AdminProtocolFeeModal
        open={protocolFeeModalOpen}
        onClose={() => setProtocolFeeModalOpen(false)}
        currentProtocolFeeBps={protocolFeeBps}
        bondingOwner={bondingOwner ?? ADMIN_ADDRESS}
        onUpdated={() => void load()}
      />
      <AdminCreatorShareModal
        open={creatorShareModalOpen}
        onClose={() => setCreatorShareModalOpen(false)}
        currentCreatorShareBps={creatorFeeShareBps}
        protocolFeeBps={protocolFeeBps}
        bondingOwner={bondingOwner ?? ADMIN_ADDRESS}
        onUpdated={() => void load()}
      />
      <AdminReferrerShareModal
        open={referrerShareModalOpen}
        onClose={() => setReferrerShareModalOpen(false)}
        currentReferrerShareBps={referrerShareBps}
        creatorFeeShareBps={creatorFeeShareBps}
        protocolFeeBps={protocolFeeBps}
        bondingOwner={bondingOwner ?? ADMIN_ADDRESS}
        onUpdated={() => void load()}
      />
      <AdminMemeCreateFeeModal
        open={memeCreateFeeModalOpen}
        onClose={() => setMemeCreateFeeModalOpen(false)}
        currentFeeBnb={protocol?.memeFactory.createFeeBnb ?? "0"}
        memeFactoryOwner={memeFactoryOwner ?? ADMIN_ADDRESS}
        onUpdated={() => void load()}
      />
      <AdminAirdropCreateFeeModal
        open={airdropCreateFeeModalOpen}
        onClose={() => setAirdropCreateFeeModalOpen(false)}
        currentFeeBnb={protocol?.airdropManager?.createFeeBnb ?? "0"}
        airdropAdmin={airdropAdmin ?? ADMIN_ADDRESS}
        onUpdated={() => void load()}
      />

      <AdminPageHeader
        address={address}
        onRefreshAll={() => void refreshAll()}
        refreshing={loading || statsLoading || promoLoading}
      />

      {error ? <AdminAlert>{error}</AdminAlert> : null}

      <AdminTabs active={activeTab} onChange={setActiveTab} />

      <AdminTabPanel id="dashboard" active={activeTab}>
        {address ? <AdminSystemHealth address={address} /> : null}

        <AdminBlock title="Platform">
          <AdminDataTable>
            <AdminDataRow label="Users (registered)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.usersRegistered ?? "—"}</AdminNum>
              {stats ? <span className="admin-meta"> · app / points profile</span> : null}
            </AdminDataRow>
            <AdminDataRow label="New users (24h)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.usersRegistered24h ?? "—"}</AdminNum>
              {stats ? <span className="admin-meta"> · registered last 24h</span> : null}
            </AdminDataRow>
            <AdminDataRow label="Users (traded)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.usersTraded ?? "—"}</AdminNum>
              {stats ? <span className="admin-meta"> · ≥1 trade indexed</span> : null}
            </AdminDataRow>
            <AdminDataRow label="Total trades" loading={statsLoading && !stats}>
              <AdminNum>{stats?.totalTrades ?? "—"}</AdminNum>
            </AdminDataRow>
            <AdminDataRow label="Trades (24h)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.trades24h ?? "—"}</AdminNum>
            </AdminDataRow>
            <AdminDataRow label="Tokens launched (total)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.totalTokens ?? "—"}</AdminNum>
            </AdminDataRow>
            <AdminDataRow label="Tokens launched (today UTC)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.tokensToday ?? "—"}</AdminNum>
            </AdminDataRow>
            <AdminDataRow label="Airdrops launched (total)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.totalAirdrops ?? "—"}</AdminNum>
            </AdminDataRow>
            <AdminDataRow label="Airdrops launched (today UTC)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.airdropsToday ?? "—"}</AdminNum>
            </AdminDataRow>
          </AdminDataTable>
        </AdminBlock>

        <AdminBlock title="Fees">
          <AdminDataTable>
            <AdminDataRow label="Available (total est.)" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.availableTotalBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Treasury balance" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.treasuryBalanceBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Pending creator fees" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.pendingCreatorBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Pending referrer fees" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.pendingReferrerBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Claimed creator fees" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.claimedCreatorBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Claimed referrer fees" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.claimedReferrerBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Claimed (creator + referrer)" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.claimedTotalBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Treasury share from trades" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.treasuryShareFromTradesBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
          </AdminDataTable>
          {stats?.feesNote ? <p className="admin-note">{stats.feesNote}</p> : null}
        </AdminBlock>

        <AdminBlock title="Treasury & escrow">
          <AdminDataTable>
            <AdminDataRow label="Treasury balance" loading={loading && !protocol}>
              <BnbAmountWithUsd bnb={treasuryBnb} bnbUsd={bnbUsd} inline />
            </AdminDataRow>
            <AdminDataRow label="Airdrop escrow" loading={loading && !protocol}>
              <BnbAmountWithUsd bnb={escrowBnb} bnbUsd={bnbUsd} inline />
            </AdminDataRow>
            <AdminDataRow label="Ready to sweep" loading={loading && !protocol}>
              {sweepStats.readyCount} campaign{sweepStats.readyCount === 1 ? "" : "s"}
              {sweepStats.remainingUsd != null
                ? ` · ${formatUsdReadable(sweepStats.remainingUsd, { compact: true })}`
                : ""}
            </AdminDataRow>
            <AdminDataRow label="Total campaigns" loading={loading && !protocol}>
              {airdrops.length}
            </AdminDataRow>
          </AdminDataTable>
        </AdminBlock>
      </AdminTabPanel>

      <AdminTabPanel id="treasury" active={activeTab}>
        <AdminBlock title="Fee settings">
          <AdminDataTable>
            <AdminDataRow
              label="Trade protocol fee"
              loading={!protocol}
              action={
                protocol ? (
                  <AdminTextButton onClick={() => setProtocolFeeModalOpen(true)}>Edit</AdminTextButton>
                ) : undefined
              }
            >
              {protocol ? (
                <>
                  {protocolFeeBpsToPercent(protocolFeeBps).toFixed(2)}%
                  <span className="admin-meta">
                    {" "}
                    · creator {creatorShareBpsToPercent(creatorFeeShareBps).toFixed(0)}% · referrer{" "}
                    {referrerShareBpsToPercent(referrerShareBps).toFixed(0)}% · treasury{" "}
                    {treasuryFeeSharePct.toFixed(0)}%
                  </span>
                </>
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow
              label="Creator share"
              loading={!protocol}
              action={
                protocol ? (
                  <AdminTextButton onClick={() => setCreatorShareModalOpen(true)}>Edit</AdminTextButton>
                ) : undefined
              }
            >
              {protocol
                ? `${creatorShareBpsToPercent(creatorFeeShareBps).toFixed(2)}% of protocol fee`
                : "—"}
            </AdminDataRow>
            <AdminDataRow
              label="Referrer share"
              loading={!protocol}
              action={
                protocol ? (
                  <AdminTextButton onClick={() => setReferrerShareModalOpen(true)}>Edit</AdminTextButton>
                ) : undefined
              }
            >
              {protocol
                ? `${referrerShareBpsToPercent(referrerShareBps).toFixed(2)}% of protocol fee`
                : "—"}
            </AdminDataRow>
            <AdminDataRow
              label="Meme launch fee"
              loading={!protocol}
              action={
                protocol ? (
                  <AdminTextButton onClick={() => setMemeCreateFeeModalOpen(true)}>Edit</AdminTextButton>
                ) : undefined
              }
            >
              {protocol ? (
                <>
                  {formatBnb(protocol.memeFactory.createFeeBnb)} BNB
                  {memeFeeUsd != null
                    ? ` · ${formatUsdReadable(memeFeeUsd, { compact: true })}`
                    : ""}
                </>
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow
              label="Airdrop create fee"
              loading={!protocol?.airdropManager}
              action={
                protocol?.airdropManager ? (
                  <AdminTextButton onClick={() => setAirdropCreateFeeModalOpen(true)}>Edit</AdminTextButton>
                ) : undefined
              }
            >
              {protocol?.airdropManager ? (
                <>
                  {formatBnb(protocol.airdropManager.createFeeBnb)} BNB
                  {airdropFeeUsd != null
                    ? ` · ${formatUsdReadable(airdropFeeUsd, { compact: true })}`
                    : ""}
                </>
              ) : (
                "—"
              )}
            </AdminDataRow>
          </AdminDataTable>
        </AdminBlock>

        <AdminBlock title="Treasury">
          <AdminDataTable>
            <AdminDataRow label="Contract">
              {treasuryContract ? (
                <a
                  href={explorerAddressUrl(treasuryContract)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-link admin-num"
                >
                  {shortAddress(treasuryContract)}
                </a>
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Owner">
              {shortAddress(treasuryOwner ?? ADMIN_ADDRESS)}
            </AdminDataRow>
            <AdminDataRow label="Balance">
              <BnbAmountWithUsd bnb={treasuryBnb} bnbUsd={bnbUsd} inline />
            </AdminDataRow>
            <AdminDataRow label="Bonding curve balance">
              {protocol ? (
                <BnbAmountWithUsd
                  bnb={protocol.bondingCurveManager.contractBalanceBnb}
                  bnbUsd={bnbUsd}
                  inline
                />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Bonding curve owner">
              {shortAddress(bondingOwner ?? ADMIN_ADDRESS)}
            </AdminDataRow>
            <AdminDataRow label="Sweep recipient">
              {shortAddress(protocol?.airdropManager?.admin ?? ADMIN_ADDRESS)}
            </AdminDataRow>
          </AdminDataTable>
        </AdminBlock>

        {canWithdrawTreasury ? (
          <AdminBlock title="Withdraw">
            <table className="admin-grid">
              <tbody>
                <tr>
                  <th scope="row">Type</th>
                  <td colSpan={2}>
                    <button
                      type="button"
                      className="admin-btn mr-2"
                      onClick={() => setWithdrawMode("bnb")}
                    >
                      BNB {withdrawMode === "bnb" ? "●" : ""}
                    </button>
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={() => setWithdrawMode("token")}
                    >
                      Token {withdrawMode === "token" ? "●" : ""}
                    </button>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Recipient</th>
                  <td colSpan={2}>
                    <input
                      type="text"
                      value={withdrawTo}
                      onChange={(e) => setWithdrawTo(e.target.value)}
                      className="admin-input admin-num"
                    />
                  </td>
                </tr>
                {withdrawMode === "bnb" ? (
                  <>
                    <tr>
                      <th scope="row">Amount BNB</th>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          className="admin-input admin-num"
                        />
                      </td>
                      <td>
                        <AdminBtn onClick={fillMaxTreasuryBnb} disabled={!treasuryLiveBalance?.value}>
                          Max
                        </AdminBtn>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Available</th>
                      <td colSpan={2}>
                        <AdminNum>{formatBnb(treasuryBnb)} BNB</AdminNum>
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <th scope="row">Token contract</th>
                      <td colSpan={2}>
                        <input
                          type="text"
                          value={withdrawTokenAddress}
                          onChange={(e) => setWithdrawTokenAddress(e.target.value)}
                          className="admin-input admin-num"
                        />
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Amount</th>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={withdrawTokenAmount}
                          onChange={(e) => setWithdrawTokenAmount(e.target.value)}
                          className="admin-input admin-num"
                        />
                      </td>
                      <td>
                        <AdminBtn
                          onClick={fillMaxTreasuryToken}
                          disabled={treasuryTokenBalance == null || treasuryTokenBalance === 0n}
                        >
                          Max
                        </AdminBtn>
                      </td>
                    </tr>
                  </>
                )}
                <tr>
                  <th scope="row">Action</th>
                  <td colSpan={2}>
                    <AdminBtn
                      onClick={
                        withdrawMode === "bnb" ? onWithdrawTreasuryBnb : onWithdrawTreasuryToken
                      }
                      disabled={adminTxPending}
                    >
                      {adminTxPending ? "Withdrawing…" : "Withdraw"}
                    </AdminBtn>
                  </td>
                </tr>
              </tbody>
            </table>
            {adminTxHash && !sweepingId ? (
              <p className="admin-note">
                Tx{" "}
                <a href={explorerTxUrl(adminTxHash)} target="_blank" rel="noopener noreferrer" className="admin-link admin-num">
                  {shortAddress(adminTxHash)}
                </a>
              </p>
            ) : null}
          </AdminBlock>
        ) : isAdmin ? (
          <p className="admin-note">
            Withdrawals require treasury owner ({shortAddress(treasuryOwner ?? ADMIN_ADDRESS)}).
          </p>
        ) : null}
      </AdminTabPanel>

      <AdminTabPanel id="airdrops" active={activeTab}>
        <AdminBlock
          title="Airdrop sweeps"
          actions={
            <AdminBtn onClick={() => void load()} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </AdminBtn>
          }
        >
          {loading ? (
            <p className="admin-empty">Loading…</p>
          ) : airdrops.length === 0 ? (
            <AdminEmptyState title="No airdrops" />
          ) : (
            <>
              {readySweeps.length > 0 ? (
                <p className="admin-note">
                  {readySweeps.length} ready to sweep
                  {sweepStats.remainingUsd != null
                    ? ` · ${formatUsdReadable(sweepStats.remainingUsd, { compact: true })}`
                    : ""}
                </p>
              ) : null}
              <AdminGridTable>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Campaign</th>
                    <th>Symbol</th>
                    <th>Reward pool</th>
                    <th>Claimed</th>
                    <th>Remaining</th>
                    <th>Claim until</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {airdrops.map((row) => (
                    <tr key={row.id}>
                      <td className="admin-num">{row.onChainId}</td>
                      <td>
                        <Link href={`/airdrops/${row.id}`} className="admin-link">
                          {row.title ?? row.linkedSymbol ?? `#${row.id}`}
                        </Link>
                      </td>
                      <td>{row.linkedSymbol ? `$${row.linkedSymbol}` : "—"}</td>
                      <td>
                        <AdminRewardText
                          amount={row.totalFunded}
                          rewardToken={row.rewardToken}
                          rewardSymbol={row.rewardSymbol}
                          rewardPriceBnb={row.rewardPriceBnb}
                          bnbUsd={bnbUsd}
                        />
                      </td>
                      <td>
                        <AdminRewardText
                          amount={row.totalClaimedBnb}
                          rewardToken={row.rewardToken}
                          rewardSymbol={row.rewardSymbol}
                          rewardPriceBnb={row.rewardPriceBnb}
                          bnbUsd={bnbUsd}
                        />
                      </td>
                      <td>
                        <AdminRewardText
                          amount={row.remainingBnb}
                          rewardToken={row.rewardToken}
                          rewardSymbol={row.rewardSymbol}
                          rewardPriceBnb={row.rewardPriceBnb}
                          bnbUsd={bnbUsd}
                        />
                      </td>
                      <td className="admin-num">
                        {row.claimEnd ? formatQualifyDateTime(row.claimEnd) : "—"}
                      </td>
                      <td className={sweepStatusClass(row.sweepStatus)}>
                        {sweepStatusLabel(row.sweepStatus)}
                      </td>
                      <td>
                        {row.canSweep ? (
                          <AdminBtn
                            onClick={() => onSweep(row)}
                            disabled={adminTxPending && sweepingId === row.onChainId}
                          >
                            {adminTxPending && sweepingId === row.onChainId ? "…" : "Sweep"}
                          </AdminBtn>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdminGridTable>
              {adminTxHash && sweepingId ? (
                <p className="admin-note">
                  Last sweep tx{" "}
                  <a
                    href={explorerTxUrl(adminTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-link admin-num"
                  >
                    {shortAddress(adminTxHash)}
                  </a>
                </p>
              ) : null}
            </>
          )}
        </AdminBlock>
      </AdminTabPanel>

      <AdminTabPanel id="promo" active={activeTab}>
        <AdminBlock
          title="New promo task"
          actions={
            <AdminBtn onClick={() => void loadPromoTasks()} disabled={promoLoading}>
              {promoLoading ? "…" : "Refresh"}
            </AdminBtn>
          }
        >
          <table className="admin-grid">
            <tbody>
              <tr>
                <th scope="row">Title</th>
                <td colSpan={2}>
                  <input
                    type="text"
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    className="admin-input"
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">Description</th>
                <td colSpan={2}>
                  <input
                    type="text"
                    value={promoDescription}
                    onChange={(e) => setPromoDescription(e.target.value)}
                    className="admin-input"
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">Points</th>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={promoPoints}
                    onChange={(e) => setPromoPoints(e.target.value)}
                    className="admin-input admin-num"
                  />
                </td>
                <td rowSpan={2} className="align-middle">
                  <AdminBtn
                    onClick={() => void onCreatePromoTask()}
                    disabled={
                      promoSaving || !promoTitle.trim() || !promoUrl.trim() || !promoPoints.trim()
                    }
                  >
                    {promoSaving ? "…" : "Create"}
                  </AdminBtn>
                </td>
              </tr>
              <tr>
                <th scope="row">URL</th>
                <td>
                  <input
                    type="url"
                    value={promoUrl}
                    onChange={(e) => setPromoUrl(e.target.value)}
                    className="admin-input"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </AdminBlock>

        <AdminBlock title="Promo tasks">
          {promoLoading ? (
            <p className="admin-empty">Loading…</p>
          ) : promoTasks.length === 0 ? (
            <AdminEmptyState title="No promo tasks" />
          ) : (
            <AdminGridTable>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Description</th>
                  <th>URL</th>
                  <th>Points</th>
                  <th>Completions</th>
                  <th>Active</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {promoTasks.map((task) => (
                  <tr key={task.taskKey}>
                    <td>{task.title}</td>
                    <td>{task.description ?? "—"}</td>
                    <td>
                      <a
                        href={task.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-link"
                      >
                        {task.targetUrl}
                      </a>
                    </td>
                    <td className="admin-num">{task.rewardPoints}</td>
                    <td className="admin-num">{task.completionCount}</td>
                    <td>{task.isActive ? "Yes" : "No"}</td>
                    <td>
                      <AdminBtn
                        onClick={() => void onDeletePromoTask(task.taskKey, task.title)}
                        disabled={deletingKey === task.taskKey}
                      >
                        {deletingKey === task.taskKey ? "…" : "Delete"}
                      </AdminBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminGridTable>
          )}
        </AdminBlock>
      </AdminTabPanel>

      <AdminTabPanel id="contracts" active={activeTab}>
        <AdminBlock title="Contracts">
          <AdminDataTable>
            {[
              ["MemeFactory", protocol?.memeFactory.address ?? contracts.memeFactory],
              ["BondingCurve", protocol?.bondingCurveManager.address ?? contracts.bondingCurveManager],
              [
                "AirdropManager",
                protocol?.airdropManager?.address ?? contracts.airdropManager ?? "—",
              ],
            ].map(([label, addr]) => (
              <AdminDataRow key={label} label={String(label)}>
                {addr && addr !== "—" ? (
                  <a
                    href={explorerAddressUrl(String(addr))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-link admin-num"
                  >
                    {shortAddress(String(addr))}
                  </a>
                ) : (
                  "—"
                )}
              </AdminDataRow>
            ))}
          </AdminDataTable>
        </AdminBlock>
      </AdminTabPanel>
    </AdminShell>
  );
}
