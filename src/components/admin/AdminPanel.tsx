"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { bnbToUsd, formatBnbWithUsd, formatUsdReadable } from "@/lib/format-usd";

type ProtocolSnapshot = {
  memeFactory: { address: string; owner: string; treasury: string; createFeeBnb: string };
  bondingCurveManager: {
    address: string;
    owner: string;
    treasury: string;
    protocolFeeBps: number;
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

function sweepStatusBadgeClass(status: string): string {
  switch (status) {
    case "ready":
      return "status-badge border-pump-accent/30 bg-pump-accent/10 text-pump-accent";
    case "claim_window_open":
      return "status-badge border-pump-warning/30 bg-pump-warning/10 text-pump-warning";
    case "swept":
    case "nothing_to_sweep":
      return "status-badge border-pump-border/25 bg-pump-surface/40 text-pump-muted";
    default:
      return "status-badge";
  }
}

function StatCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="section-label text-[10px] md:text-[inherit]">{label}</dt>
      <dd className="m-0 rounded-md border border-pump-border/15 bg-pump-surface/35 px-2.5 py-2 md:px-3">
        {children}
      </dd>
    </div>
  );
}

function BnbAmountWithUsd({
  bnb,
  bnbUsd,
  compact = false,
}: {
  bnb: string;
  bnbUsd: number | null;
  compact?: boolean;
}) {
  const n = Number(bnb);
  const formatted = formatBnbWithUsd(Number.isFinite(n) ? n : 0, bnbUsd, { compact });
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

function RewardAmountWithUsd({
  amount,
  rewardToken,
  rewardSymbol,
  rewardPriceBnb,
  bnbUsd,
  compact = false,
}: {
  amount: string;
  rewardToken: string | null;
  rewardSymbol: string | null;
  rewardPriceBnb: string | null;
  bnbUsd: number | null;
  compact?: boolean;
}) {
  const isBnb = !rewardToken;
  const usd = airdropRewardAmountUsd(
    amount,
    { rewardToken, rewardSymbol, rewardPriceBnb, totalFunded: amount },
    bnbUsd
  );
  const amountClass = compact
    ? "financial-value text-caption font-semibold text-pump-text"
    : "financial-value text-body-sm font-semibold text-pump-text";

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {isBnb ? (
        <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-pump-warning/15 text-[7px] font-bold text-pump-warning">
          BNB
        </span>
      ) : (
        <TokenAvatar
          address={rewardToken}
          symbol={rewardSymbol ?? "?"}
          size={compact ? 16 : 18}
        />
      )}
      <div className="min-w-0">
        <p className={amountClass}>
          {formatAirdropReward(amount, { isBnb, symbol: rewardSymbol })}
        </p>
        {usd != null ? (
          <p className="text-[10px] text-pump-muted md:text-caption">
            {formatUsdReadable(usd, { compact: true })}
          </p>
        ) : null}
      </div>
    </div>
  );
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
  const [deactivatingKey, setDeactivatingKey] = useState<string | null>(null);

  const isAdmin = isAdminWallet(address);
  const treasuryContract = protocol?.treasury.address as `0x${string}` | undefined;
  const treasuryOwner = protocol?.treasury.owner;
  const canWithdrawTreasury =
    isAdmin &&
    Boolean(address) &&
    Boolean(treasuryContract) &&
    treasuryOwner != null &&
    address!.toLowerCase() === treasuryOwner.toLowerCase();

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
    void loadPromoTasks();
  }, [load, loadPromoTasks]);

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
  }, [
    adminTxDone,
    sweepingId,
    load,
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

  async function onDeactivatePromoTask(taskKey: string) {
    if (!address) return;
    setDeactivatingKey(taskKey);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tasks?address=${address}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey, isActive: false }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to deactivate task");
      await loadPromoTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate task");
    } finally {
      setDeactivatingKey(null);
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

  return (
    <div className="space-y-4 md:space-y-5">
      {error ? (
        <div className="notice-error rounded-lg border border-pump-danger/30 bg-pump-danger/5 px-3 py-2 text-body-sm">
          {error}
        </div>
      ) : null}

      <section className="panel-surface overflow-hidden">
        <div className="border-b border-pump-border/15 px-4 py-3.5 md:px-5">
          <p className="section-label">Overview</p>
          <p className="mt-0.5 field-hint">
            Protocol treasury, airdrop escrow, and sweepable remainders · USD est. from live BNB
            price
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4 md:p-5">
          <StatCell label="Treasury balance">
            <BnbAmountWithUsd bnb={treasuryBnb} bnbUsd={bnbUsd} />
          </StatCell>
          <StatCell label="Airdrop escrow">
            <BnbAmountWithUsd bnb={escrowBnb} bnbUsd={bnbUsd} />
          </StatCell>
          <StatCell label="Ready to sweep">
            <p className="financial-value text-body-sm font-semibold text-pump-text">
              {loading ? "—" : `${sweepStats.readyCount} campaign${sweepStats.readyCount === 1 ? "" : "s"}`}
            </p>
            {sweepStats.remainingUsd != null ? (
              <p className="text-caption text-pump-muted">
                {formatUsdReadable(sweepStats.remainingUsd, { compact: true })} unclaimed
              </p>
            ) : null}
          </StatCell>
          <StatCell label="Total campaigns">
            <p className="financial-value text-body-sm font-semibold text-pump-text">
              {loading ? "—" : airdrops.length}
            </p>
            <p className="text-caption text-pump-muted">On-chain airdrops tracked</p>
          </StatCell>
        </dl>
      </section>

      <section className="panel-surface overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-pump-border/15 px-4 py-3.5 md:px-5">
          <div>
            <p className="section-label">Promo link tasks</p>
            <p className="mt-0.5 field-hint">
              Create click-to-complete missions for users — opens your link, then awards points
            </p>
          </div>
          <button
            type="button"
            className="chip-button"
            onClick={() => void loadPromoTasks()}
            disabled={promoLoading}
          >
            {promoLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="border-b border-pump-border/10 p-4 md:p-5">
          <p className="section-label">New task</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Title"
              value={promoTitle}
              onChange={(e) => setPromoTitle(e.target.value)}
              className="field-input h-10 bg-pump-bg/80 sm:col-span-2"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={promoDescription}
              onChange={(e) => setPromoDescription(e.target.value)}
              className="field-input h-10 bg-pump-bg/80 sm:col-span-2"
            />
            <input
              type="number"
              min={0}
              step={1}
              placeholder="Points"
              value={promoPoints}
              onChange={(e) => setPromoPoints(e.target.value)}
              className="field-input h-10 bg-pump-bg/80"
            />
            <input
              type="url"
              placeholder="https://…"
              value={promoUrl}
              onChange={(e) => setPromoUrl(e.target.value)}
              className="field-input h-10 bg-pump-bg/80"
            />
          </div>
          <button
            type="button"
            className="primary-button mt-3"
            disabled={promoSaving || !promoTitle.trim() || !promoUrl.trim() || !promoPoints.trim()}
            onClick={() => void onCreatePromoTask()}
          >
            {promoSaving ? "Creating…" : "Create promo task"}
          </button>
        </div>

        {promoLoading ? (
          <p className="p-4 text-body-sm text-pump-muted md:p-5">Loading promo tasks…</p>
        ) : promoTasks.length === 0 ? (
          <p className="p-4 text-body-sm text-pump-muted md:p-5">No promo tasks yet.</p>
        ) : (
          <div className="divide-y divide-pump-border/10">
            {promoTasks.map((task) => (
              <article
                key={task.taskKey}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 md:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-body-sm font-medium text-pump-text">{task.title}</p>
                    <span
                      className={
                        task.isActive
                          ? "status-badge border-pump-accent/30 bg-pump-accent/10 text-pump-accent"
                          : "status-badge border-pump-border/25 bg-pump-surface/40 text-pump-muted"
                      }
                    >
                      {task.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {task.description ? (
                    <p className="mt-0.5 text-caption text-pump-muted">{task.description}</p>
                  ) : null}
                  <p className="mt-1 truncate text-caption text-pump-muted">
                    <a
                      href={task.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pump-accent hover:underline"
                    >
                      {task.targetUrl}
                    </a>
                  </p>
                  <p className="mt-1 text-caption text-pump-muted">
                    +{task.rewardPoints} pts · {task.completionCount} completion
                    {task.completionCount === 1 ? "" : "s"}
                  </p>
                </div>
                {task.isActive ? (
                  <button
                    type="button"
                    className="chip-button shrink-0"
                    disabled={deactivatingKey === task.taskKey}
                    onClick={() => void onDeactivatePromoTask(task.taskKey)}
                  >
                    {deactivatingKey === task.taskKey ? "…" : "Deactivate"}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-surface p-4 md:p-5">
        <p className="section-label">Protocol fee treasury</p>
        <p className="mt-1 field-hint">
          Launch and trade fees route directly to the treasury wallet — not a separate fee contract.
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
            <dt className="section-label text-[10px]">Treasury contract</dt>
            <dd className="mt-1">
              {treasuryContract ? (
                <a
                  href={explorerAddressUrl(treasuryContract)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-body-sm font-medium text-pump-accent hover:underline"
                >
                  {shortAddress(treasuryContract)}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
            <dt className="section-label text-[10px]">Treasury owner</dt>
            <dd className="mt-1 text-body-sm font-medium text-pump-text">
              {treasuryOwner ? shortAddress(treasuryOwner) : shortAddress(ADMIN_ADDRESS)}
            </dd>
          </div>
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
            <dt className="section-label text-[10px]">Meme launch fee</dt>
            <dd className="mt-1">
              {protocol ? (
                <>
                  <p className="financial-value text-body-sm font-semibold text-pump-text">
                    {formatBnb(protocol.memeFactory.createFeeBnb)} BNB
                  </p>
                  {memeFeeUsd != null ? (
                    <p className="text-caption text-pump-muted">
                      {formatUsdReadable(memeFeeUsd, { compact: true })} / launch
                    </p>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
            <dt className="section-label text-[10px]">Trade protocol fee</dt>
            <dd className="mt-1 text-body-sm text-pump-text">
              {protocol
                ? `${(protocol.bondingCurveManager.protocolFeeBps / 100).toFixed(2)}% · 80% → treasury`
                : "—"}
            </dd>
          </div>
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
            <dt className="section-label text-[10px]">Airdrop create fee</dt>
            <dd className="mt-1">
              {protocol?.airdropManager ? (
                <>
                  <p className="financial-value text-body-sm font-semibold text-pump-text">
                    {formatBnb(protocol.airdropManager.createFeeBnb)} BNB
                  </p>
                  {airdropFeeUsd != null ? (
                    <p className="text-caption text-pump-muted">
                      {formatUsdReadable(airdropFeeUsd, { compact: true })} → treasury
                    </p>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
            <dt className="section-label text-[10px]">Sweep recipient</dt>
            <dd className="mt-1 text-body-sm font-medium text-pump-text">
              {shortAddress(protocol?.airdropManager?.admin ?? ADMIN_ADDRESS)}
            </dd>
          </div>
          <div className="rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2.5">
            <dt className="section-label text-[10px]">Bonding curve balance</dt>
            <dd className="mt-1">
              {protocol ? (
                <BnbAmountWithUsd
                  bnb={protocol.bondingCurveManager.contractBalanceBnb}
                  bnbUsd={bnbUsd}
                  compact
                />
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>

        {canWithdrawTreasury ? (
          <div className="mt-4 rounded-md border border-pump-border/15 bg-pump-surface/35 p-4">
            <p className="section-label">Claim protocol fees</p>
            <p className="mt-1 field-hint">
              Withdraw accumulated fees from LaunchpadTreasury — meme launch fees, trade treasury
              share (80%), and airdrop create fees.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={withdrawMode === "bnb" ? "chip-button chip-button-active" : "chip-button"}
                onClick={() => setWithdrawMode("bnb")}
              >
                BNB
              </button>
              <button
                type="button"
                className={
                  withdrawMode === "token" ? "chip-button chip-button-active" : "chip-button"
                }
                onClick={() => setWithdrawMode("token")}
              >
                ERC20 token
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Recipient 0x…"
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value)}
                className="field-input h-10 bg-pump-bg/80 sm:col-span-2"
              />
              {withdrawMode === "bnb" ? (
                <>
                  <div className="relative sm:col-span-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Amount BNB"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="field-input h-10 w-full bg-pump-bg/80 pr-16"
                    />
                    <button
                      type="button"
                      className="chip-button absolute right-1 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px]"
                      onClick={fillMaxTreasuryBnb}
                      disabled={!treasuryLiveBalance?.value}
                    >
                      Max
                    </button>
                  </div>
                  <p className="text-caption text-pump-muted sm:col-span-2">
                    Available: {formatBnb(treasuryBnb)} BNB
                    {bnbToUsd(Number(treasuryBnb), bnbUsd) != null
                      ? ` (${formatUsdReadable(bnbToUsd(Number(treasuryBnb), bnbUsd)!, { compact: true })})`
                      : ""}
                  </p>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Token contract 0x…"
                    value={withdrawTokenAddress}
                    onChange={(e) => setWithdrawTokenAddress(e.target.value)}
                    className="field-input h-10 bg-pump-bg/80 sm:col-span-2"
                  />
                  <div className="relative sm:col-span-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Token amount"
                      value={withdrawTokenAmount}
                      onChange={(e) => setWithdrawTokenAmount(e.target.value)}
                      className="field-input h-10 w-full bg-pump-bg/80 pr-16"
                    />
                    <button
                      type="button"
                      className="chip-button absolute right-1 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px]"
                      onClick={fillMaxTreasuryToken}
                      disabled={treasuryTokenBalance == null || treasuryTokenBalance === 0n}
                    >
                      Max
                    </button>
                  </div>
                  {tokenWithdrawAddress && treasuryTokenBalance != null ? (
                    <p className="text-caption text-pump-muted sm:col-span-2">
                      Treasury balance: {formatEther(treasuryTokenBalance)} tokens
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <button
              type="button"
              className="primary-button mt-3"
              disabled={adminTxPending}
              onClick={
                withdrawMode === "bnb" ? onWithdrawTreasuryBnb : onWithdrawTreasuryToken
              }
            >
              {adminTxPending
                ? "Withdrawing…"
                : withdrawMode === "bnb"
                  ? "Withdraw BNB from treasury"
                  : "Withdraw token from treasury"}
            </button>

            {adminTxHash && !sweepingId ? (
              <p className="mt-2 text-caption text-pump-muted">
                Tx{" "}
                <a
                  href={explorerTxUrl(adminTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pump-accent hover:underline"
                >
                  {shortAddress(adminTxHash)}
                </a>
              </p>
            ) : null}
          </div>
        ) : isAdmin ? (
          <p className="mt-4 text-caption text-pump-muted">
            Treasury withdrawals require the LaunchpadTreasury owner wallet (
            {shortAddress(treasuryOwner ?? ADMIN_ADDRESS)}).
          </p>
        ) : null}
      </section>

      <section className="panel-surface overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-pump-border/15 px-4 py-3.5 md:px-5">
          <div>
            <p className="section-label">Airdrop remainder sweeps</p>
            <p className="mt-0.5 field-hint">
              Unclaimed escrow after the claim window · swept to admin wallet
            </p>
          </div>
          <button type="button" className="chip-button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loading ? (
          <p className="p-4 text-body-sm text-pump-muted md:p-5">Loading campaigns…</p>
        ) : airdrops.length === 0 ? (
          <p className="p-4 text-body-sm text-pump-muted md:p-5">No on-chain airdrops yet.</p>
        ) : (
          <>
            {readySweeps.length > 0 ? (
              <p className="border-b border-pump-border/10 bg-pump-accent/5 px-4 py-2.5 text-body-sm text-pump-accent md:px-5">
                {readySweeps.length} campaign{readySweeps.length === 1 ? "" : "s"} ready to sweep
                {sweepStats.remainingUsd != null
                  ? ` · ${formatUsdReadable(sweepStats.remainingUsd, { compact: true })} total remaining`
                  : ""}
              </p>
            ) : null}

            <div className="divide-y divide-pump-border/10 lg:hidden">
              {airdrops.map((row) => (
                <article key={row.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/airdrops/${row.id}`}
                        className="truncate text-body-sm font-medium text-pump-accent hover:underline"
                      >
                        {row.title ?? row.linkedSymbol ?? `#${row.id}`}
                      </Link>
                      {row.linkedSymbol ? (
                        <p className="text-caption text-pump-muted">Pool ${row.linkedSymbol}</p>
                      ) : null}
                    </div>
                    <span className={sweepStatusBadgeClass(row.sweepStatus)}>
                      {sweepStatusLabel(row.sweepStatus)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-caption">
                    <div>
                      <dt className="section-label text-[10px]">Reward pool</dt>
                      <dd className="mt-1">
                        <RewardAmountWithUsd
                          amount={row.totalFunded}
                          rewardToken={row.rewardToken}
                          rewardSymbol={row.rewardSymbol}
                          rewardPriceBnb={row.rewardPriceBnb}
                          bnbUsd={bnbUsd}
                          compact
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="section-label text-[10px]">Remaining</dt>
                      <dd className="mt-1">
                        <RewardAmountWithUsd
                          amount={row.remainingBnb}
                          rewardToken={row.rewardToken}
                          rewardSymbol={row.rewardSymbol}
                          rewardPriceBnb={row.rewardPriceBnb}
                          bnbUsd={bnbUsd}
                          compact
                        />
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="section-label text-[10px]">Claim until</dt>
                      <dd className="mt-0.5 text-pump-muted">
                        {row.claimEnd ? formatQualifyDateTime(row.claimEnd) : "—"}
                      </dd>
                    </div>
                  </dl>
                  {row.canSweep ? (
                    <button
                      type="button"
                      className="primary-button w-full"
                      disabled={adminTxPending && sweepingId === row.onChainId}
                      onClick={() => onSweep(row)}
                    >
                      {adminTxPending && sweepingId === row.onChainId
                        ? "Sweeping…"
                        : "Sweep remainder"}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[960px] w-full text-body-sm">
                <thead className="border-b border-pump-border/15 bg-pump-surface/55">
                  <tr className="text-left">
                    <th className="section-label px-4 py-3">Campaign</th>
                    <th className="section-label px-4 py-3">Reward pool</th>
                    <th className="section-label px-4 py-3">Claimed</th>
                    <th className="section-label px-4 py-3">Remaining</th>
                    <th className="section-label px-4 py-3">Claim until</th>
                    <th className="section-label px-4 py-3">Status</th>
                    <th className="section-label px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {airdrops.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-pump-border/10 last:border-b-0 hover:bg-pump-surface/20"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/airdrops/${row.id}`}
                          className="font-medium text-pump-accent hover:underline"
                        >
                          {row.title ?? row.linkedSymbol ?? `#${row.id}`}
                        </Link>
                        <p className="text-caption text-pump-muted">
                          {row.linkedSymbol ? `Pool $${row.linkedSymbol}` : `ID ${row.onChainId}`}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <RewardAmountWithUsd
                          amount={row.totalFunded}
                          rewardToken={row.rewardToken}
                          rewardSymbol={row.rewardSymbol}
                          rewardPriceBnb={row.rewardPriceBnb}
                          bnbUsd={bnbUsd}
                          compact
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RewardAmountWithUsd
                          amount={row.totalClaimedBnb}
                          rewardToken={row.rewardToken}
                          rewardSymbol={row.rewardSymbol}
                          rewardPriceBnb={row.rewardPriceBnb}
                          bnbUsd={bnbUsd}
                          compact
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RewardAmountWithUsd
                          amount={row.remainingBnb}
                          rewardToken={row.rewardToken}
                          rewardSymbol={row.rewardSymbol}
                          rewardPriceBnb={row.rewardPriceBnb}
                          bnbUsd={bnbUsd}
                          compact
                        />
                      </td>
                      <td className="px-4 py-3 text-caption text-pump-muted">
                        {row.claimEnd ? formatQualifyDateTime(row.claimEnd) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={sweepStatusBadgeClass(row.sweepStatus)}>
                          {sweepStatusLabel(row.sweepStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.canSweep ? (
                          <button
                            type="button"
                            className="chip-button chip-button-active"
                            disabled={adminTxPending && sweepingId === row.onChainId}
                            onClick={() => onSweep(row)}
                          >
                            {adminTxPending && sweepingId === row.onChainId ? "Sweeping…" : "Sweep"}
                          </button>
                        ) : (
                          <span className="text-pump-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {adminTxHash && sweepingId ? (
          <p className="border-t border-pump-border/10 px-4 py-2.5 text-caption text-pump-muted md:px-5">
            Last sweep tx{" "}
            <a
              href={explorerTxUrl(adminTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pump-accent hover:underline"
            >
              {shortAddress(adminTxHash)}
            </a>
          </p>
        ) : null}
      </section>

      <section className="panel-surface p-4 md:p-5">
        <p className="section-label">Contract addresses</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["MemeFactory", protocol?.memeFactory.address ?? contracts.memeFactory],
            ["BondingCurve", protocol?.bondingCurveManager.address ?? contracts.bondingCurveManager],
            [
              "AirdropManager",
              protocol?.airdropManager?.address ?? contracts.airdropManager ?? "—",
            ],
          ].map(([label, addr]) => (
            <div
              key={label}
              className="rounded-md border border-pump-border/15 bg-pump-surface/35 px-3 py-2"
            >
              <dt className="section-label text-[10px]">{label}</dt>
              <dd className="mt-1">
                {addr && addr !== "—" ? (
                  <a
                    href={explorerAddressUrl(String(addr))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-caption font-medium text-pump-accent hover:underline"
                  >
                    {shortAddress(String(addr))}
                  </a>
                ) : (
                  <span className="text-caption text-pump-muted">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
