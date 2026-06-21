"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, isAddress, parseEther } from "viem";
import {
  useAccount,
  useBalance,
  useDisconnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ADMIN_ADDRESS } from "@/config/admin";
import { adminApiUrl } from "@/lib/admin-api-client";
import { contracts, explorerAddressUrl, explorerTxUrl, pumpChain, shortAddress } from "@/config/chain";
import { erc20Abi } from "@/lib/abis/erc20";
import { launchpadTreasuryAbi } from "@/lib/abis/launchpad-treasury";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import {
  airdropRewardAmountUsd,
  formatAirdropReward,
  formatCountdownMs,
  formatQualifyDateTime,
} from "@/lib/airdrop-board-format";
import { AdminAirdropCreateFeeModal } from "@/components/admin/AdminAirdropCreateFeeModal";
import { AdminCreatorShareModal } from "@/components/admin/AdminCreatorShareModal";
import { AdminReferrerShareModal } from "@/components/admin/AdminReferrerShareModal";
import { AdminMemeCreateFeeModal } from "@/components/admin/AdminMemeCreateFeeModal";
import { AdminMinInitialBuyModal } from "@/components/admin/AdminMinInitialBuyModal";
import { AdminFeeExemptModal } from "@/components/admin/AdminFeeExemptModal";
import { AdminProtocolFeeModal } from "@/components/admin/AdminProtocolFeeModal";
import { AdminSystemHealth } from "@/components/admin/AdminSystemHealth";
import { AdminPortfolioTab } from "@/components/admin/AdminPortfolioTab";
import {
  AdminAlert,
  AdminBlock,
  AdminBtn,
  AdminContentGrid,
  AdminDataRow,
  AdminDataTable,
  AdminEmptyState,
  AdminField,
  AdminGridTable,
  AdminKpiCard,
  AdminKpiGrid,
  AdminLayout,
  AdminNum,
  AdminShell,
  AdminTabPanel,
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
import { BnbLogo } from "@/components/token/BnbLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";

type ProtocolSnapshot = {
  memeFactory: {
    address: string;
    owner: string;
    treasury: string;
    createFeeBnb: string;
    minInitialBuyBnb: string;
  };
  bondingCurveManager: {
    address: string;
    owner: string;
    treasury: string;
    protocolFeeBps: number;
    creatorFeeShareBps: number;
    referrerShareBps: number;
    contractBalanceBnb: string;
    emergencyHalt: boolean;
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
  claimEndUnix: number;
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
    case "claim_window_open_no_winners":
      return "No winners";
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
    <span className="inline-flex items-center gap-1.5 admin-num">
      {isBnb ? (
        <BnbLogo size={14} />
      ) : (
        <TokenAvatar
          address={rewardToken}
          symbol={rewardSymbol ?? "?"}
          size={14}
        />
      )}
      <span>
        {text}
        {usd != null ? <span className="admin-meta"> · {formatUsdReadable(usd, { compact: true })}</span> : null}
      </span>
    </span>
  );
}

function sweepStatusClass(status: string): string {
  switch (status) {
    case "ready":
      return "admin-status-ok";
    case "claim_window_open":
    case "claim_window_open_no_winners":
      return "admin-status-warn";
    case "down":
      return "admin-status-bad";
    default:
      return "";
  }
}

function AdminSweepCountdown({
  claimEndUnix,
  canSweep,
  sweepStatus,
}: {
  claimEndUnix: number;
  canSweep: boolean;
  sweepStatus: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (canSweep || sweepStatus === "swept" || sweepStatus === "nothing_to_sweep") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [canSweep, sweepStatus]);

  if (sweepStatus === "swept" || sweepStatus === "nothing_to_sweep") {
    return <span className="admin-meta">—</span>;
  }

  if (canSweep || !claimEndUnix) {
    const ready = canSweep || (claimEndUnix > 0 && claimEndUnix * 1000 <= nowMs);
    if (ready) {
      return <span className="admin-status-ok text-caption font-semibold">Ready now</span>;
    }
  }

  if (!claimEndUnix) {
    return <span className="admin-meta">Unknown</span>;
  }

  const ms = claimEndUnix * 1000 - nowMs;
  if (ms <= 0) {
    return <span className="admin-status-ok text-caption font-semibold">Ready now</span>;
  }

  return (
    <div className="space-y-0.5">
      <p className="financial-value text-caption font-semibold text-pump-warning">
        in {formatCountdownMs(ms)}
      </p>
      <p className="text-[10px] leading-tight text-pump-muted">on-chain claimEnd</p>
    </div>
  );
}

export function AdminPanel() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { bnbUsd } = useBnbUsdPrice();
  const [protocol, setProtocol] = useState<ProtocolSnapshot | null>(null);
  const [airdrops, setAirdrops] = useState<SweepRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweepingId, setSweepingId] = useState<string | null>(null);
  const [bondingEmergencySweepPending, setBondingEmergencySweepPending] = useState(false);
  const [emergencySweepTo, setEmergencySweepTo] = useState("");
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
  const [minInitialBuyModalOpen, setMinInitialBuyModalOpen] = useState(false);
  const [feeExemptModalOpen, setFeeExemptModalOpen] = useState(false);
  const [minInitialBuyBnb, setMinInitialBuyBnb] = useState("0");
  const [platformSettingsLoading, setPlatformSettingsLoading] = useState(true);
  const [airdropCreateFeeModalOpen, setAirdropCreateFeeModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTabId>("dashboard");
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const treasuryContract = protocol?.treasury.address as `0x${string}` | undefined;
  const treasuryOwner = protocol?.treasury.owner;
  const bondingOwner = protocol?.bondingCurveManager.owner;

  const canWithdrawTreasury =
    Boolean(address) &&
    Boolean(treasuryContract) &&
    treasuryOwner != null &&
    address!.toLowerCase() === treasuryOwner.toLowerCase();

  const canEmergencySweepBonding =
    Boolean(address) &&
    Boolean(contracts.bondingCurveManager) &&
    bondingOwner != null &&
    address!.toLowerCase() === bondingOwner.toLowerCase();
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
      const res = await fetch(adminApiUrl("/api/admin/tasks", address), { cache: "no-store" });
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
      const res = await fetch(adminApiUrl("/api/admin/stats", address), { cache: "no-store" });
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
    setPlatformSettingsLoading(true);
    try {
      if (!address) return;
      const res = await fetch(adminApiUrl("/api/admin/overview", address), { cache: "no-store" });
      const json = (await res.json()) as {
        data?: { protocol: ProtocolSnapshot; airdrops: SweepRow[] };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load admin data");
      setProtocol(json.data?.protocol ?? null);
      setAirdrops(json.data?.airdrops ?? []);
      setMinInitialBuyBnb(json.data?.protocol?.memeFactory.minInitialBuyBnb ?? "0");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
      setPlatformSettingsLoading(false);
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

    if (bondingEmergencySweepPending) {
      setBondingEmergencySweepPending(false);
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
    bondingEmergencySweepPending,
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

  useEffect(() => {
    if (treasuryContract && !emergencySweepTo) {
      setEmergencySweepTo(treasuryContract);
    }
  }, [treasuryContract, emergencySweepTo]);

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

  function onEmergencySweepBonding() {
    if (!canEmergencySweepBonding || !contracts.bondingCurveManager) return;

    const to = emergencySweepTo.trim();
    if (!isAddress(to)) {
      setError("Enter a valid emergency sweep recipient");
      return;
    }

    const balanceBnb = protocol?.bondingCurveManager.contractBalanceBnb ?? "0";
    if (Number(balanceBnb) <= 0) {
      setError("Bonding curve has no BNB balance to sweep");
      return;
    }

    const confirmed = window.confirm(
      `EMERGENCY: Sweep ALL ${balanceBnb} BNB from BondingCurveManager to ${to}? All curve trading will halt immediately.`
    );
    if (!confirmed) return;

    setError(null);
    setBondingEmergencySweepPending(true);
    writeContract({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "emergencySweepAllBnb",
      args: [to as `0x${string}`],
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
      const res = await fetch(adminApiUrl("/api/admin/tasks", address), {
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
      const res = await fetch(adminApiUrl("/api/admin/tasks", address), {
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
  const pendingSweeps = useMemo(
    () =>
      airdrops.filter(
        (row) =>
          !row.canSweep &&
          row.sweepStatus !== "swept" &&
          row.sweepStatus !== "nothing_to_sweep" &&
          Number(row.remainingBnb) > 0
      ),
    [airdrops]
  );
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
      {address ? (
        <AdminMinInitialBuyModal
          open={minInitialBuyModalOpen}
          onClose={() => setMinInitialBuyModalOpen(false)}
          currentMinBnb={minInitialBuyBnb}
          adminAddress={address}
          onUpdated={() => void load()}
        />
      ) : null}
      <AdminFeeExemptModal
        open={feeExemptModalOpen}
        onClose={() => setFeeExemptModalOpen(false)}
      />
      <AdminAirdropCreateFeeModal
        open={airdropCreateFeeModalOpen}
        onClose={() => setAirdropCreateFeeModalOpen(false)}
        currentFeeBnb={protocol?.airdropManager?.createFeeBnb ?? "0"}
        airdropAdmin={airdropAdmin ?? ADMIN_ADDRESS}
        onUpdated={() => void load()}
      />

      <AdminLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        address={address}
        onRefreshAll={() => void refreshAll()}
        refreshing={loading || statsLoading || promoLoading}
        headerActions={
          <button type="button" className="admin-btn" onClick={() => disconnect()}>
            Disconnect
          </button>
        }
      >
        {error ? <AdminAlert>{error}</AdminAlert> : null}

        <AdminTabPanel id="dashboard" active={activeTab}>
          <AdminKpiGrid>
            <AdminKpiCard
              label="Users registered"
              value={statsLoading && !stats ? "…" : (stats?.usersRegistered ?? "—")}
              hint={
                stats
                  ? `+${stats.usersRegistered24h} last 24h · ${stats.usersTraded} traded`
                  : "All app profiles"
              }
            />
            <AdminKpiCard
              label="Trades (24h)"
              value={statsLoading && !stats ? "…" : (stats?.trades24h ?? "—")}
              hint={stats ? `${stats.totalTrades} total indexed` : undefined}
            />
            <AdminKpiCard
              label="Treasury balance"
              value={
                statsLoading && !stats ? (
                  "…"
                ) : stats ? (
                  <BnbAmountWithUsd bnb={stats.treasuryBalanceBnb} bnbUsd={bnbUsd} inline />
                ) : (
                  "—"
                )
              }
              hint={
                stats
                  ? `${formatUsdReadable(bnbToUsd(Number(stats.availableTotalBnb), bnbUsd) ?? 0, { compact: true })} available est.`
                  : undefined
              }
            />
            <AdminKpiCard
              label="Ready to sweep"
              value={sweepStats.readyCount}
              hint={
                sweepStats.remainingUsd != null
                  ? `${formatUsdReadable(sweepStats.remainingUsd, { compact: true })} recoverable`
                  : `${airdrops.length} campaigns tracked`
              }
              tone={sweepStats.readyCount > 0 ? "warn" : undefined}
            />
          </AdminKpiGrid>

          <AdminSystemHealth />

          <AdminContentGrid columns={2}>
            <AdminBlock title="Platform activity">
          <AdminDataTable>
            <AdminDataRow label="Tokens launched" loading={statsLoading && !stats}>
              <AdminNum>{stats?.totalTokens ?? "—"}</AdminNum>
              {stats ? <span className="admin-meta"> · {stats.tokensToday} today UTC</span> : null}
            </AdminDataRow>
            <AdminDataRow label="Airdrops launched" loading={statsLoading && !stats}>
              <AdminNum>{stats?.totalAirdrops ?? "—"}</AdminNum>
              {stats ? <span className="admin-meta"> · {stats.airdropsToday} today UTC</span> : null}
            </AdminDataRow>
            <AdminDataRow label="Users (registered)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.usersRegistered ?? "—"}</AdminNum>
            </AdminDataRow>
            <AdminDataRow label="Users (traded)" loading={statsLoading && !stats}>
              <AdminNum>{stats?.usersTraded ?? "—"}</AdminNum>
              {stats ? <span className="admin-meta"> · ≥1 trade</span> : null}
            </AdminDataRow>
          </AdminDataTable>
            </AdminBlock>

            <AdminBlock title="Fee summary">
          <AdminDataTable>
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
            <AdminDataRow label="Claimed (total)" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.claimedTotalBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Treasury share (trades)" loading={statsLoading && !stats}>
              {stats ? (
                <BnbAmountWithUsd bnb={stats.treasuryShareFromTradesBnb} bnbUsd={bnbUsd} inline />
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Airdrop escrow" loading={loading && !protocol}>
              <BnbAmountWithUsd bnb={escrowBnb} bnbUsd={bnbUsd} inline />
            </AdminDataRow>
          </AdminDataTable>
          {stats?.feesNote ? <p className="admin-note">{stats.feesNote}</p> : null}
            </AdminBlock>
          </AdminContentGrid>
        </AdminTabPanel>

      <AdminTabPanel id="portfolio" active={activeTab}>
        {address ? (
          <AdminPortfolioTab address={address} />
        ) : (
          <AdminEmptyState title="Connect MetaMask to view portfolio holdings." />
        )}
      </AdminTabPanel>

      <AdminTabPanel id="treasury" active={activeTab}>
        <AdminContentGrid columns={2}>
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
                  <span className="admin-meta"> · on-chain · owner free</span>
                </>
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow
              label="Min initial buy"
              loading={platformSettingsLoading}
              action={
                <AdminTextButton onClick={() => setMinInitialBuyModalOpen(true)}>Edit</AdminTextButton>
              }
            >
              {formatBnb(minInitialBuyBnb)} BNB
              <span className="admin-meta"> · on-chain · MemeFactory</span>
            </AdminDataRow>
            <AdminDataRow
              label="Create fee exemption"
              action={
                <AdminTextButton onClick={() => setFeeExemptModalOpen(true)}>Manage</AdminTextButton>
              }
            >
              On-chain <span className="admin-meta"> · MemeFactory + AirdropManager</span>
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
                  <span className="admin-meta"> · on-chain · admin free</span>
                </>
              ) : (
                "—"
              )}
            </AdminDataRow>
          </AdminDataTable>
        </AdminBlock>

        <AdminBlock title="Treasury balances">
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
                <>
                  <BnbAmountWithUsd
                    bnb={protocol.bondingCurveManager.contractBalanceBnb}
                    bnbUsd={bnbUsd}
                    inline
                  />
                  {protocol.bondingCurveManager.emergencyHalt ? (
                    <span className="admin-meta"> · trading halted</span>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </AdminDataRow>
            <AdminDataRow label="Bonding curve owner">
              {shortAddress(bondingOwner ?? ADMIN_ADDRESS)}
            </AdminDataRow>
            {canEmergencySweepBonding ? (
              <AdminDataRow
                label="Emergency curve sweep"
                action={
                  <AdminBtn
                    onClick={onEmergencySweepBonding}
                    disabled={adminTxPending && bondingEmergencySweepPending}
                  >
                    {adminTxPending && bondingEmergencySweepPending ? "…" : "Sweep all BNB"}
                  </AdminBtn>
                }
              >
                <input
                  type="text"
                  value={emergencySweepTo}
                  onChange={(e) => setEmergencySweepTo(e.target.value)}
                  className="admin-input admin-num"
                  placeholder="Recipient (treasury)"
                  aria-label="Emergency sweep recipient"
                />
                <span className="admin-meta"> · halts all trading</span>
              </AdminDataRow>
            ) : null}
            <AdminDataRow label="Sweep recipient">
              {shortAddress(protocol?.airdropManager?.admin ?? ADMIN_ADDRESS)}
            </AdminDataRow>
          </AdminDataTable>
        </AdminBlock>
        </AdminContentGrid>

        {canWithdrawTreasury ? (
          <AdminBlock title="Withdraw from treasury">
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
        ) : (
          <p className="admin-note">
            Withdrawals require treasury owner ({shortAddress(treasuryOwner ?? ADMIN_ADDRESS)}).
          </p>
        )}
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
              <p className="admin-note">
                Sweep unlocks when on-chain <span className="admin-num">claimEnd</span> passes
                (qualify end + 24h). Finalize is not required if there are no winners.
              </p>
              {readySweeps.length > 0 ? (
                <p className="admin-note">
                  {readySweeps.length} ready to sweep
                  {sweepStats.remainingUsd != null
                    ? ` · ${formatUsdReadable(sweepStats.remainingUsd, { compact: true })}`
                    : ""}
                </p>
              ) : null}
              {pendingSweeps.length > 0 ? (
                <p className="admin-note admin-status-warn">
                  {pendingSweeps.length} campaign{pendingSweeps.length === 1 ? "" : "s"} locked
                  until claim window ends — see countdown below.
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
                    <th>Sweep in</th>
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
                        <div className="space-y-0.5">
                          <p>
                            {row.claimEndUnix
                              ? formatQualifyDateTime(new Date(row.claimEndUnix * 1000).toISOString())
                              : row.claimEnd
                                ? formatQualifyDateTime(row.claimEnd)
                                : "—"}
                          </p>
                          {row.sweepStatus === "claim_window_open_no_winners" ? (
                            <p className="text-[10px] leading-tight text-pump-muted">
                              No claims possible
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <AdminSweepCountdown
                          claimEndUnix={row.claimEndUnix}
                          canSweep={row.canSweep}
                          sweepStatus={row.sweepStatus}
                        />
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
                        ) : row.sweepStatus === "swept" ? (
                          "Swept"
                        ) : row.sweepStatus === "nothing_to_sweep" ? (
                          "—"
                        ) : (
                          <span className="admin-meta text-caption">Locked</span>
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
          title="Create promo task"
          actions={
            <AdminBtn onClick={() => void loadPromoTasks()} disabled={promoLoading}>
              {promoLoading ? "…" : "Refresh list"}
            </AdminBtn>
          }
        >
          <div className="admin-form-grid" style={{ padding: "16px" }}>
            <AdminField label="Title">
              <input
                type="text"
                value={promoTitle}
                onChange={(e) => setPromoTitle(e.target.value)}
                className="admin-input"
                placeholder="Follow us on X"
              />
            </AdminField>
            <AdminField label="Description (optional)">
              <input
                type="text"
                value={promoDescription}
                onChange={(e) => setPromoDescription(e.target.value)}
                className="admin-input"
                placeholder="Short task description"
              />
            </AdminField>
            <div className="admin-form-row-2">
              <AdminField label="Reward points">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={promoPoints}
                  onChange={(e) => setPromoPoints(e.target.value)}
                  className="admin-input admin-num"
                />
              </AdminField>
              <AdminField label="Target URL">
                <input
                  type="url"
                  value={promoUrl}
                  onChange={(e) => setPromoUrl(e.target.value)}
                  className="admin-input"
                  placeholder="https://…"
                />
              </AdminField>
            </div>
            <div>
              <AdminBtn
                primary
                onClick={() => void onCreatePromoTask()}
                disabled={
                  promoSaving || !promoTitle.trim() || !promoUrl.trim() || !promoPoints.trim()
                }
              >
                {promoSaving ? "Creating…" : "Create task"}
              </AdminBtn>
            </div>
          </div>
        </AdminBlock>

        <AdminBlock title="Active promo tasks">
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
        <AdminBlock title="UUPS proxies">
          <p className="admin-card-note admin-note">
            Proxy addresses in <code className="admin-num">.env</code> and{" "}
            <code className="admin-num">contract_registry</code> — upgrades swap implementation only.
          </p>
          <AdminDataTable>
            {[
              ["MemeFactory", protocol?.memeFactory.address ?? contracts.memeFactory],
              ["BondingCurveManager", protocol?.bondingCurveManager.address ?? contracts.bondingCurveManager],
              [
                "PumpAirdropManager",
                protocol?.airdropManager?.address ?? contracts.airdropManager ?? "—",
              ],
              ["LaunchpadTreasury", protocol?.treasury.address ?? treasuryContract ?? "—"],
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
      </AdminLayout>
    </AdminShell>
  );
}
