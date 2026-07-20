"use client";

import Link from "next/link";
import { PumpIcon, faClock } from "@/lib/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, isAddress, parseEther } from "viem";
import {
  useAccount,
  useBalance,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ADMIN_ADDRESS } from "@/config/admin";
import { isSolanaChainFamily } from "@/config/chain-family";
import { adminFetch, readAdminJson } from "@/lib/admin-api-client";
import { isValidSolanaAddress } from "@/lib/admin-solana-onchain";
import { WIPE_DATA_CONFIRMATION_PHRASE } from "@/lib/admin/wipe-data.constants";
import { adminSignOut } from "@/lib/admin/auth-client";
import { ADMIN_COPY } from "@/lib/admin/copy";
import { contracts, explorerAddressUrl, explorerTxUrl, NATIVE_SYMBOL, pumpChain, shortAddress } from "@/config/chain";
import { erc20Abi } from "@/lib/abis/erc20";
import { launchpadTreasuryAbi } from "@/lib/abis/launchpad-treasury";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import {
  airdropRewardAmountUsd,
} from "@/lib/airdrop-board-format";
import { AdminAirdropCreateFeeModal } from "@/components/admin/AdminAirdropCreateFeeModal";
import { AdminAirdropSweepTable, type SweepRow } from "@/components/admin/AdminAirdropSweepTable";
import { AdminEnterpriseTable } from "@/components/admin/AdminEnterpriseTable";
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
    liquidityVault?: string;
    withdrawableLiquiditySol?: string;
    withdrawableProtocolSol?: string;
  };
  airdropManager: {
    address: string;
    admin: string;
    treasury: string;
    createFeeBnb: string;
    contractBalanceBnb: string;
  } | null;
  treasury: { address: string; owner: string; balanceBnb: string };
  solana?: {
    programId: string;
    globalPda: string;
    authority: string;
    liquidityVault: string;
    protocolTreasury: string;
    factorySigner: string;
  };
};

type TreasuryWithdrawMode = "bnb" | "token";

type PendingFeeAdminRow = {
  kind: "creator" | "referrer";
  owner: string;
  pda: string;
  pendingLamports: string;
  pendingSol: string;
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
  const [curveRecoverBusy, setCurveRecoverBusy] = useState(false);
  const [curveRecoverPhase, setCurveRecoverPhase] = useState<
    "idle" | "wallet-sweep" | "chain-sweep" | "wallet-resume" | "chain-resume" | "wipe"
  >("idle");
  const [curveRecoverResetDb, setCurveRecoverResetDb] = useState(true);
  const [curveRecoverSuccess, setCurveRecoverSuccess] = useState<string | null>(null);
  const [emergencySweepTo, setEmergencySweepTo] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTokenAddress, setWithdrawTokenAddress] = useState("");
  const [withdrawTokenAmount, setWithdrawTokenAmount] = useState("");
  const [withdrawMode, setWithdrawMode] = useState<TreasuryWithdrawMode>("bnb");
  const [solanaTxHash, setSolanaTxHash] = useState<string | null>(null);
  const [solanaTxPending, setSolanaTxPending] = useState(false);
  const [pendingFees, setPendingFees] = useState<PendingFeeAdminRow[]>([]);
  const [pendingFeesLoading, setPendingFeesLoading] = useState(false);
  const [sweepingPendingKey, setSweepingPendingKey] = useState<string | null>(null);
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

  const treasuryContract = protocol?.treasury.address;
  const treasuryOwner = protocol?.treasury.owner;
  const bondingOwner = protocol?.bondingCurveManager.owner;
  const solanaAuthority = protocol?.solana?.authority ?? bondingOwner;

  /** EVM: connected wallet must own treasury. Solana: SIWE admin + server signs with Global.authority. */
  const canWithdrawTreasury = isSolanaChainFamily
    ? Boolean(address) && Boolean(treasuryContract)
    : Boolean(address) &&
      Boolean(treasuryContract) &&
      treasuryOwner != null &&
      address!.toLowerCase() === treasuryOwner.toLowerCase();

  const canEmergencySweepBonding = isSolanaChainFamily
    ? Boolean(address) && Boolean(protocol?.bondingCurveManager.address)
    : Boolean(address) &&
      Boolean(contracts.bondingCurveManager) &&
      bondingOwner != null &&
      address!.toLowerCase() === bondingOwner.toLowerCase();
  const memeFactoryOwner = protocol?.memeFactory.owner;
  const airdropAdmin = protocol?.airdropManager?.admin;
  const opsWallet = solanaAuthority ?? treasuryOwner ?? ADMIN_ADDRESS;
  const curveRecoverButtonLabel = useMemo(() => {
    switch (curveRecoverPhase) {
      case "wallet-sweep":
      case "chain-sweep":
        return ADMIN_COPY.treasury.curveRecovery.recovering;
      case "wallet-resume":
      case "chain-resume":
        return ADMIN_COPY.treasury.curveRecovery.resuming;
      case "wipe":
        return ADMIN_COPY.treasury.curveRecovery.wiping;
      default:
        return null;
    }
  }, [curveRecoverPhase]);
  const opsWalletsUnified = useMemo(() => {
    if (isSolanaChainFamily) return true;
    const wallets = [treasuryOwner, bondingOwner, airdropAdmin]
      .filter(Boolean)
      .map((w) => w!.toLowerCase());
    if (wallets.length <= 1) return true;
    return wallets.every((w) => w === wallets[0]);
  }, [treasuryOwner, bondingOwner, airdropAdmin]);

  const { data: treasuryLiveBalance, refetch: refetchTreasuryBalance } = useBalance({
    address: !isSolanaChainFamily && treasuryContract ? (treasuryContract as `0x${string}`) : undefined,
    chainId: pumpChain.id,
    query: {
      enabled: !isSolanaChainFamily && Boolean(treasuryContract),
      refetchInterval: 15_000,
    },
  });

  const tokenWithdrawAddress =
    !isSolanaChainFamily && isAddress(withdrawTokenAddress)
      ? (withdrawTokenAddress as `0x${string}`)
      : undefined;

  const { data: treasuryTokenBalance, refetch: refetchTreasuryTokenBalance } = useReadContract({
    address: tokenWithdrawAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args:
      !isSolanaChainFamily && treasuryContract
        ? [treasuryContract as `0x${string}`]
        : undefined,
    chainId: pumpChain.id,
    query: {
      enabled: !isSolanaChainFamily && Boolean(treasuryContract && tokenWithdrawAddress),
      refetchInterval: 15_000,
    },
  });

  const {
    writeContract,
    writeContractAsync,
    data: adminTxHash,
    isPending: adminTxPendingWagmi,
    reset: resetAdminTx,
  } = useWriteContract();
  const publicClient = usePublicClient({ chainId: pumpChain.id });
  const { isSuccess: adminTxDone } = useWaitForTransactionReceipt({ hash: adminTxHash });
  const adminTxPending = adminTxPendingWagmi || solanaTxPending;
  const displayTxHash = solanaTxHash ?? adminTxHash ?? null;

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

  const loadPendingFees = useCallback(async () => {
    if (!address || !isSolanaChainFamily) {
      setPendingFees([]);
      return;
    }
    setPendingFeesLoading(true);
    try {
      const res = await adminFetch("/api/admin/solana/pending-fees", { cache: "no-store" });
      const json = await readAdminJson<{
        error?: string;
        data?: { rows?: PendingFeeAdminRow[] };
      }>(res);
      if (!res.ok) throw new Error(json.error ?? "Failed to load pending fees");
      setPendingFees(json.data?.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending fees");
    } finally {
      setPendingFeesLoading(false);
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
    await Promise.all([load(), loadStats(), loadPromoTasks(), loadPendingFees()]);
    setLastRefreshedAt(new Date());
  }, [load, loadStats, loadPromoTasks, loadPendingFees]);

  useEffect(() => {
    void load();
    void loadStats();
    void loadPromoTasks();
    void loadPendingFees();
    setLastRefreshedAt(new Date());
  }, [load, loadStats, loadPromoTasks, loadPendingFees]);

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
    if (isSolanaChainFamily) setWithdrawMode("bnb");
  }, []);

  useEffect(() => {
    if (isSolanaChainFamily) {
      if (solanaAuthority && !withdrawTo) {
        setWithdrawTo(solanaAuthority);
      }
      return;
    }
    if (address && !withdrawTo) {
      setWithdrawTo(address);
    }
  }, [address, withdrawTo, solanaAuthority]);

  useEffect(() => {
    if (isSolanaChainFamily) {
      // Base parity: sweep liquidity to deployer/authority wallet (ops destination).
      if (solanaAuthority && !emergencySweepTo) {
        setEmergencySweepTo(solanaAuthority);
      }
      return;
    }
    if (treasuryContract && !emergencySweepTo) {
      setEmergencySweepTo(treasuryContract);
    }
  }, [treasuryContract, emergencySweepTo, solanaAuthority]);

  function onSweep(row: SweepRow) {
    if (isSolanaChainFamily || !contracts.airdropManager) return;
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

  async function runCurveRecovery(options: { sweepEscrow: boolean }) {
    if (!canEmergencySweepBonding) {
      setError(
        isSolanaChainFamily
          ? "Admin session required for Solana recovery."
          : "Connect the curve owner wallet on the correct chain."
      );
      return;
    }

    const to = emergencySweepTo.trim();
    if (options.sweepEscrow) {
      if (isSolanaChainFamily ? !isValidSolanaAddress(to) : !isAddress(to)) {
        setError("Enter a valid recovery recipient address");
        return;
      }
    }

    setError(null);
    setCurveRecoverSuccess(null);
    setCurveRecoverBusy(true);
    setSolanaTxHash(null);

    try {
      if (isSolanaChainFamily) {
        if (options.sweepEscrow) {
          setCurveRecoverPhase("wallet-sweep");
          setSolanaTxPending(true);
          const res = await adminFetch("/api/admin/solana/emergency-sweep", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to }),
          });
          const json = await readAdminJson<{
            error?: string;
            data?: { signature?: string };
          }>(res);
          if (!res.ok) throw new Error(json.error ?? "Emergency sweep failed");
          setSolanaTxHash(json.data?.signature ?? null);
          setCurveRecoverPhase("chain-sweep");
        } else if (!protocol?.bondingCurveManager.emergencyHalt) {
          setError("Curve trading is already active.");
          return;
        } else {
          setError(
            "Solana has no resume-halt instruction yet. Redeploy/re-initialize clears halt only via new Global."
          );
          return;
        }

        setCurveRecoverPhase(curveRecoverResetDb ? "wipe" : "idle");
        await finishCurveRecovery();
        return;
      }

      if (!contracts.bondingCurveManager || !publicClient) {
        setError("Connect the curve owner wallet on the correct chain.");
        return;
      }

      if (options.sweepEscrow) {
        setCurveRecoverPhase("wallet-sweep");
        const sweepHash = await writeContractAsync({
          address: contracts.bondingCurveManager,
          abi: bondingCurveManagerAbi,
          functionName: "emergencySweepAllEth",
          args: [to as `0x${string}`],
          chainId: pumpChain.id,
        });
        setCurveRecoverPhase("chain-sweep");
        await publicClient.waitForTransactionReceipt({ hash: sweepHash });
      }

      setCurveRecoverPhase("wallet-resume");
      const resumeHash = await writeContractAsync({
        address: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "setEmergencyHalt",
        args: [false],
        chainId: pumpChain.id,
      });
      setCurveRecoverPhase("chain-resume");
      await publicClient.waitForTransactionReceipt({ hash: resumeHash });

      if (curveRecoverResetDb) {
        setCurveRecoverPhase("wipe");
      }
      await finishCurveRecovery();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.includes("User rejected")
            ? "Transaction cancelled in wallet."
            : err.message
          : "Curve recovery failed";
      setError(message);
    } finally {
      setCurveRecoverBusy(false);
      setCurveRecoverPhase("idle");
      setSolanaTxPending(false);
      resetAdminTx();
    }
  }

  function onRecoverCurveEscrow() {
    if (!canEmergencySweepBonding) return;
    if (!isSolanaChainFamily && !contracts.bondingCurveManager) return;

    const to = emergencySweepTo.trim();
    if (isSolanaChainFamily ? !isValidSolanaAddress(to) : !isAddress(to)) {
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
    void runCurveRecovery({ sweepEscrow: true });
  }

  function onResumeCurveTradingOnly() {
    if (!canEmergencySweepBonding) return;
    if (isSolanaChainFamily) {
      setError(
        "Solana has no resume-halt instruction yet. Halt clears only with a new Global initialize."
      );
      return;
    }
    if (!contracts.bondingCurveManager) return;
    if (!protocol?.bondingCurveManager.emergencyHalt) {
      setError("Curve trading is already active.");
      return;
    }

    const confirmTemplate = curveRecoverResetDb
      ? ADMIN_COPY.treasury.curveRecovery.confirmResumeWithWipe
      : ADMIN_COPY.treasury.curveRecovery.confirmResume;
    if (!window.confirm(confirmTemplate)) return;
    void runCurveRecovery({ sweepEscrow: false });
  }

  async function onWithdrawTreasuryBnb(opts?: { maxAvailable?: boolean }) {
    if (!canWithdrawTreasury || !treasuryContract) return;
    const to = withdrawTo.trim();
    if (isSolanaChainFamily ? !isValidSolanaAddress(to) : !isAddress(to)) {
      setError("Enter a valid recipient address");
      return;
    }

    if (isSolanaChainFamily) {
      const useMax = opts?.maxAvailable === true;
      const amountSol = withdrawAmount.trim();
      if (!useMax && (!amountSol || Number(amountSol) <= 0)) {
        setError("Amount must be greater than 0");
        return;
      }
      setError(null);
      setSolanaTxHash(null);
      setSolanaTxPending(true);
      try {
        const res = await adminFetch("/api/admin/solana/withdraw-protocol", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useMax ? { to } : { to, amountSol }
          ),
        });
        const json = await readAdminJson<{
          error?: string;
          data?: { signature?: string };
        }>(res);
        if (!res.ok) throw new Error(json.error ?? "Withdraw failed");
        setSolanaTxHash(json.data?.signature ?? null);
        void load();
        void loadStats();
        void loadPendingFees();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Withdraw failed");
      } finally {
        setSolanaTxPending(false);
      }
      return;
    }

    let amount: bigint;
    try {
      amount = parseEther(withdrawAmount.trim() || "0");
    } catch {
      setError(`Invalid ${NATIVE_SYMBOL} amount`);
      return;
    }
    if (amount <= 0n) {
      setError("Amount must be greater than 0");
      return;
    }
    setError(null);
    writeContract({
      address: treasuryContract as `0x${string}`,
      abi: launchpadTreasuryAbi,
      functionName: "withdrawNative",
      args: [to as `0x${string}`, amount],
      chainId: pumpChain.id,
    });
  }

  async function onSweepPendingFee(row: PendingFeeAdminRow) {
    if (!canWithdrawTreasury || !isSolanaChainFamily) return;
    const to = withdrawTo.trim();
    if (!isValidSolanaAddress(to)) {
      setError("Enter a valid recipient address in Withdrawal first");
      return;
    }
    const confirmMsg = ADMIN_COPY.treasury.pendingFees.confirm
      .replace("{kind}", row.kind)
      .replace("{amount}", row.pendingSol)
      .replace("{symbol}", NATIVE_SYMBOL)
      .replace("{to}", shortAddress(to));
    if (!window.confirm(confirmMsg)) return;

    const sweepKey = `${row.kind}:${row.owner}`;
    setError(null);
    setSolanaTxHash(null);
    setSweepingPendingKey(sweepKey);
    setSolanaTxPending(true);
    try {
      const res = await adminFetch("/api/admin/solana/emergency-claim-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: row.owner, kind: row.kind, to }),
      });
      const json = await readAdminJson<{
        error?: string;
        data?: { signature?: string };
      }>(res);
      if (!res.ok) throw new Error(json.error ?? "Emergency claim failed");
      setSolanaTxHash(json.data?.signature ?? null);
      void load();
      void loadStats();
      void loadPendingFees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Emergency claim failed");
    } finally {
      setSweepingPendingKey(null);
      setSolanaTxPending(false);
    }
  }

  async function onSweepAllPendingFees() {
    if (!canWithdrawTreasury || !isSolanaChainFamily || pendingFees.length === 0) return;
    const to = withdrawTo.trim();
    if (!isValidSolanaAddress(to)) {
      setError("Enter a valid recipient address in Withdrawal first");
      return;
    }
    const totalSol = pendingFees
      .reduce((sum, r) => sum + Number(r.pendingSol), 0)
      .toFixed(6)
      .replace(/\.?0+$/, "");
    const confirmMsg = ADMIN_COPY.treasury.pendingFees.confirmAll
      .replace("{amount}", totalSol)
      .replace("{symbol}", NATIVE_SYMBOL)
      .replace("{count}", String(pendingFees.length))
      .replace("{to}", shortAddress(to));
    if (!window.confirm(confirmMsg)) return;

    setError(null);
    setSolanaTxHash(null);
    setSweepingPendingKey("all");
    setSolanaTxPending(true);
    try {
      const res = await adminFetch("/api/admin/solana/emergency-claim-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, all: true }),
      });
      const json = await readAdminJson<{
        error?: string;
        data?: {
          swept?: number;
          results?: Array<{ signature?: string }>;
          errors?: Array<{ error: string }>;
        };
      }>(res);
      if (!res.ok) throw new Error(json.error ?? "Emergency claim failed");
      const firstSig = json.data?.results?.[0]?.signature ?? null;
      setSolanaTxHash(firstSig);
      const failed = json.data?.errors?.length ?? 0;
      if (failed > 0) {
        setError(
          `Swept ${json.data?.swept ?? 0}; ${failed} failed: ${json.data?.errors?.[0]?.error ?? "unknown"}`
        );
      }
      void load();
      void loadStats();
      void loadPendingFees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Emergency claim failed");
    } finally {
      setSweepingPendingKey(null);
      setSolanaTxPending(false);
    }
  }

  function onWithdrawTreasuryToken() {
    if (isSolanaChainFamily) return;
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
      address: treasuryContract as `0x${string}`,
      abi: launchpadTreasuryAbi,
      functionName: "withdrawToken",
      args: [withdrawTokenAddress as `0x${string}`, withdrawTo as `0x${string}`, amount],
      chainId: pumpChain.id,
    });
  }

  function fillMaxTreasuryBnb() {
    if (isSolanaChainFamily) {
      const max = protocol?.bondingCurveManager.withdrawableProtocolSol;
      if (max) setWithdrawAmount(max);
      return;
    }
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
  const treasuryBnb = isSolanaChainFamily
    ? (protocol?.treasury.balanceBnb ?? "0")
    : treasuryLiveBalance
      ? formatEther(treasuryLiveBalance.value)
      : (protocol?.treasury.balanceBnb ?? "0");
  const withdrawableProtocolDisplay = isSolanaChainFamily
    ? (protocol?.bondingCurveManager.withdrawableProtocolSol ?? treasuryBnb)
    : treasuryBnb;

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
        onSignOut={() => {
          void adminSignOut();
          disconnect();
        }}
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
                        ? `Claimed ${formatBnb(stats.claimedTotalBnb)} ${NATIVE_SYMBOL} total`
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
                <span>
                  {ADMIN_COPY.dashboard.lastRefreshed}{" "}
                  <span className="admin-num">
                    {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : "—"}
                  </span>
                  <span className="admin-meta"> · {ADMIN_COPY.dashboard.autoRefresh}</span>
                </span>
              </p>
            </AdminPageGridCell>

            <AdminPageGridCell span={4}>
              <AdminSystemHealth />
            </AdminPageGridCell>

            <AdminPageGridCell span={8}>
              <AdminBlock
                title={ADMIN_COPY.dashboard.sections.fees.title}
                description={ADMIN_COPY.dashboard.sections.fees.description}
              >
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
                title={ADMIN_COPY.dashboard.recoveryTable}
                rows={airdrops}
                loading={loading}
                bnbUsd={bnbUsd}
                searchQuery={globalQuery}
                onSearchQueryChange={setGlobalQuery}
                adminTxPending={adminTxPending}
                sweepingId={sweepingId}
                adminTxHash={displayTxHash ?? undefined}
                onSweep={onSweep}
                toolbar={
                  <AdminBtn size="sm" onClick={() => void load()} disabled={loading}>
                    {loading ? ADMIN_COPY.actions.refreshing : ADMIN_COPY.actions.refreshList}
                  </AdminBtn>
                }
              />
            </AdminPageGridCell>
          </AdminPageGrid>
        </AdminTabPanel>

      <AdminTabPanel id="todos" active={activeTab}>
        {address ? <AdminTodosTab /> : <AdminEmptyState title={ADMIN_COPY.todos.connectRequired} />}
      </AdminTabPanel>

      <AdminTabPanel id="portfolio" active={activeTab}>
        {address &&
        (isSolanaChainFamily ? Boolean(solanaAuthority) : true) ? (
          <AdminPortfolioTab
            address={isSolanaChainFamily ? solanaAuthority! : address}
          />
        ) : (
          <AdminEmptyState
            title={
              isSolanaChainFamily && address && !solanaAuthority
                ? "Loading Solana authority wallet…"
                : ADMIN_COPY.portfolio.empty
            }
          />
        )}
      </AdminTabPanel>

      <AdminTabPanel id="treasury" active={activeTab}>
        <AdminContentGrid columns={2}>
        <AdminBlock
          title={ADMIN_COPY.treasury.feeSettings.title}
          description={ADMIN_COPY.treasury.feeSettings.description}
        >
          <AdminDataTable>
            <AdminDataRow
              label="Trade fee"
              loading={!protocol}
              onEdit={
                !isSolanaChainFamily && protocol ? () => setProtocolFeeModalOpen(true) : undefined
              }
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
              onEdit={
                !isSolanaChainFamily && protocol ? () => setCreatorShareModalOpen(true) : undefined
              }
            >
              {protocol
                ? `${creatorShareBpsToPercent(creatorFeeShareBps).toFixed(2)}% of protocol fee`
                : "—"}
            </AdminDataRow>
            <AdminDataRow
              label="Referrer share"
              loading={!protocol}
              onEdit={
                !isSolanaChainFamily && protocol ? () => setReferrerShareModalOpen(true) : undefined
              }
            >
              {protocol
                ? `${referrerShareBpsToPercent(referrerShareBps).toFixed(2)}% of protocol fee`
                : "—"}
            </AdminDataRow>
            <AdminDataRow
              label="Meme launch fee"
              loading={!protocol}
              onEdit={
                !isSolanaChainFamily && protocol
                  ? () => setMemeCreateFeeModalOpen(true)
                  : undefined
              }
            >
              {protocol ? (
                <>
                  {formatBnb(protocol.memeFactory.createFeeBnb)} {NATIVE_SYMBOL}
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
              onEdit={
                !isSolanaChainFamily ? () => setMinInitialBuyModalOpen(true) : undefined
              }
            >
              {formatBnb(minInitialBuyBnb)} {NATIVE_SYMBOL}
            </AdminDataRow>
            <AdminDataRow
              label="Fee exemption"
              onEdit={
                !isSolanaChainFamily ? () => setFeeExemptModalOpen(true) : undefined
              }
              editLabel="Manage exemptions"
            >
              {isSolanaChainFamily ? "Not applicable on Solana" : "MemeFactory · AirdropManager"}
            </AdminDataRow>
            <AdminDataRow
              label="Airdrop create fee"
              loading={!isSolanaChainFamily && !protocol?.airdropManager}
              onEdit={
                !isSolanaChainFamily && protocol?.airdropManager
                  ? () => setAirdropCreateFeeModalOpen(true)
                  : undefined
              }
            >
              {protocol?.airdropManager ? (
                <>
                  {formatBnb(protocol.airdropManager.createFeeBnb)} {NATIVE_SYMBOL}
                  {airdropFeeUsd != null
                    ? ` · ${formatUsdReadable(airdropFeeUsd, { compact: true })}`
                    : ""}
                </>
              ) : (
                isSolanaChainFamily ? "N/A (Solana)" : "—"
              )}
            </AdminDataRow>
          </AdminDataTable>
        </AdminBlock>

        <AdminBlock
          title={ADMIN_COPY.treasury.balances.title}
          description={ADMIN_COPY.treasury.balances.description}
        >
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
            <AdminDataRow label={isSolanaChainFamily ? "Liquidity vault" : "Curve escrow"}>
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
                  {isSolanaChainFamily && protocol.solana?.liquidityVault ? (
                    <span className="admin-meta">
                      {" "}
                      ·{" "}
                      <a
                        href={explorerAddressUrl(protocol.solana.liquidityVault)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-link admin-num"
                      >
                        {shortAddress(protocol.solana.liquidityVault)}
                      </a>
                    </span>
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
                    onClick={() => void onRecoverCurveEscrow()}
                    disabled={curveRecoverBusy}
                  >
                    {curveRecoverBusy
                      ? (curveRecoverButtonLabel ?? ADMIN_COPY.treasury.curveRecovery.recoverAndResume)
                      : ADMIN_COPY.treasury.curveRecovery.recoverAndResume}
                  </AdminBtn>
                ) : protocol?.bondingCurveManager.emergencyHalt ? (
                  <AdminBtn
                    size="sm"
                    onClick={() => void onResumeCurveTradingOnly()}
                    disabled={curveRecoverBusy}
                  >
                    {curveRecoverBusy
                      ? (curveRecoverButtonLabel ?? ADMIN_COPY.treasury.curveRecovery.resumeOnly)
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
          <AdminBlock
            title={ADMIN_COPY.treasury.withdraw.title}
            description={
              isSolanaChainFamily
                ? ADMIN_COPY.treasury.withdraw.descriptionSolana
                : ADMIN_COPY.treasury.withdraw.description
            }
            padded
          >
            <div className="admin-compact-form admin-compact-form--withdraw">
              {!isSolanaChainFamily ? (
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
              ) : null}

              <AdminField label={ADMIN_COPY.treasury.withdraw.recipient}>
                <input
                  type="text"
                  value={withdrawTo}
                  onChange={(e) => setWithdrawTo(e.target.value)}
                  className="admin-input admin-num"
                />
              </AdminField>

              {isSolanaChainFamily ? (
                <>
                  <p className="admin-note admin-card-note">
                    <span className="admin-num">
                      {formatBnb(treasuryBnb)} {NATIVE_SYMBOL}
                    </span>{" "}
                    protocol treasury
                    {" · "}
                    <span className="admin-num">
                      {formatBnb(withdrawableProtocolDisplay)} {NATIVE_SYMBOL}
                    </span>{" "}
                    withdrawable (rent kept on PDA)
                  </p>
                  <AdminField
                    label={ADMIN_COPY.treasury.withdraw.amountBnb}
                    hint="Optional for custom amount — or use Withdraw all available"
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
                        disabled={Number(withdrawableProtocolDisplay) <= 0}
                      >
                        Max
                      </AdminBtn>
                    </div>
                  </AdminField>
                </>
              ) : withdrawMode === "bnb" ? (
                <>
                  <AdminField
                    label={ADMIN_COPY.treasury.withdraw.amountBnb}
                    hint={
                      <span className="admin-num">
                        {formatBnb(withdrawableProtocolDisplay)} {NATIVE_SYMBOL} available
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
                {isSolanaChainFamily ? (
                  <>
                    <AdminBtn
                      primary
                      onClick={() => void onWithdrawTreasuryBnb({ maxAvailable: true })}
                      disabled={
                        adminTxPending || Number(withdrawableProtocolDisplay) <= 0
                      }
                    >
                      {adminTxPending
                        ? ADMIN_COPY.actions.withdrawing
                        : ADMIN_COPY.treasury.withdraw.withdrawAvailable}
                    </AdminBtn>
                    <AdminBtn
                      onClick={() => void onWithdrawTreasuryBnb()}
                      disabled={adminTxPending}
                    >
                      {adminTxPending
                        ? ADMIN_COPY.actions.withdrawing
                        : ADMIN_COPY.treasury.withdraw.withdrawCustom}
                    </AdminBtn>
                  </>
                ) : (
                  <AdminBtn
                    primary
                    onClick={
                      withdrawMode === "bnb"
                        ? () => void onWithdrawTreasuryBnb()
                        : onWithdrawTreasuryToken
                    }
                    disabled={adminTxPending}
                  >
                    {adminTxPending
                      ? ADMIN_COPY.actions.withdrawing
                      : ADMIN_COPY.actions.withdraw}
                  </AdminBtn>
                )}
              </div>
            </div>
            {displayTxHash && !sweepingId ? (
              <p className="admin-note admin-card-note">
                Tx{" "}
                <a
                  href={explorerTxUrl(displayTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-link admin-num"
                >
                  {shortAddress(displayTxHash)}
                </a>
              </p>
            ) : null}
          </AdminBlock>
        ) : (
          <p className="admin-note">
            {isSolanaChainFamily
              ? "Sign in as admin to withdraw protocol fees (server signs with Global.authority keypair)."
              : ADMIN_COPY.treasury.withdraw.ownerRequired}
          </p>
        )}

        {isSolanaChainFamily && canWithdrawTreasury ? (
          <AdminBlock
            title={ADMIN_COPY.treasury.pendingFees.title}
            description={ADMIN_COPY.treasury.pendingFees.description}
            actions={
              <div className="admin-card-actions">
                <AdminBtn size="sm" onClick={() => void loadPendingFees()} disabled={pendingFeesLoading}>
                  {pendingFeesLoading
                    ? ADMIN_COPY.actions.refreshing
                    : ADMIN_COPY.treasury.pendingFees.refresh}
                </AdminBtn>
                <AdminBtn
                  size="sm"
                  danger
                  onClick={() => void onSweepAllPendingFees()}
                  disabled={
                    adminTxPending ||
                    pendingFeesLoading ||
                    pendingFees.length === 0 ||
                    !withdrawTo.trim()
                  }
                >
                  {sweepingPendingKey === "all"
                    ? ADMIN_COPY.treasury.pendingFees.sweepingAll
                    : ADMIN_COPY.treasury.pendingFees.sweepAll}
                </AdminBtn>
              </div>
            }
          >
            <p className="admin-compact-hint">{ADMIN_COPY.treasury.pendingFees.recipientHint}</p>
            {pendingFees.length > 0 ? (
              <p className="admin-note admin-card-note">
                {ADMIN_COPY.treasury.pendingFees.total}{" "}
                <span className="admin-num">
                  {pendingFees
                    .reduce((sum, r) => sum + Number(r.pendingSol), 0)
                    .toFixed(6)
                    .replace(/\.?0+$/, "")}{" "}
                  {NATIVE_SYMBOL}
                </span>
                {" · "}
                {pendingFees.length} account{pendingFees.length === 1 ? "" : "s"}
              </p>
            ) : null}
            {pendingFeesLoading && pendingFees.length === 0 ? (
              <div className="admin-empty admin-empty--panel">
                <p className="admin-empty-copy">{ADMIN_COPY.empty.loading}</p>
              </div>
            ) : (
              <AdminEnterpriseTable
                rows={pendingFees}
                rowKey={(r) => `${r.kind}:${r.owner}`}
                emptyMessage={ADMIN_COPY.treasury.pendingFees.empty}
                columns={[
                  {
                    id: "owner",
                    header: ADMIN_COPY.treasury.pendingFees.owner,
                    minWidth: "10rem",
                    cell: (r) => (
                      <a
                        href={explorerAddressUrl(r.owner)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-link admin-num"
                        title={r.owner}
                      >
                        {shortAddress(r.owner)}
                      </a>
                    ),
                  },
                  {
                    id: "kind",
                    header: ADMIN_COPY.treasury.pendingFees.kind,
                    width: "6.5rem",
                    cell: (r) => r.kind,
                  },
                  {
                    id: "pending",
                    header: ADMIN_COPY.treasury.pendingFees.pending,
                    align: "right",
                    width: "8rem",
                    sortValue: (r) => Number(r.pendingSol),
                    sortable: true,
                    cell: (r) => <span className="admin-num">{r.pendingSol}</span>,
                  },
                  {
                    id: "action",
                    header: "Action",
                    align: "right",
                    width: "6.5rem",
                    className: "admin-table-col--action",
                    cell: (r) => {
                      const key = `${r.kind}:${r.owner}`;
                      const busy = sweepingPendingKey === key;
                      return (
                        <AdminBtn
                          size="sm"
                          danger
                          onClick={() => void onSweepPendingFee(r)}
                          disabled={adminTxPending || !withdrawTo.trim()}
                        >
                          {busy
                            ? ADMIN_COPY.treasury.pendingFees.sweeping
                            : ADMIN_COPY.treasury.pendingFees.sweep}
                        </AdminBtn>
                      );
                    },
                  },
                ]}
              />
            )}
          </AdminBlock>
        ) : null}
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
          adminTxHash={displayTxHash ?? undefined}
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
          description={ADMIN_COPY.promo.create.description}
          padded
          actions={
            <AdminBtn size="sm" onClick={() => void loadPromoTasks()} disabled={promoLoading}>
              {promoLoading ? ADMIN_COPY.actions.refreshing : ADMIN_COPY.actions.refreshList}
            </AdminBtn>
          }
        >
          <div className="admin-form-grid admin-form-grid--constrained">
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
            <div className="admin-form-actions">
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

        <AdminBlock
          title={ADMIN_COPY.promo.list.title}
          description={ADMIN_COPY.promo.list.description}
        >
          {promoLoading ? (
            <div className="admin-empty admin-empty--panel">
              <p className="admin-empty-copy">{ADMIN_COPY.empty.loading}</p>
            </div>
          ) : promoTasks.length === 0 ? (
            <AdminEmptyState title={ADMIN_COPY.promo.list.empty} />
          ) : (
            <AdminEnterpriseTable
              rows={promoTasks}
              rowKey={(t) => t.taskKey}
              emptyMessage={ADMIN_COPY.promo.list.empty}
              columns={[
                {
                  id: "title",
                  header: "Title",
                  minWidth: "10rem",
                  cell: (t) => <span className="admin-table-truncate admin-table-strong">{t.title}</span>,
                },
                {
                  id: "description",
                  header: "Description",
                  minWidth: "12rem",
                  cell: (t) => (
                    <span className="admin-table-truncate admin-meta">{t.description ?? "—"}</span>
                  ),
                },
                {
                  id: "url",
                  header: "URL",
                  minWidth: "10rem",
                  cell: (t) => (
                    <a
                      href={t.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-link admin-table-truncate"
                      title={t.targetUrl}
                    >
                      {t.targetUrl.replace(/^https?:\/\//, "")}
                    </a>
                  ),
                },
                {
                  id: "points",
                  header: "Points",
                  align: "right",
                  width: "5.5rem",
                  cell: (t) => t.rewardPoints,
                },
                {
                  id: "completions",
                  header: "Completions",
                  align: "right",
                  width: "6.5rem",
                  cell: (t) => t.completionCount,
                },
                {
                  id: "active",
                  header: "Active",
                  width: "6.5rem",
                  cell: (t) => (
                    <AdminStatusBadge tone={t.isActive ? "ok" : "neutral"}>
                      {t.isActive ? "Active" : "Inactive"}
                    </AdminStatusBadge>
                  ),
                },
                {
                  id: "action",
                  header: "Action",
                  align: "right",
                  width: "6.5rem",
                  className: "admin-table-col--action",
                  cell: (t) => (
                    <AdminBtn
                      size="sm"
                      onClick={() => void onDeletePromoTask(t.taskKey, t.title)}
                      disabled={deletingKey === t.taskKey}
                    >
                      {deletingKey === t.taskKey
                        ? ADMIN_COPY.actions.refreshing
                        : ADMIN_COPY.actions.delete}
                    </AdminBtn>
                  ),
                },
              ]}
            />
          )}
        </AdminBlock>
      </AdminTabPanel>

      <AdminTabPanel id="contracts" active={activeTab}>
        <div className="admin-registry-grid">
          {(
            isSolanaChainFamily
              ? ([
                  ["Launchpad program", protocol?.solana?.programId ?? protocol?.bondingCurveManager.address ?? null],
                  ["Authority (deployer)", protocol?.solana?.authority ?? bondingOwner ?? null],
                  ["Liquidity vault", protocol?.solana?.liquidityVault ?? protocol?.bondingCurveManager.liquidityVault ?? null],
                  ["Protocol treasury", protocol?.solana?.protocolTreasury ?? protocol?.treasury.address ?? null],
                  ["Global PDA", protocol?.solana?.globalPda ?? null],
                ] as const)
              : ([
                  [
                    ADMIN_COPY.contracts.labels.memeFactory,
                    protocol?.memeFactory.address ?? contracts.memeFactory,
                  ],
                  [
                    ADMIN_COPY.contracts.labels.bonding,
                    protocol?.bondingCurveManager.address ?? contracts.bondingCurveManager,
                  ],
                  [
                    ADMIN_COPY.contracts.labels.airdrop,
                    protocol?.airdropManager?.address ?? contracts.airdropManager ?? null,
                  ],
                  [
                    ADMIN_COPY.contracts.labels.treasury,
                    protocol?.treasury.address ?? treasuryContract ?? null,
                  ],
                ] as const)
          ).map(([label, addr]) => (
            <article key={label} className="admin-registry-card">
              <div className="admin-registry-card-head">
                <p className="admin-registry-label">{label}</p>
                <span className="admin-registry-badge">
                  {isSolanaChainFamily ? "PDA" : "UUPS"}
                </span>
              </div>
              {addr ? (
                <>
                  <a
                    href={explorerAddressUrl(addr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-registry-short admin-link admin-num"
                  >
                    {shortAddress(addr)}
                  </a>
                  <p className="admin-registry-full admin-num">{addr}</p>
                </>
              ) : (
                <p className="admin-meta">Not configured</p>
              )}
            </article>
          ))}
        </div>
        <p className="admin-section-desc admin-registry-footnote">
          {isSolanaChainFamily
            ? "Solana launchpad PDAs. Withdraw/sweep recipient defaults to Global.authority (deployer)."
            : ADMIN_COPY.contracts.tableDescription}
        </p>
      </AdminTabPanel>

      <AdminTabPanel id="environment" active={activeTab}>
        {address ? (
          <>
            <AdminEnvTab />
            <AdminDataWipeCard
              onWiped={() => {
                void load();
                void loadStats();
              }}
            />
          </>
        ) : (
          <AdminEmptyState title={ADMIN_COPY.environment.connectRequired} />
        )}
      </AdminTabPanel>
      </AdminLayout>
    </AdminShell>
  );
}
