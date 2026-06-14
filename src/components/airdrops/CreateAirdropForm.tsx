"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatEther, formatUnits, parseEther, parseEventLogs } from "viem";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { AirdropQualifyRulesEditor, AirdropQualifyRulesPreview } from "@/components/airdrops/AirdropQualifyRules";
import { AirdropRewardSplitPreview } from "@/components/airdrops/AirdropRewardSplitPreview";
import {
  AirdropSocialTasksEditor,
  AirdropSocialTasksPreview,
} from "@/components/airdrops/AirdropSocialTasks";
import { LaunchpadTokenPicker } from "@/components/airdrops/LaunchpadTokenPicker";
import {
  BNB_REWARD_ASSET,
  isBnbRewardAsset,
  RewardAssetPicker,
} from "@/components/airdrops/RewardAssetPicker";
import {
  createDefaultSocialTasks,
  normalizeSocialTaskTarget,
  socialTaskLabel,
  validateSocialTaskUrl,
  type SocialTaskDraft,
} from "@/lib/airdrop-social";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { contracts, pumpChain } from "@/config/chain";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import { erc20Abi, maxUint256 } from "@/lib/abis/erc20";
import {
  hashAirdropRules,
  type AirdropRules,
  type AirdropSocialTaskInput,
} from "@/lib/airdrop-rules";
import type { TokenListItem } from "@/lib/db/launchpad";
import {
  CLAIM_WINDOW_SEC,
  defaultQualifyEndLocal,
  defaultQualifyStartLocal,
  endAfterStartOrDefault,
  formatDurationDhM,
  formatUtcPreview,
  localDatetimeToUnix,
  minDatetimeLocal,
  QUALIFY_END_MIN_LEAD_SEC,
  QUALIFY_MIN_DURATION_SEC,
  QUALIFY_START_MIN_LEAD_SEC,
  unixToDatetimeLocal,
  userTimezoneLabel,
  validateQualifyWindow,
} from "@/lib/airdrop-datetime";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Leave headroom for create tx gas on top of escrow + fee. */
const GAS_BUFFER_BNB = parseEther("0.002");

type PendingCreate = {
  linkedToken: `0x${string}`;
  rewardToken: `0x${string}`;
  rewardAmount: bigint;
  rulesHash: `0x${string}`;
  qualifyStart: bigint;
  qualifyEnd: bigint;
  value: bigint;
};

export function CreateAirdropForm() {
  const router = useRouter();
  const handledRef = useRef<string | null>(null);
  const pendingCreateRef = useRef<PendingCreate | null>(null);
  const socialTasksRef = useRef<SocialTaskDraft[]>([]);
  const rulesRef = useRef<AirdropRules>({});

  const { openConnectModal } = useConnectModal();
  const { address, isConnected } = useAccount();
  const [tokens, setTokens] = useState<TokenListItem[]>([]);
  const [createdTokens, setCreatedTokens] = useState<TokenListItem[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [linkedToken, setLinkedToken] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardAsset, setRewardAsset] = useState(BNB_REWARD_ASSET);
  const [rewardSliderPct, setRewardSliderPct] = useState(25);
  const [minHoldTokens, setMinHoldTokens] = useState("");
  const [minBuyBnb, setMinBuyBnb] = useState("0.01");
  const [qualifyStartLocal, setQualifyStartLocal] = useState(defaultQualifyStartLocal);
  const [qualifyEndLocal, setQualifyEndLocal] = useState(() =>
    defaultQualifyEndLocal(defaultQualifyStartLocal())
  );
  const [socialTasks, setSocialTasks] = useState<SocialTaskDraft[]>(createDefaultSocialTasks);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "create" | null>(null);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { data: createFee } = useReadContract({
    address: contracts.airdropManager,
    abi: pumpAirdropManagerAbi,
    functionName: "createFee",
    query: { enabled: Boolean(contracts.airdropManager) },
  });

  const isBnbReward = isBnbRewardAsset(rewardAsset);
  const rewardToken = isBnbReward ? "" : rewardAsset;

  const rewardTokenAddress =
    !isBnbReward && rewardToken ? (rewardToken as `0x${string}`) : undefined;

  const { data: bnbBalance } = useBalance({
    address,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  const { data: tokenAllowance, refetch: refetchAllowance } = useReadContract({
    address: rewardTokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      address && contracts.airdropManager
        ? [address, contracts.airdropManager]
        : undefined,
    query: { enabled: Boolean(rewardTokenAddress && address && contracts.airdropManager) },
  });

  const { data: rewardTokenBalance } = useReadContract({
    address: rewardTokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(rewardTokenAddress && address) },
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { data: receipt, isSuccess: receiptOk } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    (async () => {
      setTokensLoading(true);
      try {
        const res = await fetch("/api/tokens");
        const json = (await res.json()) as { data?: TokenListItem[] };
        setTokens(json.data ?? []);
      } finally {
        setTokensLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!address) {
      setCreatedTokens([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/portfolio?address=${address}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: { createdTokens?: TokenListItem[] } };
        if (!cancelled && res.ok) {
          setCreatedTokens(json.data?.createdTokens ?? []);
        }
      } catch {
        if (!cancelled) setCreatedTokens([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const allTokens = useMemo(() => {
    const map = new Map<string, TokenListItem>();
    for (const token of tokens) map.set(token.address.toLowerCase(), token);
    for (const token of createdTokens) map.set(token.address.toLowerCase(), token);
    return [...map.values()];
  }, [tokens, createdTokens]);

  const creatorTokenAddresses = useMemo(
    () => createdTokens.map((token) => token.address as `0x${string}`),
    [createdTokens]
  );

  const { data: creatorBalanceResults } = useReadContracts({
    contracts: creatorTokenAddresses.map((tokenAddress) => ({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: address ? [address as `0x${string}`] : undefined,
      chainId: pumpChain.id,
    })),
    query: { enabled: Boolean(address && creatorTokenAddresses.length > 0) },
  });

  const creatorBalanceMap = useMemo(() => {
    const map: Record<string, string> = {};
    creatorTokenAddresses.forEach((tokenAddress, index) => {
      const result = creatorBalanceResults?.[index];
      if (result?.status === "success") {
        map[tokenAddress.toLowerCase()] = formatUnits(result.result, 18);
      }
    });
    return map;
  }, [creatorBalanceResults, creatorTokenAddresses]);

  const socialTasksForSync = useMemo((): AirdropSocialTaskInput[] => {
    return socialTasks
      .filter((task) => task.enabled && task.targetUrl.trim())
      .map((task, index) => ({
        taskType: task.taskType,
        targetUrl: normalizeSocialTaskTarget(task.taskType, task.targetUrl),
        isRequired: true,
        sortOrder: index,
      }));
  }, [socialTasks]);

  const rules = useMemo((): AirdropRules => {
    const onchain: AirdropRules["onchain"] = {};
    if (minHoldTokens.trim()) onchain.minHoldWei = parseEther(minHoldTokens).toString();
    if (minBuyBnb.trim()) onchain.minBuyBnbWei = parseEther(minBuyBnb).toString();
    return {
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      onchain,
      social: socialTasksForSync.length > 0 ? socialTasksForSync : undefined,
    };
  }, [title, description, minHoldTokens, minBuyBnb, socialTasksForSync]);

  const rulesHash = useMemo(() => hashAirdropRules(rules), [rules]);

  socialTasksRef.current = socialTasks;
  rulesRef.current = rules;

  useEffect(() => {
    if (!receiptOk || !receipt || !address || !contracts.airdropManager) return;

    if (pendingAction === "approve") {
      setPendingAction(null);
      void refetchAllowance();
      const pending = pendingCreateRef.current;
      if (pending) {
        setPendingAction("create");
        writeContract({
          address: contracts.airdropManager,
          abi: pumpAirdropManagerAbi,
          functionName: "createAirdrop",
          args: [
            pending.linkedToken,
            pending.rewardToken,
            pending.rewardAmount,
            pending.rulesHash,
            pending.qualifyStart,
            pending.qualifyEnd,
          ],
          value: pending.value,
        });
      }
      return;
    }

    if (pendingAction !== "create") return;
    if (handledRef.current === receipt.transactionHash) return;
    handledRef.current = receipt.transactionHash;
    setPendingAction(null);
    pendingCreateRef.current = null;

    (async () => {
      try {
        const logs = parseEventLogs({
          abi: pumpAirdropManagerAbi,
          logs: receipt.logs,
          eventName: "AirdropCreated",
        });
        const created = logs[0];
        if (!created) throw new Error("AirdropCreated event not found");

        const qualifyStart = new Date(Number(created.args.qualifyStart) * 1000).toISOString();
        const qualifyEnd = new Date(Number(created.args.qualifyEnd) * 1000).toISOString();
        const claimStart = new Date(Number(created.args.claimStart) * 1000).toISOString();
        const claimEnd = new Date(Number(created.args.claimEnd) * 1000).toISOString();

        const syncRes = await fetch("/api/airdrops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            onChainId: created.args.airdropId.toString(),
            creatorAddress: address,
            createTxHash: receipt.transactionHash,
            linkedToken: created.args.linkedToken,
            rewardToken: created.args.rewardToken === ZERO ? null : created.args.rewardToken,
            totalFunded: formatEther(created.args.totalFunded),
            qualifyStart,
            qualifyEnd,
            claimStart,
            claimEnd,
            rules: rulesRef.current,
            rulesHash,
            socialTasks: socialTasksRef.current
              .filter((task) => task.enabled && task.targetUrl.trim())
              .map((task, index) => ({
                taskType: task.taskType,
                targetUrl: normalizeSocialTaskTarget(task.taskType, task.targetUrl),
                isRequired: true,
                sortOrder: index,
              })),
          }),
        });
        const syncJson = (await syncRes.json()) as { data?: { id: string }; error?: string };
        if (!syncRes.ok) throw new Error(syncJson.error ?? "Metadata sync failed");
        const dbId = syncJson.data?.id;
        if (!dbId) throw new Error("Airdrop saved on-chain but DB sync returned no id");
        router.push(`/airdrops/${dbId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Post-create sync failed");
        reset();
        handledRef.current = null;
      }
    })();
  }, [
    receipt,
    receiptOk,
    address,
    rulesHash,
    router,
    reset,
    pendingAction,
    refetchAllowance,
    writeContract,
  ]);

  function toggleSocialTask(taskType: SocialTaskDraft["taskType"]) {
    setSocialTasks((prev) =>
      prev.map((task) =>
        task.taskType === taskType
          ? {
              ...task,
              enabled: !task.enabled,
              targetUrl: task.enabled ? "" : task.targetUrl,
            }
          : task
      )
    );
  }

  function updateSocialTaskUrl(taskType: SocialTaskDraft["taskType"], targetUrl: string) {
    setSocialTasks((prev) =>
      prev.map((task) => (task.taskType === taskType ? { ...task, targetUrl } : task))
    );
  }

  function submitCreate(pending: PendingCreate) {
    pendingCreateRef.current = pending;
    setPendingAction("create");
    writeContract({
      address: contracts.airdropManager!,
      abi: pumpAirdropManagerAbi,
      functionName: "createAirdrop",
      args: [
        pending.linkedToken,
        pending.rewardToken,
        pending.rewardAmount,
        pending.rulesHash,
        pending.qualifyStart,
        pending.qualifyEnd,
      ],
      value: pending.value,
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }
    if (!contracts.airdropManager) {
      setError("Airdrop manager not configured");
      return;
    }
    if (!linkedToken) {
      setError("Select a target token");
      return;
    }
    if (!rules.onchain?.minHoldWei && !rules.onchain?.minBuyBnbWei) {
      setError("Set at least one on-chain rule (min hold or min buy)");
      return;
    }
    if (!isBnbReward && !rewardToken) {
      setError("Select a reward token");
      return;
    }

    const windowCheck = validateQualifyWindow(qualifyStartLocal, qualifyEndLocal);
    if (!windowCheck.ok) {
      setError(windowCheck.error);
      return;
    }
    const { startSec, endSec } = windowCheck;

    for (const task of socialTasks) {
      if (!task.enabled) continue;
      const urlError = validateSocialTaskUrl(task.taskType, task.targetUrl);
      if (urlError) {
        setError(`${socialTaskLabel(task.taskType)}: ${urlError}`);
        return;
      }
    }

    const amount = parsedRewardAmount;
    if (!amount || amount <= 0n) {
      setError("Reward amount must be greater than zero");
      return;
    }

    if (!formValidation.canSubmit) {
      setError(formValidation.warnings[0] ?? "Fix form errors before creating");
      return;
    }

    const fee = createFee ?? 0n;
    const qualifyStart = BigInt(startSec);
    const qualifyEnd = BigInt(endSec);

    const pending: PendingCreate = {
      linkedToken: linkedToken as `0x${string}`,
      rewardToken: isBnbReward ? ZERO : (rewardToken as `0x${string}`),
      rewardAmount: amount,
      rulesHash,
      qualifyStart,
      qualifyEnd,
      value: isBnbReward ? amount + fee : fee,
    };

    if (!isBnbReward) {
      const allowance = tokenAllowance ?? 0n;
      if (allowance < amount) {
        pendingCreateRef.current = pending;
        setPendingAction("approve");
        writeContract({
          address: rewardToken as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [contracts.airdropManager, maxUint256],
        });
        return;
      }
    }

    submitCreate(pending);
  }

  const tzLabel = useMemo(() => userTimezoneLabel(), []);

  const startMinLocal = useMemo(
    () => minDatetimeLocal(Math.ceil(QUALIFY_START_MIN_LEAD_SEC / 60)),
    [nowTick]
  );

  const endMinLocal = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = localDatetimeToUnix(qualifyStartLocal);
    const minEndSec = Math.max(
      (Number.isFinite(startSec) ? startSec : nowSec) + QUALIFY_MIN_DURATION_SEC,
      nowSec + QUALIFY_END_MIN_LEAD_SEC
    );
    return unixToDatetimeLocal(minEndSec);
  }, [qualifyStartLocal, nowTick]);

  const qualifyDurationLabel = useMemo(() => {
    const check = validateQualifyWindow(qualifyStartLocal, qualifyEndLocal);
    if (!check.ok) return null;
    const duration = formatDurationDhM(check.endSec - check.startSec);
    const claimWindow = formatDurationDhM(CLAIM_WINDOW_SEC);
    return `${duration} qualification · claim opens at end · ${claimWindow} claim window`;
  }, [qualifyStartLocal, qualifyEndLocal]);

  const startUtcPreview = formatUtcPreview(qualifyStartLocal);
  const endUtcPreview = formatUtcPreview(qualifyEndLocal);

  function handleQualifyStartChange(value: string) {
    setQualifyStartLocal(value);
    setQualifyEndLocal((prev) => endAfterStartOrDefault(value, prev));
  }

  const feeWei = createFee ?? 0n;

  const maxRewardWei = useMemo(() => {
    if (isBnbReward) {
      const avail = bnbBalance?.value ?? 0n;
      const overhead = feeWei + GAS_BUFFER_BNB;
      return avail > overhead ? avail - overhead : 0n;
    }
    return rewardTokenBalance ?? 0n;
  }, [isBnbReward, bnbBalance?.value, feeWei, rewardTokenBalance]);

  const parsedRewardAmount = useMemo(() => {
    if (maxRewardWei === 0n || rewardSliderPct <= 0) return null;
    const amount =
      rewardSliderPct >= 100
        ? maxRewardWei
        : (maxRewardWei * BigInt(rewardSliderPct)) / 100n;
    return amount > 0n ? amount : null;
  }, [maxRewardWei, rewardSliderPct]);

  const selectedRewardSymbol = useMemo(
    () => allTokens.find((t) => t.address === rewardToken)?.symbol ?? "tokens",
    [allTokens, rewardToken]
  );

  const selectedLinkedToken = useMemo(
    () => allTokens.find((t) => t.address.toLowerCase() === linkedToken.toLowerCase()) ?? null,
    [allTokens, linkedToken]
  );

  const totalBnbCost = useMemo(() => {
    if (!parsedRewardAmount) return null;
    return isBnbReward ? parsedRewardAmount + feeWei : feeWei;
  }, [parsedRewardAmount, isBnbReward, feeWei]);

  const canUseRewardSlider = isConnected && maxRewardWei > 0n;
  const rewardSliderFillPct = Math.max(0, Math.min(100, rewardSliderPct));

  const formValidation = useMemo(() => {
    const warnings: string[] = [];
    let canSubmit = true;

    if (!linkedToken) {
      warnings.push("Select a target token.");
      canSubmit = false;
    }

    if (!rules.onchain?.minHoldWei && !rules.onchain?.minBuyBnbWei) {
      warnings.push("Set at least one on-chain rule (min hold or min buy).");
      canSubmit = false;
    }

    if (!isBnbReward && !rewardToken) {
      warnings.push("Select a reward token.");
      canSubmit = false;
    }

    if (!parsedRewardAmount) {
      warnings.push("Set a reward amount greater than zero.");
      canSubmit = false;
    }

    const windowCheck = validateQualifyWindow(qualifyStartLocal, qualifyEndLocal);
    if (!windowCheck.ok) {
      warnings.push(windowCheck.error);
      canSubmit = false;
    }

    for (const task of socialTasks) {
      if (!task.enabled) continue;
      const urlError = validateSocialTaskUrl(task.taskType, task.targetUrl);
      if (urlError) {
        warnings.push(`${socialTaskLabel(task.taskType)}: ${urlError}`);
        canSubmit = false;
        break;
      }
    }

    if (!isConnected) {
      canSubmit = false;
    }

    const fee = createFee ?? 0n;

    if (isConnected && parsedRewardAmount) {
      const bnbAvail = bnbBalance?.value ?? 0n;

      if (isBnbReward) {
        const neededBnb = parsedRewardAmount + fee + GAS_BUFFER_BNB;
        if (bnbAvail < neededBnb) {
          warnings.push(
            `Insufficient BNB: need ${formatEther(neededBnb)} (reward + ${formatEther(fee)} fee + gas), wallet has ${formatEther(bnbAvail)}.`
          );
          canSubmit = false;
        }
      } else if (rewardToken) {
        const neededBnb = fee + GAS_BUFFER_BNB;
        if (bnbAvail < neededBnb) {
          warnings.push(
            `Insufficient BNB for create fee: need ${formatEther(neededBnb)} (${formatEther(fee)} fee + gas), wallet has ${formatEther(bnbAvail)}.`
          );
          canSubmit = false;
        }

        const tokenAvail = rewardTokenBalance ?? 0n;
        if (tokenAvail < parsedRewardAmount) {
          warnings.push(
            `Insufficient ${selectedRewardSymbol}: need ${formatEther(parsedRewardAmount)}, wallet has ${formatEther(tokenAvail)}.`
          );
          canSubmit = false;
        }
      }
    }

    return { warnings, canSubmit };
  }, [
    linkedToken,
    rules.onchain?.minHoldWei,
    rules.onchain?.minBuyBnbWei,
    rewardAsset,
    isBnbReward,
    rewardToken,
    parsedRewardAmount,
    qualifyStartLocal,
    qualifyEndLocal,
    socialTasks,
    isConnected,
    createFee,
    bnbBalance?.value,
    rewardTokenBalance,
    selectedRewardSymbol,
  ]);

  if (!contracts.airdropManager) {
    return (
      <div className="notice-error p-4 text-body-sm">
        NEXT_PUBLIC_AIRDROP_MANAGER is not set.
      </div>
    );
  }

  const busy = isPending || Boolean(txHash && !error);
  const submitDisabled = busy || !formValidation.canSubmit;
  const displayTitle = title.trim() || "Your campaign";
  const displayPoolSymbol = selectedLinkedToken?.symbol ?? "TOKEN";

  const submitLabel = !isConnected
    ? "Connect wallet"
    : pendingAction === "approve"
      ? "Approving token…"
      : busy
        ? "Creating…"
        : "Create campaign";

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 xl:grid-cols-[5fr_7fr] xl:items-start"
    >
      <div className="space-y-4 xl:max-w-[640px]">
        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Target token</p>
          <p className="mt-1 field-hint">
            Participants qualify by holding or buying this launchpad token.
          </p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            {selectedLinkedToken ? (
              <div className="flex shrink-0 flex-col items-center gap-2">
                <TokenAvatar
                  address={selectedLinkedToken.address}
                  symbol={selectedLinkedToken.symbol}
                  logoUrl={selectedLinkedToken.logoUrl}
                  size={72}
                />
                <p className="text-caption font-medium text-pump-text">
                  ${selectedLinkedToken.symbol}
                </p>
              </div>
            ) : (
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-dashed border-pump-border/30 bg-pump-surface/40 text-caption text-pump-muted">
                Pool
              </div>
            )}

            <div className="min-w-0 flex-1">
              <LaunchpadTokenPicker
                id="linkedToken"
                modalTitle="Select pool token"
                label={
                  <>
                    Pool token <span className="text-pump-accent">*</span>
                  </>
                }
                value={linkedToken}
                onChange={setLinkedToken}
                tokens={tokens}
                priorityTokens={createdTokens}
                balances={creatorBalanceMap}
                loading={tokensLoading}
                placeholder="Select a launchpad token"
                hint={
                  selectedLinkedToken ? (
                    <p className="field-hint">
                      <Link
                        href={`/token/${selectedLinkedToken.address}`}
                        className="text-pump-accent hover:underline"
                      >
                        View ${selectedLinkedToken.symbol} on Arena
                      </Link>
                    </p>
                  ) : null
                }
              />
            </div>
          </div>
        </section>

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Campaign info</p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="field-label" htmlFor="campaignTitle">
                Campaign title
              </label>
              <input
                id="campaignTitle"
                className="field-input"
                placeholder="e.g. Early holder rewards"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="campaignDescription">
                Description
              </label>
              <textarea
                id="campaignDescription"
                className="field-textarea"
                rows={4}
                placeholder="Explain who qualifies and how rewards are distributed."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
              <p className="mt-1 field-hint">{description.length}/2000</p>
            </div>
          </div>
        </section>

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Reward pool</p>
          <p className="mt-1 field-hint">
            Funds are locked in on-chain escrow. TOP 100 wallets split the pool after qualify ends.
          </p>

          <div className="mt-4 space-y-4">
            <RewardAssetPicker
              id="rewardAsset"
              modalTitle="Select reward asset"
              label={
                <>
                  Reward token <span className="text-pump-accent">*</span>
                </>
              }
              value={rewardAsset}
              onChange={setRewardAsset}
              tokens={tokens}
              priorityTokens={createdTokens}
              tokenBalances={creatorBalanceMap}
              bnbBalance={
                bnbBalance != null ? formatEther(bnbBalance.value) : isConnected ? "0" : null
              }
              loading={tokensLoading}
              placeholder="Select reward asset"
              hint={
                !isConnected ? (
                  <p className="field-hint">Connect wallet to see BNB and token balances.</p>
                ) : !isBnbReward ? (
                  <p className="field-hint">
                    Token rewards require a one-time approval, plus{" "}
                    {createFee !== undefined ? formatEther(createFee) : "…"} BNB create fee.
                  </p>
                ) : null
              }
            />

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label className="field-label" htmlFor="rewardAmountSlider">
                  Total reward amount <span className="text-pump-accent">*</span>
                </label>
                <p className="financial-value text-body-sm font-semibold text-pump-text">
                  {parsedRewardAmount
                    ? `${formatEther(parsedRewardAmount)} ${isBnbReward ? "BNB" : selectedRewardSymbol}`
                    : "—"}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-2.5">
                <div className="relative min-w-0 flex-1 pt-1">
                  <div
                    className="pointer-events-none absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-pump-border/25"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-pump-accent/70 transition-[width] duration-75"
                    style={{ width: `${rewardSliderFillPct}%` }}
                    aria-hidden
                  />
                  <input
                    id="rewardAmountSlider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={rewardSliderPct}
                    onChange={(e) => setRewardSliderPct(Number(e.target.value))}
                    disabled={!canUseRewardSlider}
                    className="trade-amount-slider relative z-[1] w-full disabled:opacity-40"
                    aria-label="Reward amount slider"
                    aria-valuetext={
                      rewardSliderPct >= 100
                        ? "Max"
                        : `${rewardSliderPct}% of available ${isBnbReward ? "BNB" : selectedRewardSymbol}`
                    }
                  />
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={!canUseRewardSlider}
                  onClick={() => setRewardSliderPct(100)}
                  className="chip-button shrink-0 px-2.5 py-1 text-caption disabled:opacity-40"
                >
                  Max
                </button>
              </div>

              <p className="mt-1.5 field-hint">
                {canUseRewardSlider
                  ? `${rewardSliderPct}% of available balance${
                      isBnbReward ? " (after fee & gas reserve)" : ""
                    }`
                  : isConnected
                    ? "Insufficient balance for a reward pool."
                    : "Connect wallet to set reward amount."}
              </p>
            </div>
          </div>
        </section>

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Qualification window</p>
          <p className="mt-1 field-hint">
            Local timezone ({tzLabel}). Stored on-chain as UTC. Past times cannot be selected.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="qualifyStart">
                Start
              </label>
              <input
                id="qualifyStart"
                type="datetime-local"
                className="field-input"
                value={qualifyStartLocal}
                min={startMinLocal}
                onChange={(e) => handleQualifyStartChange(e.target.value)}
              />
              {startUtcPreview ? (
                <p className="mt-1 field-hint">On-chain: {startUtcPreview}</p>
              ) : null}
            </div>
            <div>
              <label className="field-label" htmlFor="qualifyEnd">
                End
              </label>
              <input
                id="qualifyEnd"
                type="datetime-local"
                className="field-input"
                value={qualifyEndLocal}
                min={endMinLocal}
                onChange={(e) => setQualifyEndLocal(e.target.value)}
              />
              {endUtcPreview ? (
                <p className="mt-1 field-hint">On-chain: {endUtcPreview}</p>
              ) : null}
            </div>
          </div>

          {qualifyDurationLabel ? (
            <p className="mt-3 field-hint">{qualifyDurationLabel}</p>
          ) : (
            <p className="mt-3 text-caption text-pump-warning">
              End must be at least 15 minutes after start and in the future.
            </p>
          )}
        </section>

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">On-chain rules</p>
          <p className="mt-1 field-hint">At least one rule is required to qualify wallets.</p>

          <AirdropQualifyRulesEditor
            linkedToken={selectedLinkedToken}
            minHoldTokens={minHoldTokens}
            minBuyBnb={minBuyBnb}
            onMinHoldChange={setMinHoldTokens}
            onMinBuyChange={setMinBuyBnb}
          />
        </section>

        <AirdropSocialTasksEditor
          tasks={socialTasks}
          onToggle={toggleSocialTask}
          onUrlChange={updateSocialTaskUrl}
        />
      </div>

      <aside className="space-y-2.5 xl:sticky xl:top-16 xl:min-w-0">
        <section className="rounded-lg border border-pump-accent/25 bg-gradient-to-br from-pump-accent/12 via-pump-card/70 to-pump-surface/55 p-3 md:p-4">
          <p className="section-label">Preview</p>
          <div className="mt-2 flex items-center gap-2.5">
            {selectedLinkedToken ? (
              <TokenAvatar
                address={selectedLinkedToken.address}
                symbol={selectedLinkedToken.symbol}
                logoUrl={selectedLinkedToken.logoUrl}
                size={40}
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-pump-border/30 bg-pump-surface/40 text-caption text-pump-muted">
                ?
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-pump-text">{displayTitle}</p>
              <p className="text-caption text-pump-muted">Pool ${displayPoolSymbol}</p>
            </div>
          </div>
          {description.trim() ? (
            <p className="mt-2 text-caption leading-snug text-pump-muted line-clamp-2">
              {description.trim()}
            </p>
          ) : (
            <p className="mt-2 text-caption leading-snug text-pump-warning">
              Add a description so participants understand the campaign.
            </p>
          )}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-pump-border/15 pt-2 text-caption">
            <dt className="text-pump-muted">Qualify</dt>
            <dd className="financial-value text-right text-pump-text">
              {qualifyDurationLabel ?? "Set window"}
            </dd>
            <dt className="self-start text-pump-muted">Rules</dt>
            <dd>
              <AirdropQualifyRulesPreview
                linkedToken={selectedLinkedToken}
                minHoldTokens={minHoldTokens}
                minBuyBnb={minBuyBnb}
              />
            </dd>
            <AirdropSocialTasksPreview tasks={socialTasksForSync} />
          </dl>
        </section>

        <AirdropRewardSplitPreview
          totalReward={parsedRewardAmount}
          assetLabel={isBnbReward ? "BNB" : selectedRewardSymbol}
        />

        <section className="panel-surface p-3 md:p-4">
          <p className="section-label">Campaign summary</p>
          <dl className="mt-2 space-y-1.5 text-caption">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-pump-muted">Reward pool</dt>
              <dd className="financial-value font-medium text-pump-text">
                {parsedRewardAmount
                  ? `${formatEther(parsedRewardAmount)} ${isBnbReward ? "BNB" : selectedRewardSymbol}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-pump-muted">Create fee</dt>
              <dd className="financial-value font-medium text-pump-text">
                {createFee !== undefined ? `${formatEther(createFee)} BNB` : "…"}
              </dd>
            </div>
            {!isBnbReward && parsedRewardAmount ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-pump-muted">Token escrow</dt>
                <dd className="financial-value font-medium text-pump-text">
                  {formatEther(parsedRewardAmount)} {selectedRewardSymbol}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 border-t border-pump-border/15 pt-1.5">
              <dt className="font-medium text-pump-text">Total BNB</dt>
              <dd className="financial-value text-body-sm font-semibold text-pump-text">
                {totalBnbCost != null ? `${formatEther(totalBnbCost)} BNB` : "—"}
              </dd>
            </div>
          </dl>

          {error ? <p className="notice-error mt-2 text-caption">{error}</p> : null}

          {formValidation.warnings.length > 0 ? (
            <ul className="mt-2 space-y-1 rounded-md border border-pump-warning/30 bg-pump-warning/5 px-2.5 py-2">
              {formValidation.warnings.map((warning) => (
                <li key={warning} className="text-[11px] leading-snug text-pump-warning">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="submit"
            disabled={submitDisabled}
            className="primary-button mt-3 flex w-full items-center justify-center gap-2"
          >
            {busy ? (
              <span
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
            ) : null}
            {submitLabel}
          </button>
        </section>
      </aside>
    </form>
  );
}
