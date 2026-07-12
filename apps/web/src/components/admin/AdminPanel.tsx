"use client";

import Link from "next/link";
import { PumpIcon, faClock } from "@/lib/icons";
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
import { adminFetch, readAdminJson } from "@/lib/admin-api-client";
import { WIPE_DATA_CONFIRMATION_PHRASE } from "@/lib/admin/wipe-data.constants";
import { adminSignOut } from "@/lib/admin/auth-client";
import { ADMIN_COPY } from "@/lib/admin/copy";
import { contracts, explorerAddressUrl, explorerTxUrl, pumpChain, shortAddress } from "@/config/chain";
import { erc20Abi } from "@/lib/abis/erc20";
import { launchpadTreasuryAbi } from "@/lib/abis/launchpad-treasury";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import {
  airdropRewardAmountUsd,
} from "@/lib/airdrop-board-format";
import { AdminAirdropCreateFeeModal } from "@/components/admin/AdminAirdropCreateFeeModal";
import { AdminAirdropSweepTable, type SweepRow } from "@/components/admin/AdminAirdropSweepTable";
import { AdminCreatorShareModal } from "@/components/admin/AdminCreatorShareModal";
import { AdminReferrerShareModal } from "@/components/admin/AdminReferrerShareModal";
import { AdminMemeCreateFeeModal } from "@/components/admin/AdminMemeCreateFeeModal";
import { AdminMinInitialBuyModal } from "@/components/admin/AdminMinInitialBuyModal";
import { AdminFeeExemptModal } from "@/components/admin/AdminFeeExemptModal";
import { AdminProtocolFeeModal } from "@/components/admin/AdminProtocolFeeModal";
import { AdminEnvTab } from "@/components/admin/AdminEnvTab";
import { AdminDataWipeCard } from "@/components/admin/AdminDataWipeCard";
import { AdminTodosTab } from "@/components/admin/AdminTodosTab";
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
  AdminKpiSkeleton,
  AdminLayout,
  AdminNum,
  AdminPageGrid,
  AdminPageGridCell,
  AdminShell,
  AdminStatusBadge,
  AdminTabPanel,
  useAdminShell,
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
};

function formatBnb(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n >= 1) return n.toFixed(4);
  if (n > 0) return n.toFixed(6);
  return "0";
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
  const [bondingResumePending, setBondingResumePending] = useState(false);
  const [curveRecoverResetDb, setCurveRecoverResetDb] = useState(true);
  const [curveRecoverSuccess, setCurveRecoverSuccess] = useState<string | null>(null);
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
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const { globalQuery, setGlobalQuery } = useAdminShell();

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
  const opsWallet = treasuryOwner ?? ADMIN_ADDRESS;
  const opsWalletsUnified = useMemo(() => {
    const wallets = [treasuryOwner, bondingOwner, airdropAdmin]
      .filter(Boolean)
      .map((w) => w!.toLowerCase());
    if (wallets.length <= 1) return true;
    return wallets.every((w) => w === wallets[0]);
  }, [treasuryOwner, bondingOwner, airdropAdmin]);

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
      const res = await adminFetch("/api/admin/tasks", { cache: "no-store" });
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
      const res = await adminFetch("/api/admin/stats", { cache: "no-store" });
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
      const res = await adminFetch("/api/admin/overview", { cache: "no-store" });
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

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadStats(), loadPromoTasks()]);
    setLastRefreshedAt(new Date());
  }, [load, loadStats, loadPromoTasks]);

  useEffect(() => {
    void load();
    void loadStats();
    void loadPromoTasks();
    setLastRefreshedAt(new Date());
  }, [load, loadStats, loadPromoTasks]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshAll();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refreshAll]);

  useEffect(() => {
    if (!adminTxDone) return;

    if (sweepingId) {
      setSweepingId(null);
      void load();
      return;
    }

    if (bondingEmergencySweepPending) {
      setBondingEmergencySweepPending(false);
      resetAdminTx();
      resumeCurveTrading();
      return;
    }

    if (bondingResumePending) {
      setBondingResumePending(false);
      resetAdminTx();
      void finishCurveRecovery();
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
    bondingResumePending,
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

  async function wipeAppDataForFreshStart(): Promise<string | null> {
    try {
      const res = await adminFetch("/api/admin/wipe-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: WIPE_DATA_CONFIRMATION_PHRASE }),
      });
      const json = await readAdminJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Wipe failed");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Wipe failed";
    }
  }

  async function finishCurveRecovery() {
    setError(null);
    let successMessage: string = ADMIN_COPY.treasury.curveRecovery.success;

    if (curveRecoverResetDb) {
      const wipeError = await wipeAppDataForFreshStart();
      if (wipeError) {
        setError(`${ADMIN_COPY.treasury.curveRecovery.wipeFailed} ${wipeError}`);
        successMessage = ADMIN_COPY.treasury.curveRecovery.success;
      } else {
        successMessage = ADMIN_COPY.treasury.curveRecovery.successWithWipe;
      }
    }

    setCurveRecoverSuccess(successMessage);
    void refetchTreasuryBalance();
    void load();
    void loadStats();
  }

  function resumeCurveTrading() {
    if (!canEmergencySweepBonding || !contracts.bondingCurveManager) return;

    setError(null);
    setBondingResumePending(true);
    writeContract({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "setEmergencyHalt",
      args: [false],
      chainId: pumpChain.id,
    });
  }

  function onRecoverCurveEscrow() {
    if (!canEmergencySweepBonding || !contracts.bondingCurveManager) return;

    const to = emergencySweepTo.trim();
    if (!isAddress(to)) {
      setError("Enter a valid recovery recipient address");
      return;
    }

    const balanceBnb = protocol?.bondingCurveManager.contractBalanceBnb ?? "0";
    const balanceNum = Number(balanceBnb);
    const halted = protocol?.bondingCurveManager.emergencyHalt ?? false;

    if (balanceNum <= 0) {
      if (!halted) {
        setError("Curve escrow is already empty and trading is active.");
        return;
      }
      onResumeCurveTradingOnly();
      return;
    }

    const confirmTemplate = curveRecoverResetDb
      ? ADMIN_COPY.treasury.curveRecovery.confirmSweepWithWipe
      : ADMIN_COPY.treasury.curveRecovery.confirmSweep;
    const confirmed = window.confirm(
      confirmTemplate.replace("{amount}", balanceBnb).replace("{to}", to)
    );
    if (!confirmed) return;

    setError(null);
    setCurveRecoverSuccess(null);
    setBondingEmergencySweepPending(true);
    writeContract({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "emergencySweepAllEth",
      args: [to as `0x${string}`],
      chainId: pumpChain.id,
    });
  }

  function onResumeCurveTradingOnly() {
    if (!canEmergencySweepBonding || !contracts.bondingCurveManager) return;
    if (!protocol?.bondingCurveManager.emergencyHalt) {
      setError("Curve trading is already active.");
      return;
    }

    const confirmTemplate = curveRecoverResetDb
      ? ADMIN_COPY.treasury.curveRecovery.confirmResumeWithWipe
      : ADMIN_COPY.treasury.curveRecovery.confirmResume;
    if (!window.confirm(confirmTemplate)) return;

    setError(null);
    setCurveRecoverSuccess(null);
    resumeCurveTrading();
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
      const res = await adminFetch("/api/admin/tasks", {
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
      const res = await adminFetch("/api/admin/tasks", {
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
          <button
            type="button"
            className="admin-btn"
            onClick={() => {
              void adminSignOut();
              disconnect();
            }}
          >
            {ADMIN_COPY.auth.disconnect}
          </button>
        }
      >
        {error ? <AdminAlert>{error}</AdminAlert> : null}

        <AdminTabPanel id="dashboard" active={activeTab}>
          <AdminPageGrid>
            <AdminPageGridCell span={12}>
              {statsLoading && !stats ? (
                <AdminKpiSkeleton count={6} />
              ) : (
                <AdminKpiGrid columns={6}>
                  <AdminKpiCard
                    label={ADMIN_COPY.dashboard.kpi.users.label}
                    value={<AdminNum>{stats?.usersRegistered ?? "—"}</AdminNum>}
                    trend={
                      stats
                        ? `+${stats.usersRegistered24h} / 24h · ${stats.usersTraded} traded`
                        : ADMIN_COPY.dashboard.kpi.users.hintEmpty
                    }
                  />
                  <AdminKpiCard
                    label={ADMIN_COPY.dashboard.kpi.trades24h.label}
                    value={<AdminNum>{stats?.trades24h ?? "—"}</AdminNum>}
                    trend={
                      stats
                        ? `${stats.totalTrades} total indexed`
                        : ADMIN_COPY.dashboard.kpi.trades24h.hintEmpty
                    }
                  />
                  <AdminKpiCard
                    label={ADMIN_COPY.dashboard.kpi.tokens.label}
                    value={<AdminNum>{stats?.totalTokens ?? "—"}</AdminNum>}
                    trend={
                      stats
                        ? `+${stats.tokensToday} today UTC · ${stats.totalAirdrops} airdrops`
                        : ADMIN_COPY.dashboard.kpi.tokens.hintEmpty
                    }
                  />
                  <AdminKpiCard
                    label={ADMIN_COPY.dashboard.kpi.treasury.label}
                    value={
                      stats ? (
                        <BnbAmountWithUsd bnb={stats.treasuryBalanceBnb} bnbUsd={bnbUsd} inline />
                      ) : (
                        "—"
                      )
                    }
                    trend={
                      stats
                        ? `${formatUsdReadable(bnbToUsd(Number(stats.availableTotalBnb), bnbUsd) ?? 0, { compact: true })} available`
                        : ADMIN_COPY.dashboard.kpi.treasury.hintEmpty
                    }
                  />
                  <AdminKpiCard
                    label={ADMIN_COPY.dashboard.kpi.pendingFees.label}
                    value={
                      stats ? (
                        <BnbAmountWithUsd
                          bnb={String(
                            Number(stats.pendingCreatorBnb) + Number(stats.pendingReferrerBnb)
                          )}
                          bnbUsd={bnbUsd}
                          inline
                        />
                      ) : (
                        "—"
                      )
                    }
                    trend={
                      stats
                        ? `Claimed ${formatBnb(stats.claimedTotalBnb)} BNB total`
                        : ADMIN_COPY.dashboard.kpi.pendingFees.hintEmpty
                    }
                  />
                  <AdminKpiCard
                    label={ADMIN_COPY.dashboard.kpi.sweeps.label}
                    value={<AdminNum>{sweepStats.readyCount}</AdminNum>}
                    trend={
                      sweepStats.remainingUsd != null
                        ? `${formatUsdReadable(sweepStats.remainingUsd, { compact: true })} recoverable`
                        : `${airdrops.length} campaigns`
                    }
                    tone={sweepStats.readyCount > 0 ? "warn" : undefined}
                  />
                </AdminKpiGrid>
              )}
            </AdminPageGridCell>

            <AdminPageGridCell span={12}>
              <p className="admin-ent-sync-line">
                <PumpIcon icon={faClock} className="h-3 w-3" />
                <span className="admin-num">
                  {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : "—"}
                </span>
              </p>
            </AdminPageGridCell>

            <AdminPageGridCell span={4}>
              <AdminSystemHealth />
            </AdminPageGridCell>

            <AdminPageGridCell span={8}>
              <AdminBlock title={ADMIN_COPY.dashboard.financialPanel}>
                <AdminDataTable>
                  <AdminDataRow label="Treasury share (trades)" loading={statsLoading && !stats}>
                    {stats ? (
                      <BnbAmountWithUsd bnb={stats.treasuryShareFromTradesBnb} bnbUsd={bnbUsd} inline />
                    ) : (
                      "—"
                    )}
                  </AdminDataRow>
                  <AdminDataRow label="Claimed creator" loading={statsLoading && !stats}>
                    {stats ? (
                      <BnbAmountWithUsd bnb={stats.claimedCreatorBnb} bnbUsd={bnbUsd} inline />
                    ) : (
                      "—"
                    )}
                  </AdminDataRow>
                  <AdminDataRow label="Claimed referrer" loading={statsLoading && !stats}>
                    {stats ? (
                      <BnbAmountWithUsd bnb={stats.claimedReferrerBnb} bnbUsd={bnbUsd} inline />
                    ) : (
                      "—"
                    )}
                  </AdminDataRow>
                  <AdminDataRow label="Airdrop escrow" loading={loading && !protocol}>
                    <BnbAmountWithUsd bnb={escrowBnb} bnbUsd={bnbUsd} inline />
                  </AdminDataRow>
                </AdminDataTable>
              </AdminBlock>
            </AdminPageGridCell>

            <AdminPageGridCell span={12}>
              <AdminAirdropSweepTable
                rows={airdrops}
                loading={loading}
                bnbUsd={bnbUsd}
                searchQuery={globalQuery}
                onSearchQueryChange={setGlobalQuery}
                adminTxPending={adminTxPending}
                sweepingId={sweepingId}
                adminTxHash={adminTxHash}
                onSweep={onSweep}
                toolbar={
                  <AdminBtn size="sm" onClick={() => void load()} disabled={loading}>
                    {loading ? "…" : ADMIN_COPY.actions.refreshList}
                  </AdminBtn>
                }
              />
            </AdminPageGridCell>

            <AdminPageGridCell span={12}>
              <AdminDataWipeCard
                onWiped={() => {
                  void load();
                  void loadStats();
                }}
              />
            </AdminPageGridCell>
          </AdminPageGrid>
        </AdminTabPanel>

      <AdminTabPanel id="todos" active={activeTab}>
        {address ? <AdminTodosTab /> : <AdminEmptyState title={ADMIN_COPY.portfolio.empty} />}
      </AdminTabPanel>

      <AdminTabPanel id="portfolio" active={activeTab}>
        {address ? (
          <AdminPortfolioTab address={address} />
        ) : (
          <AdminEmptyState title={ADMIN_COPY.portfolio.empty} />
        )}
      </AdminTabPanel>

      <AdminTabPanel id="treasury" active={activeTab}>
        <AdminContentGrid columns={2}>
        <AdminBlock title={ADMIN_COPY.treasury.feeSettings.title}>
          <AdminDataTable>
            <AdminDataRow
              label="Trade fee"
              loading={!protocol}
              onEdit={protocol ? () => setProtocolFeeModalOpen(true) : undefined}
              editLabel="Edit trade fee"
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
              onEdit={protocol ? () => setCreatorShareModalOpen(true) : undefined}
            >
              {protocol
                ? `${creatorShareBpsToPercent(creatorFeeShareBps).toFixed(2)}% of protocol fee`
                : "—"}
            </AdminDataRow>
            <AdminDataRow
              label="Referrer share"
              loading={!protocol}
              onEdit={protocol ? () => setReferrerShareModalOpen(true) : undefined}
            >
              {protocol
                ? `${referrerShareBpsToPercent(referrerShareBps).toFixed(2)}% of protocol fee`
                : "—"}
            </AdminDataRow>
            <AdminDataRow
              label="Meme launch fee"
              loading={!protocol}
              onEdit={protocol ? () => setMemeCreateFeeModalOpen(true) : undefined}
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
              label="Min initial buy"
              loading={platformSettingsLoading}
              onEdit={() => setMinInitialBuyModalOpen(true)}
            >
              {formatBnb(minInitialBuyBnb)} BNB
            </AdminDataRow>
            <AdminDataRow
              label="Fee exemption"
              onEdit={() => setFeeExemptModalOpen(true)}
              editLabel="Manage exemptions"
            >
              MemeFactory · AirdropManager
            </AdminDataRow>
            <AdminDataRow
              label="Airdrop create fee"
              loading={!protocol?.airdropManager}
              onEdit={
                protocol?.airdropManager ? () => setAirdropCreateFeeModalOpen(true) : undefined
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

        <AdminBlock title={ADMIN_COPY.treasury.balances.title}>
          <AdminDataTable>
            <AdminDataRow label="Treasury">
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
            <AdminDataRow label="Balance">
              <BnbAmountWithUsd bnb={treasuryBnb} bnbUsd={bnbUsd} inline />
            </AdminDataRow>
            <AdminDataRow label="Curve escrow">
              {protocol ? (
                <>
                  <BnbAmountWithUsd
                    bnb={protocol.bondingCurveManager.contractBalanceBnb}
                    bnbUsd={bnbUsd}
                    inline
                  />
                  {protocol.bondingCurveManager.emergencyHalt ? (
                    <span className="admin-meta"> · halted</span>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </AdminDataRow>
            {opsWalletsUnified ? (
              <AdminDataRow label="Owner">
                <a
                  href={explorerAddressUrl(opsWallet)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-link admin-num"
                >
                  {shortAddress(opsWallet)}
                </a>
              </AdminDataRow>
            ) : (
              <>
                <AdminDataRow label="Treasury owner">
                  {shortAddress(treasuryOwner ?? ADMIN_ADDRESS)}
                </AdminDataRow>
                <AdminDataRow label="Curve owner">
                  {shortAddress(bondingOwner ?? ADMIN_ADDRESS)}
                </AdminDataRow>
              </>
            )}
          </AdminDataTable>
          {canEmergencySweepBonding ? (
            <div className="admin-curve-recovery">
              {protocol?.bondingCurveManager.emergencyHalt ? (
                <p className="admin-curve-recovery-status admin-curve-recovery-status--halted">
                  {ADMIN_COPY.treasury.curveRecovery.halted}
                </p>
              ) : Number(protocol?.bondingCurveManager.contractBalanceBnb ?? "0") <= 0 ? (
                <p className="admin-curve-recovery-status">
                  {ADMIN_COPY.treasury.curveRecovery.ready}
                </p>
              ) : null}

              <label className="admin-curve-recovery-check">
                <input
                  type="checkbox"
                  checked={curveRecoverResetDb}
                  onChange={(e) => setCurveRecoverResetDb(e.target.checked)}
                />
                <span>{ADMIN_COPY.treasury.curveRecovery.resetDb}</span>
              </label>

              {Number(protocol?.bondingCurveManager.contractBalanceBnb ?? "0") > 0 ? (
                <label className="admin-curve-recovery-field">
                  <span className="admin-field-label">
                    {ADMIN_COPY.treasury.curveRecovery.recipient}
                  </span>
                  <input
                    type="text"
                    value={emergencySweepTo}
                    onChange={(e) => setEmergencySweepTo(e.target.value)}
                    className="admin-input admin-num"
                    placeholder={ADMIN_COPY.treasury.emergency.recipientPlaceholder}
                    aria-label="Curve recovery recipient"
                  />
                </label>
              ) : null}

              <div className="admin-curve-recovery-actions">
                {Number(protocol?.bondingCurveManager.contractBalanceBnb ?? "0") > 0 ? (
                  <AdminBtn
                    size="sm"
                    onClick={onRecoverCurveEscrow}
                    disabled={adminTxPending && (bondingEmergencySweepPending || bondingResumePending)}
                  >
                    {adminTxPending && bondingEmergencySweepPending
                      ? ADMIN_COPY.treasury.curveRecovery.recovering
                      : adminTxPending && bondingResumePending
                        ? ADMIN_COPY.treasury.curveRecovery.resuming
                        : ADMIN_COPY.treasury.curveRecovery.recoverAndResume}
                  </AdminBtn>
                ) : protocol?.bondingCurveManager.emergencyHalt ? (
                  <AdminBtn
                    size="sm"
                    onClick={onResumeCurveTradingOnly}
                    disabled={adminTxPending && bondingResumePending}
                  >
                    {adminTxPending && bondingResumePending
                      ? ADMIN_COPY.treasury.curveRecovery.resuming
                      : ADMIN_COPY.treasury.curveRecovery.resumeOnly}
                  </AdminBtn>
                ) : null}
              </div>

              <span className="admin-compact-hint">{ADMIN_COPY.treasury.curveRecovery.hint}</span>
              {curveRecoverSuccess ? (
                <p className="admin-curve-recovery-success">{curveRecoverSuccess}</p>
              ) : null}
            </div>
          ) : null}
        </AdminBlock>
        </AdminContentGrid>

        {canWithdrawTreasury ? (
          <AdminBlock title={ADMIN_COPY.treasury.withdraw.title}>
            <div className="admin-compact-form admin-compact-form--withdraw">
              <div className="admin-compact-row">
                <span className="admin-field-label">Type</span>
                <div className="segment-control segment-control--compact">
                  <button
                    type="button"
                    className={
                      withdrawMode === "bnb"
                        ? "chip-button chip-button-active"
                        : "chip-button"
                    }
                    onClick={() => setWithdrawMode("bnb")}
                  >
                    {ADMIN_COPY.treasury.withdraw.typeBnb}
                  </button>
                  <button
                    type="button"
                    className={
                      withdrawMode === "token"
                        ? "chip-button chip-button-active"
                        : "chip-button"
                    }
                    onClick={() => setWithdrawMode("token")}
                  >
                    {ADMIN_COPY.treasury.withdraw.typeToken}
                  </button>
                </div>
              </div>

              <AdminField label={ADMIN_COPY.treasury.withdraw.recipient}>
                <input
                  type="text"
                  value={withdrawTo}
                  onChange={(e) => setWithdrawTo(e.target.value)}
                  className="admin-input admin-num"
                />
              </AdminField>

              {withdrawMode === "bnb" ? (
                <>
                  <AdminField
                    label={ADMIN_COPY.treasury.withdraw.amountBnb}
                    hint={
                      <span className="admin-num">
                        {formatBnb(treasuryBnb)} BNB available
                      </span>
                    }
                  >
                    <div className="admin-input-with-action">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="admin-input admin-num"
                      />
                      <AdminBtn
                        size="sm"
                        onClick={fillMaxTreasuryBnb}
                        disabled={!treasuryLiveBalance?.value}
                      >
                        Max
                      </AdminBtn>
                    </div>
                  </AdminField>
                </>
              ) : (
                <>
                  <AdminField label={ADMIN_COPY.treasury.withdraw.tokenContract}>
                    <input
                      type="text"
                      value={withdrawTokenAddress}
                      onChange={(e) => setWithdrawTokenAddress(e.target.value)}
                      className="admin-input admin-num"
                    />
                  </AdminField>
                  <AdminField label={ADMIN_COPY.treasury.withdraw.amountToken}>
                    <div className="admin-input-with-action">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={withdrawTokenAmount}
                        onChange={(e) => setWithdrawTokenAmount(e.target.value)}
                        className="admin-input admin-num"
                      />
                      <AdminBtn
                        size="sm"
                        onClick={fillMaxTreasuryToken}
                        disabled={treasuryTokenBalance == null || treasuryTokenBalance === 0n}
                      >
                        Max
                      </AdminBtn>
                    </div>
                  </AdminField>
                </>
              )}

              <div className="admin-compact-actions">
                <AdminBtn
                  primary
                  onClick={
                    withdrawMode === "bnb" ? onWithdrawTreasuryBnb : onWithdrawTreasuryToken
                  }
                  disabled={adminTxPending}
                >
                  {adminTxPending ? ADMIN_COPY.actions.withdrawing : ADMIN_COPY.actions.withdraw}
                </AdminBtn>
              </div>
            </div>
            {adminTxHash && !sweepingId ? (
              <p className="admin-note admin-card-note">
                Tx{" "}
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
          </AdminBlock>
        ) : (
          <p className="admin-note">{ADMIN_COPY.treasury.withdraw.ownerRequired}</p>
        )}
      </AdminTabPanel>

      <AdminTabPanel id="airdrops" active={activeTab}>
        <AdminAirdropSweepTable
          title={ADMIN_COPY.airdrops.tableTitle}
          rows={airdrops}
          loading={loading}
          bnbUsd={bnbUsd}
          searchQuery={globalQuery}
          onSearchQueryChange={setGlobalQuery}
          adminTxPending={adminTxPending}
          sweepingId={sweepingId}
          adminTxHash={adminTxHash}
          onSweep={onSweep}
          toolbar={
            <AdminBtn size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? "…" : ADMIN_COPY.actions.refreshList}
            </AdminBtn>
          }
        />
      </AdminTabPanel>

      <AdminTabPanel id="promo" active={activeTab}>
        <AdminBlock
          title={ADMIN_COPY.promo.create.title}
          actions={
            <AdminBtn onClick={() => void loadPromoTasks()} disabled={promoLoading}>
              {promoLoading ? "…" : ADMIN_COPY.actions.refreshList}
            </AdminBtn>
          }
        >
          <div className="admin-form-grid" style={{ padding: "16px" }}>
            <AdminField label={ADMIN_COPY.promo.create.titleField}>
              <input
                type="text"
                value={promoTitle}
                onChange={(e) => setPromoTitle(e.target.value)}
                className="admin-input"
                placeholder={ADMIN_COPY.promo.create.titlePlaceholder}
              />
            </AdminField>
            <AdminField label={ADMIN_COPY.promo.create.descField}>
              <input
                type="text"
                value={promoDescription}
                onChange={(e) => setPromoDescription(e.target.value)}
                className="admin-input"
                placeholder={ADMIN_COPY.promo.create.descPlaceholder}
              />
            </AdminField>
            <div className="admin-form-row-2">
              <AdminField label={ADMIN_COPY.promo.create.pointsField}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={promoPoints}
                  onChange={(e) => setPromoPoints(e.target.value)}
                  className="admin-input admin-num"
                />
              </AdminField>
              <AdminField label={ADMIN_COPY.promo.create.urlField}>
                <input
                  type="url"
                  value={promoUrl}
                  onChange={(e) => setPromoUrl(e.target.value)}
                  className="admin-input"
                  placeholder={ADMIN_COPY.promo.create.urlPlaceholder}
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
                {promoSaving ? "Creating…" : ADMIN_COPY.actions.create}
              </AdminBtn>
            </div>
          </div>
        </AdminBlock>

        <AdminBlock title={ADMIN_COPY.promo.list.title}>
          {promoLoading ? (
            <p className="admin-empty">{ADMIN_COPY.empty.loading}</p>
          ) : promoTasks.length === 0 ? (
            <AdminEmptyState title={ADMIN_COPY.promo.list.empty} />
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
                    <td>
                      <AdminStatusBadge tone={task.isActive ? "ok" : "neutral"}>
                        {task.isActive ? "Active" : "Inactive"}
                      </AdminStatusBadge>
                    </td>
                    <td>
                      <AdminBtn
                        onClick={() => void onDeletePromoTask(task.taskKey, task.title)}
                        disabled={deletingKey === task.taskKey}
                      >
                        {deletingKey === task.taskKey ? "…" : ADMIN_COPY.actions.delete}
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
        <AdminBlock title={ADMIN_COPY.pages.contracts.title}>
          <AdminDataTable>
            {[
              [ADMIN_COPY.contracts.labels.memeFactory, protocol?.memeFactory.address ?? contracts.memeFactory],
              [
                ADMIN_COPY.contracts.labels.bonding,
                protocol?.bondingCurveManager.address ?? contracts.bondingCurveManager,
              ],
              [
                ADMIN_COPY.contracts.labels.airdrop,
                protocol?.airdropManager?.address ?? contracts.airdropManager ?? "—",
              ],
              [ADMIN_COPY.contracts.labels.treasury, protocol?.treasury.address ?? treasuryContract ?? "—"],
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

      <AdminTabPanel id="environment" active={activeTab}>
        {address ? (
          <AdminEnvTab />
        ) : (
          <AdminEmptyState title={ADMIN_COPY.portfolio.empty} />
        )}
      </AdminTabPanel>
      </AdminLayout>
    </AdminShell>
  );
}
