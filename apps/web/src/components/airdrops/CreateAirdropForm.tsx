"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEther, formatUnits, parseEther } from "viem";
import { FormExecutionStatus } from "@/components/ui/FormExecutionStatus";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { BnbLogo } from "@/components/token/BnbLogo";
import {
  BnbAmountDisplay,
  RewardAmountDisplay,
  TokenAssetChip,
} from "@/components/token/AssetAmountDisplay";
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
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { useKernelWriteContract } from "@/hooks/useKernelWriteContract";
import { formatTradeError } from "@/lib/trade-errors";
import { fetchAirdropCreatedFromTx, lookupAirdropDbIdByTxHash } from "@/lib/airdrop-create-tx";
import { createPumpPublicClient } from "@/lib/aa/kernel-account";
import {
  useAccount,
  useBalance,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
} from "wagmi";
import { contracts, NATIVE_SYMBOL, pumpChain } from "@/config/chain";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import { erc20Abi, maxUint256 } from "@/lib/abis/erc20";
import {
  hashAirdropRules,
  type AirdropRules,
  type AirdropSocialTaskInput,
} from "@/lib/airdrop-rules";
import type { TokenListItem } from "@/lib/db/launchpad";
import { EMPTY_SOCIAL_LINKS } from "@/lib/token-social";
import {
  defaultQualifyEndLocal,
  defaultQualifyStartLocal,
  endAfterStartOrDefault,
  formatDurationDhM,
  localDatetimeToUnix,
  minDatetimeLocal,
  QUALIFY_END_MIN_LEAD_SEC,
  QUALIFY_MIN_DURATION_SEC,
  QUALIFY_START_MIN_LEAD_SEC,
  unixToDatetimeLocal,
  validateQualifyWindow,
} from "@/lib/airdrop-datetime";
import { formatCampaignAmount, formatCampaignAmountInput, floorCampaignAmountWei, formatAirdropReward } from "@/lib/airdrop-board-format";
import { useCreateGasReserve } from "@/hooks/useCreateGasReserve";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

function tryParseEtherWei(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const wei = parseEther(trimmed);
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
}

function rewardPoolValidationMessage(opts: {
  isConnected: boolean;
  maxRewardWei: bigint;
  rewardAmountInput: string;
  parsedRewardWei: bigint | null;
  isBnbReward: boolean;
  rewardSymbol: string;
}): string {
  if (!opts.isConnected) return "Connect wallet to set pool size.";
  if (opts.maxRewardWei === 0n) {
    return opts.isBnbReward
      ? `Need more ${NATIVE_SYMBOL} for reward pool (balance must cover create fee and gas).`
      : `Insufficient ${opts.rewardSymbol} balance for reward pool.`;
  }
  if (!opts.rewardAmountInput.trim()) return "Enter a pool size.";
  if (opts.parsedRewardWei == null) return "Enter a valid pool size.";
  if (opts.parsedRewardWei <= 0n) return "Pool size must be greater than zero.";
  if (opts.parsedRewardWei > opts.maxRewardWei) {
    return opts.isBnbReward
      ? `Pool size exceeds available ${NATIVE_SYMBOL} (after fee and gas).`
      : `Pool size exceeds your ${opts.rewardSymbol} balance.`;
  }
  return "Pool size is too small; increase the amount.";
}

type PendingCreate = {
  linkedToken: `0x${string}`;
  rewardToken: `0x${string}`;
  rewardAmount: bigint;
  rulesHash: `0x${string}`;
  qualifyStart: bigint;
  qualifyEnd: bigint;
  value: bigint;
};

type CreateAirdropFormProps = {
  initialLinkedToken?: string;
  initialLinkedTokenName?: string;
  initialLinkedTokenSymbol?: string;
};

export function CreateAirdropForm({
  initialLinkedToken,
  initialLinkedTokenName,
  initialLinkedTokenSymbol,
}: CreateAirdropFormProps = {}) {
  const router = useRouter();
  const handledRef = useRef<string | null>(null);
  const approveTxHashRef = useRef<string | null>(null);
  const pendingCreateRef = useRef<PendingCreate | null>(null);
  const socialTasksRef = useRef<SocialTaskDraft[]>([]);
  const rulesRef = useRef<AirdropRules>({});

  const { openConnectModal } = useOpenConnectModal();
  const { openFundChoice } = useWalletFunding();
  const { address, isConnected } = useAccount();
  const [tokens, setTokens] = useState<TokenListItem[]>([]);
  const [createdTokens, setCreatedTokens] = useState<TokenListItem[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [linkedToken, setLinkedToken] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardAsset, setRewardAsset] = useState(BNB_REWARD_ASSET);
  const [rewardAmountInput, setRewardAmountInput] = useState("");
  const [minHoldTokens, setMinHoldTokens] = useState("");
  const [minBuyBnb, setMinBuyBnb] = useState("0.01");
  const [qualifyStartLocal, setQualifyStartLocal] = useState(defaultQualifyStartLocal);
  const [qualifyEndLocal, setQualifyEndLocal] = useState(() =>
    defaultQualifyEndLocal(defaultQualifyStartLocal())
  );
  const [socialTasks, setSocialTasks] = useState<SocialTaskDraft[]>(createDefaultSocialTasks);
  const [socialOpen, setSocialOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "create" | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const prevRewardAssetRef = useRef(rewardAsset);

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

  const { data: airdropAdmin } = useReadContract({
    address: contracts.airdropManager,
    abi: pumpAirdropManagerAbi,
    functionName: "admin",
    query: { enabled: Boolean(contracts.airdropManager) },
  });

  const { data: isAirdropFeeExempt } = useReadContract({
    address: contracts.airdropManager,
    abi: pumpAirdropManagerAbi,
    functionName: "feeExempt",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(contracts.airdropManager && address) },
  });

  const effectiveCreateFee = useMemo(() => {
    const base = createFee ?? 0n;
    if (!address) return base;
    const lower = address.toLowerCase();
    if (airdropAdmin && lower === airdropAdmin.toLowerCase()) return 0n;
    if (isAirdropFeeExempt) return 0n;
    return base;
  }, [createFee, address, airdropAdmin, isAirdropFeeExempt]);

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

  const { writeContract, data: txHash, isPending, reset, error: writeError } =
    useKernelWriteContract();
  const { data: receipt, isSuccess: receiptOk, isLoading: isConfirming } =
    useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!writeError) return;
    setPendingAction(null);
    pendingCreateRef.current = null;
    setError(formatTradeError(writeError));
  }, [writeError]);

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
        const res = await fetch(`/api/portfolio?address=${address}&createdLimit=all`, { cache: "no-store" });
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

  useEffect(() => {
    if (!initialLinkedToken) return;
    const normalized = initialLinkedToken.trim().toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(normalized)) {
      setLinkedToken(normalized);
    }
  }, [initialLinkedToken]);

  const allTokens = useMemo(() => {
    const map = new Map<string, TokenListItem>();
    for (const token of tokens) map.set(token.address.toLowerCase(), token);
    for (const token of createdTokens) map.set(token.address.toLowerCase(), token);

    if (initialLinkedToken) {
      const normalized = initialLinkedToken.trim().toLowerCase();
      if (/^0x[a-f0-9]{40}$/.test(normalized) && !map.has(normalized)) {
        map.set(normalized, {
          address: normalized,
          name: initialLinkedTokenName?.trim() || "New token",
          symbol: initialLinkedTokenSymbol?.trim().toUpperCase() || "TOKEN",
          creatorAddress: address ?? "",
          status: "bonding",
          createdAt: new Date().toISOString(),
          launchBlockNumber: "0",
          progressBps: 0,
          reserveBnb: "0",
          marketCapBnb: "0",
          holderCount: 0,
          logoUrl: null,
          socialLinks: EMPTY_SOCIAL_LINKS,
          creatorHoldPct: null,
          top10HoldPct: null,
        });
      }
    }

    return [...map.values()];
  }, [tokens, createdTokens, initialLinkedToken, initialLinkedTokenName, initialLinkedTokenSymbol, address]);

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
    const holdWei = tryParseEtherWei(minHoldTokens);
    const buyWei = tryParseEtherWei(minBuyBnb);
    if (holdWei != null) onchain.minHoldWei = holdWei.toString();
    if (buyWei != null) onchain.minBuyBnbWei = buyWei.toString();
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
    if (!receiptOk || !receipt || !address || !contracts.airdropManager || !txHash) return;

    if (pendingAction === "approve") {
      approveTxHashRef.current = receipt.transactionHash;
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
    if (receipt.transactionHash !== txHash) return;
    if (approveTxHashRef.current && receipt.transactionHash === approveTxHashRef.current) return;
    if (handledRef.current === receipt.transactionHash) return;
    handledRef.current = receipt.transactionHash;
    setPendingAction(null);
    pendingCreateRef.current = null;
    approveTxHashRef.current = null;

    (async () => {
      try {
        const publicClient = createPumpPublicClient();
        let created;
        try {
          created = await fetchAirdropCreatedFromTx(publicClient, receipt.transactionHash);
        } catch {
          const existingId = await lookupAirdropDbIdByTxHash(receipt.transactionHash);
          if (existingId) {
            router.push(`/airdrops/${existingId}`);
            return;
          }
          throw new Error("AirdropCreated event not found");
        }

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
        if (!syncRes.ok) {
          const existingId = await lookupAirdropDbIdByTxHash(receipt.transactionHash);
          if (existingId) {
            router.push(`/airdrops/${existingId}`);
            return;
          }
          throw new Error(syncJson.error ?? "Metadata sync failed");
        }
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
    txHash,
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
    reset();
    approveTxHashRef.current = null;

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
      if (formValidation.needsBnbFunding) {
        openAirdropFundingModal();
        return;
      }
      setError(
        rewardPoolValidationMessage({
          isConnected: Boolean(address),
          maxRewardWei,
          rewardAmountInput,
          parsedRewardWei,
          isBnbReward,
          rewardSymbol: selectedRewardSymbol,
        })
      );
      return;
    }

    if (formValidation.needsBnbFunding) {
      openAirdropFundingModal();
      return;
    }

    if (!formValidation.canSubmit) {
      setError(formValidation.warnings[0] ?? "Fix form errors before creating");
      return;
    }

    const fee = effectiveCreateFee;
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
    return `${duration} qualify window`;
  }, [qualifyStartLocal, qualifyEndLocal]);

  function handleQualifyStartChange(value: string) {
    setQualifyStartLocal(value);
    setQualifyEndLocal((prev) => endAfterStartOrDefault(value, prev));
  }

  const feeWei = effectiveCreateFee;

  const parsedRewardWei = useMemo(
    () => tryParseEtherWei(rewardAmountInput),
    [rewardAmountInput]
  );

  const needsTokenApprove = useMemo(() => {
    if (isBnbReward || !rewardTokenAddress || parsedRewardWei == null || parsedRewardWei <= 0n) {
      return false;
    }
    return (tokenAllowance ?? 0n) < parsedRewardWei;
  }, [isBnbReward, rewardTokenAddress, tokenAllowance, parsedRewardWei]);

  const { gasReserveWei, isLoading: gasReserveLoading } = useCreateGasReserve({
    kind: "airdrop",
    enabled: isConnected && Boolean(address) && Boolean(contracts.airdropManager),
    address,
    needsApprove: needsTokenApprove,
    rewardToken: rewardTokenAddress,
  });
  const gasWei = gasReserveWei ?? 0n;

  const maxRewardWei = useMemo(() => {
    if (isBnbReward) {
      const avail = bnbBalance?.value ?? 0n;
      const overhead = feeWei + gasWei;
      return avail > overhead ? avail - overhead : 0n;
    }
    return rewardTokenBalance ?? 0n;
  }, [isBnbReward, bnbBalance?.value, feeWei, gasWei, rewardTokenBalance]);

  const parsedRewardAmount = useMemo(() => {
    if (parsedRewardWei == null || parsedRewardWei <= 0n) return null;
    if (maxRewardWei > 0n && parsedRewardWei > maxRewardWei) return null;
    return parsedRewardWei;
  }, [parsedRewardWei, maxRewardWei]);

  const maxRewardInputWei = useMemo(
    () => (maxRewardWei > 0n ? floorCampaignAmountWei(maxRewardWei) : 0n),
    [maxRewardWei]
  );

  const maxRewardLabel = useMemo(
    () => (maxRewardWei > 0n ? formatCampaignAmount(maxRewardWei) : "—"),
    [maxRewardWei]
  );

  const canUseRewardSlider = isConnected && maxRewardWei > 0n;

  const rewardSliderPct = useMemo(() => {
    if (maxRewardInputWei === 0n || parsedRewardWei == null || parsedRewardWei <= 0n) return 0;
    const clamped =
      parsedRewardWei > maxRewardInputWei ? maxRewardInputWei : parsedRewardWei;
    const scaled = Number((clamped * 10000n) / maxRewardInputWei) / 100;
    return Math.max(0, Math.min(100, scaled));
  }, [parsedRewardWei, maxRewardInputWei]);

  const rewardSliderFillPct = rewardSliderPct;

  function applyRewardSliderPct(pct: number) {
    const clamped = Math.max(0, Math.min(100, pct));
    if (maxRewardWei === 0n) {
      setRewardAmountInput("");
      return;
    }
    const wei =
      clamped >= 100
        ? maxRewardInputWei
        : floorCampaignAmountWei((maxRewardWei * BigInt(clamped)) / 100n);
    setRewardAmountInput(wei > 0n ? formatCampaignAmountInput(wei) : "");
  }

  useEffect(() => {
    if (prevRewardAssetRef.current === rewardAsset) return;
    prevRewardAssetRef.current = rewardAsset;
    if (maxRewardWei === 0n) {
      setRewardAmountInput("");
      return;
    }
    const defaultWei = floorCampaignAmountWei((maxRewardWei * 25n) / 100n);
    setRewardAmountInput(
      formatCampaignAmountInput(defaultWei > 0n ? defaultWei : maxRewardInputWei)
    );
  }, [rewardAsset, maxRewardWei, maxRewardInputWei]);

  useEffect(() => {
    if (maxRewardWei === 0n) return;
    setRewardAmountInput((prev) => {
      if (prev.trim()) return prev;
      const defaultWei = floorCampaignAmountWei((maxRewardWei * 25n) / 100n);
      return formatCampaignAmountInput(defaultWei > 0n ? defaultWei : maxRewardInputWei);
    });
  }, [maxRewardWei, maxRewardInputWei]);

  const selectedRewardSymbol = useMemo(
    () => allTokens.find((t) => t.address === rewardToken)?.symbol ?? "tokens",
    [allTokens, rewardToken]
  );

  const selectedRewardToken = useMemo(
    () =>
      isBnbReward || !rewardToken
        ? null
        : allTokens.find((t) => t.address.toLowerCase() === rewardToken.toLowerCase()) ?? null,
    [allTokens, rewardToken, isBnbReward]
  );

  const selectedLinkedToken = useMemo(
    () => allTokens.find((t) => t.address.toLowerCase() === linkedToken.toLowerCase()) ?? null,
    [allTokens, linkedToken]
  );

  const totalBnbCost = useMemo(() => {
    if (!parsedRewardAmount) return null;
    return isBnbReward ? parsedRewardAmount + feeWei : feeWei;
  }, [parsedRewardAmount, isBnbReward, feeWei]);

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
    } else {
      if (minHoldTokens.trim() && !rules.onchain?.minHoldWei) {
        warnings.push("Min hold must be a valid token amount.");
        canSubmit = false;
      }
      if (minBuyBnb.trim() && !rules.onchain?.minBuyBnbWei) {
        warnings.push(`Min buy must be a valid ${NATIVE_SYMBOL} amount.`);
        canSubmit = false;
      }
    }

    if (!isBnbReward && !rewardToken) {
      warnings.push("Select a reward token.");
      canSubmit = false;
    }

    if (!parsedRewardAmount) {
      warnings.push(
        rewardPoolValidationMessage({
          isConnected,
          maxRewardWei,
          rewardAmountInput,
          parsedRewardWei,
          isBnbReward,
          rewardSymbol: selectedRewardSymbol,
        })
      );
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

    let canSubmitExceptBnb = canSubmit;
    let needsBnbFunding = false;
    let bnbShortfallWei = 0n;
    let fundMessage = "";

    const fee = effectiveCreateFee;

    if (isConnected && bnbBalance !== undefined && !gasReserveLoading) {
      const bnbAvail = bnbBalance.value;
      const minBnbNeeded = fee + gasWei;

      if (isBnbReward) {
        const targetReward = parsedRewardAmount ?? 0n;
        const neededBnb =
          targetReward > 0n ? targetReward + minBnbNeeded : minBnbNeeded;

        if (bnbAvail < neededBnb) {
          bnbShortfallWei = neededBnb - bnbAvail;
          needsBnbFunding = true;
          fundMessage =
            targetReward > 0n
              ? `You need ${formatCampaignAmount(bnbShortfallWei)} more ${NATIVE_SYMBOL} for the reward pool, create fee, and gas.`
              : `You need ${formatCampaignAmount(bnbShortfallWei)} more ${NATIVE_SYMBOL} for the create fee and gas.`;
        }
      } else if (rewardToken) {
        if (bnbAvail < minBnbNeeded) {
          bnbShortfallWei = minBnbNeeded - bnbAvail;
          needsBnbFunding = true;
          fundMessage = `You need ${formatCampaignAmount(bnbShortfallWei)} more ${NATIVE_SYMBOL} for the create fee and gas.`;
        }
      }
    }

    if (isConnected && parsedRewardAmount && !gasReserveLoading) {
      const bnbAvail = bnbBalance?.value ?? 0n;

      if (isBnbReward) {
        const neededBnb = parsedRewardAmount + fee + gasWei;
        if (bnbAvail < neededBnb) {
          warnings.push(
            `Need ${formatCampaignAmount(neededBnb - bnbAvail)} more ${NATIVE_SYMBOL} for reward pool, create fee, and gas.`
          );
          canSubmit = false;
        }
      } else if (rewardToken) {
        const neededBnb = fee + gasWei;
        if (bnbAvail < neededBnb) {
          warnings.push(
            `Need ${formatCampaignAmount(neededBnb - bnbAvail)} more ${NATIVE_SYMBOL} for create fee and gas.`
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
    } else if (isConnected && isBnbReward && maxRewardWei === 0n && bnbBalance !== undefined && !gasReserveLoading) {
      const minBnbNeeded = fee + gasWei;
      if (bnbBalance.value < minBnbNeeded) {
        warnings.push(
          `Need ${formatCampaignAmount(minBnbNeeded - bnbBalance.value)} more ${NATIVE_SYMBOL} for create fee and gas.`
        );
        canSubmit = false;
      }
    }

    return { warnings, canSubmit, canSubmitExceptBnb, needsBnbFunding, bnbShortfallWei, fundMessage };
  }, [
    linkedToken,
    rules.onchain?.minHoldWei,
    rules.onchain?.minBuyBnbWei,
    rewardAsset,
    isBnbReward,
    rewardToken,
    parsedRewardAmount,
    maxRewardWei,
    rewardAmountInput,
    parsedRewardWei,
    qualifyStartLocal,
    qualifyEndLocal,
    socialTasks,
    isConnected,
    createFee,
    effectiveCreateFee,
    bnbBalance?.value,
    rewardTokenBalance,
    selectedRewardSymbol,
    gasWei,
    gasReserveLoading,
  ]);

  if (!contracts.airdropManager) {
    return (
      <div className="notice-error p-4 text-body-sm">
        NEXT_PUBLIC_AIRDROP_MANAGER is not set.
      </div>
    );
  }

  function openAirdropFundingModal() {
    openFundChoice({
      title: `Add ${NATIVE_SYMBOL} to create campaign`,
      message:
        formValidation.fundMessage ||
        `You need ${formatCampaignAmount(formValidation.bnbShortfallWei)} more ${NATIVE_SYMBOL} to create this campaign.`,
    });
  }

  const busy = isPending || isConfirming || (Boolean(txHash) && !receiptOk && !error && !writeError);
  const displayError = error ?? (writeError ? formatTradeError(writeError) : null);
  const canUseFundingCta = formValidation.needsBnbFunding && isConnected;
  const submitDisabled = busy || (!formValidation.canSubmit && !canUseFundingCta);
  const displayTitle = title.trim() || "Your campaign";
  const displayPoolSymbol = selectedLinkedToken?.symbol ?? "TOKEN";

  const formSubmitPhase =
    pendingAction === "approve" || (isPending && !isConfirming)
      ? "submitting"
      : busy && (isConfirming || Boolean(txHash))
        ? "confirming"
        : null;
  const formSubmitPending = formSubmitPhase !== null;
  const formStatusDetail =
    formSubmitPhase === "submitting"
      ? pendingAction === "approve"
        ? "Authorizing token spend on your wallet"
        : "Signing and submitting your campaign"
      : formSubmitPhase === "confirming"
        ? "Awaiting on-chain confirmation"
        : null;

  const submitLabel = !isConnected
    ? "Connect wallet"
    : canUseFundingCta
      ? `Add ${NATIVE_SYMBOL} to create`
      : formSubmitPending
        ? formSubmitPhase === "submitting"
          ? pendingAction === "approve"
            ? "Approving"
            : "Processing"
          : "Confirming"
        : "Create campaign";

  const rewardAssetLabel = isBnbReward ? NATIVE_SYMBOL : selectedRewardSymbol;
  const rewardAmountValue =
    parsedRewardAmount != null ? formatCampaignAmount(parsedRewardAmount) : "—";
  const boardRewardLabel =
    parsedRewardAmount != null
      ? formatAirdropReward(formatEther(parsedRewardAmount), {
          isBnb: isBnbReward,
          symbol: selectedRewardSymbol,
        })
      : "—";
  const createFeeValue =
    effectiveCreateFee !== undefined || createFee !== undefined
      ? formatCampaignAmount(feeWei)
      : "…";
  const totalBnbValue =
    totalBnbCost != null ? formatCampaignAmount(totalBnbCost) : "—";

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] xl:items-start"
    >
      <div className="space-y-4">
        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">1 · Campaign</p>
          <p className="mt-1 field-hint">Pool token, title, and short description.</p>

          <div className="mt-4 space-y-4">
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
                  <p className="field-hint inline-flex flex-wrap items-center gap-1">
                    Holders and buyers of{" "}
                    <TokenAssetChip
                      address={selectedLinkedToken.address}
                      symbol={selectedLinkedToken.symbol}
                      logoUrl={selectedLinkedToken.logoUrl}
                      size={14}
                    />{" "}
                    can qualify.
                  </p>
                ) : null
              }
            />

            <div>
              <label className="field-label" htmlFor="campaignTitle">
                Title <span className="text-pump-accent">*</span>
              </label>
              <input
                id="campaignTitle"
                className="field-input"
                placeholder="Early holder rewards"
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
                rows={3}
                placeholder="Who qualifies and how rewards are split."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
              <p className="mt-1 field-hint">{description.length}/2000</p>
            </div>
          </div>
        </section>

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">2 · Reward & timing</p>
          <p className="mt-1 field-hint">
            Escrow locks until qualify ends. TOP 100 wallets split the pool.
          </p>

          <div className="mt-4 space-y-4">
            <RewardAssetPicker
              id="rewardAsset"
              modalTitle="Select reward asset"
              label={
                <>
                  Reward <span className="text-pump-accent">*</span>
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
              placeholder={`${NATIVE_SYMBOL} or launchpad token`}
              hint={
                !isConnected ? (
                  <p className="field-hint">Connect wallet to see balances.</p>
                ) : !isBnbReward ? (
                  <p className="field-hint">Token rewards need one approval + create fee in {NATIVE_SYMBOL}.</p>
                ) : null
              }
            />

            <div>
              <label className="field-label" htmlFor="rewardAmount">
                Pool size <span className="text-pump-accent">*</span>
              </label>
              <div className="relative mt-1 max-w-xs">
                {isBnbReward ? (
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <BnbLogo size={20} />
                  </div>
                ) : selectedRewardToken ? (
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <TokenAvatar
                      address={selectedRewardToken.address}
                      symbol={selectedRewardToken.symbol}
                      logoUrl={selectedRewardToken.logoUrl}
                      size={20}
                    />
                  </div>
                ) : null}
                <input
                  id="rewardAmount"
                  inputMode="decimal"
                  value={rewardAmountInput}
                  onChange={(e) => setRewardAmountInput(e.target.value)}
                  placeholder="0"
                  disabled={!isConnected}
                  className={`field-input financial-value w-full pr-14 ${
                    isBnbReward || selectedRewardToken ? "pl-11" : ""
                  }`}
                />
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <span className="text-caption font-medium text-pump-muted">
                    {isBnbReward ? NATIVE_SYMBOL : selectedRewardSymbol}
                  </span>
                </div>
              </div>
              {canUseRewardSlider ? (
                <p className="mt-1 field-hint">
                  Max available{" "}
                  <span className="financial-value text-pump-text">{maxRewardLabel}</span>
                  {isBnbReward ? ` ${NATIVE_SYMBOL}` : ` ${selectedRewardSymbol}`}.
                </p>
              ) : null}

              {canUseFundingCta ? (
                <div className="mt-2 rounded-md border border-pump-warning/30 bg-pump-warning/10 px-2.5 py-2">
                  <p className="text-caption leading-snug text-pump-warning">
                    {formValidation.fundMessage}
                  </p>
                  <button
                    type="button"
                    onClick={openAirdropFundingModal}
                    className="secondary-button mt-2 w-full py-2 text-caption"
                  >
                    Add funds
                  </button>
                </div>
              ) : null}

              <div className="mt-3 max-w-sm">
                <div className="flex items-center gap-2.5">
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
                      onChange={(e) => applyRewardSliderPct(Number(e.target.value))}
                      disabled={!canUseRewardSlider}
                      className="trade-amount-slider relative z-[1] w-full disabled:opacity-40"
                      aria-label="Pool size slider"
                      aria-valuetext={
                        rewardSliderPct >= 100
                          ? `Max (${maxRewardLabel} ${isBnbReward ? NATIVE_SYMBOL : selectedRewardSymbol})`
                          : `${rewardSliderPct}% of available ${isBnbReward ? NATIVE_SYMBOL : selectedRewardSymbol}`
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={!canUseRewardSlider}
                    onClick={() => applyRewardSliderPct(100)}
                    className="chip-button shrink-0 px-2.5 py-1 text-caption disabled:opacity-40"
                  >
                    Max
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 border-t border-pump-border/15 pt-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="qualifyStart">
                  Qualify starts
                </label>
                <input
                  id="qualifyStart"
                  type="datetime-local"
                  className="field-input"
                  value={qualifyStartLocal}
                  min={startMinLocal}
                  onChange={(e) => handleQualifyStartChange(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="qualifyEnd">
                  Qualify ends
                </label>
                <input
                  id="qualifyEnd"
                  type="datetime-local"
                  className="field-input"
                  value={qualifyEndLocal}
                  min={endMinLocal}
                  onChange={(e) => setQualifyEndLocal(e.target.value)}
                />
              </div>
            </div>

            {qualifyDurationLabel ? (
              <p className="field-hint">{qualifyDurationLabel}</p>
            ) : (
              <p className="text-caption text-pump-warning">
                End must be at least 15 minutes after start.
              </p>
            )}
          </div>
        </section>

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">3 · Who qualifies</p>
          <p className="mt-1 field-hint">Set at least one on-chain rule.</p>

          <AirdropQualifyRulesEditor
            linkedToken={selectedLinkedToken}
            minHoldTokens={minHoldTokens}
            minBuyBnb={minBuyBnb}
            onMinHoldChange={setMinHoldTokens}
            onMinBuyChange={setMinBuyBnb}
          />
        </section>

        <section className="panel-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setSocialOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-pump-surface/40 md:px-5"
            aria-expanded={socialOpen}
          >
            <div>
              <p className="section-label">Social tasks</p>
              <p className="mt-0.5 field-hint">Optional — skip if not needed.</p>
            </div>
            <span className="text-caption text-pump-muted">{socialOpen ? "−" : "+"}</span>
          </button>
          {socialOpen ? (
            <div className="border-t border-pump-border/15 px-4 pb-4 pt-2 md:px-5">
              <AirdropSocialTasksEditor
                tasks={socialTasks}
                onToggle={toggleSocialTask}
                onUrlChange={updateSocialTaskUrl}
                embedded
              />
            </div>
          ) : null}
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:min-w-[300px]">
        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Preview</p>
          <div className="mt-3 flex items-center gap-2.5">
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
              <p className="mt-0.5 inline-flex flex-wrap items-center gap-1.5 text-caption text-pump-muted">
                Pool
                {selectedLinkedToken ? (
                  <TokenAssetChip
                    address={selectedLinkedToken.address}
                    symbol={selectedLinkedToken.symbol}
                    logoUrl={selectedLinkedToken.logoUrl}
                    size={14}
                  />
                ) : (
                  <span>${displayPoolSymbol}</span>
                )}
              </p>
            </div>
          </div>
          {description.trim() ? (
            <p className="mt-2 text-caption leading-snug text-pump-muted line-clamp-3">
              {description.trim()}
            </p>
          ) : null}
          <div className="mt-4 rounded border border-pump-border/20 bg-pump-surface/40 p-2.5">
            <p className="section-label text-[10px]">Explore list row</p>
            <div className="mt-2 flex items-start gap-2.5">
              {selectedLinkedToken ? (
                <TokenAvatar
                  address={selectedLinkedToken.address}
                  symbol={selectedLinkedToken.symbol}
                  logoUrl={selectedLinkedToken.logoUrl}
                  size={32}
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-pump-border/30 bg-pump-surface/40 text-caption text-pump-muted">
                  ?
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-pump-text">
                  {displayPoolSymbol}
                </p>
                <p className="financial-value mt-0.5 truncate text-caption font-semibold tabular-nums text-pump-text">
                  <span className="font-normal text-pump-muted">Reward </span>
                  {boardRewardLabel}
                </p>
              </div>
            </div>
          </div>
          <dl className="mt-4 space-y-2 border-t border-pump-border/15 pt-4 text-caption">
            <div className="flex justify-between gap-2">
              <dt className="text-pump-muted">Reward</dt>
              <dd className="min-w-0 text-right">
                <RewardAmountDisplay
                  amount={rewardAmountValue}
                  isBnb={isBnbReward}
                  token={selectedRewardToken}
                  amountClassName="financial-value text-caption font-medium tabular-nums text-pump-text"
                  logoSize={14}
                />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-pump-muted">Qualify</dt>
              <dd className="financial-value text-right text-pump-text">
                {qualifyDurationLabel ?? "Set window"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="shrink-0 text-pump-muted">Rules</dt>
              <dd className="text-right">
                <AirdropQualifyRulesPreview
                  linkedToken={selectedLinkedToken}
                  minHoldTokens={minHoldTokens}
                  minBuyBnb={minBuyBnb}
                />
              </dd>
            </div>
          </dl>
          <AirdropSocialTasksPreview tasks={socialTasksForSync} />
        </section>

        <AirdropRewardSplitPreview
          totalReward={parsedRewardAmount}
          assetLabel={rewardAssetLabel}
          isBnb={isBnbReward}
          rewardToken={selectedRewardToken}
        />

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Summary</p>
          <dl className="mt-4 space-y-2.5 text-body-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-pump-muted">Reward pool</dt>
              <dd className="min-w-0 text-right">
                <RewardAmountDisplay
                  amount={rewardAmountValue}
                  isBnb={isBnbReward}
                  token={selectedRewardToken}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-pump-muted">Create fee</dt>
              <dd className="min-w-0 text-right">
                {feeWei === 0n ? (
                  <span className="text-caption font-medium text-pump-accent">Free (exempt)</span>
                ) : (
                  <BnbAmountDisplay amount={createFeeValue} />
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-pump-border/15 pt-2">
              <dt className="font-medium text-pump-text">Total {NATIVE_SYMBOL}</dt>
              <dd className="min-w-0 text-right">
                <BnbAmountDisplay
                  amount={totalBnbValue}
                  logoSize={20}
                  amountClassName="financial-value font-semibold tabular-nums text-pump-text"
                  symbolClassName="text-body-sm font-medium text-pump-muted"
                />
              </dd>
            </div>
          </dl>

          {displayError ? (
            <div className="notice-error mt-3 px-3 py-2 text-caption" role="alert">
              {displayError}
            </div>
          ) : null}

          {formValidation.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-md border border-pump-warning/30 bg-pump-warning/5 px-2.5 py-2">
              {formValidation.warnings.map((warning) => (
                <li key={warning} className="text-[11px] leading-snug text-pump-warning">
                  {warning}
                </li>
              ))}
              {canUseFundingCta ? (
                <li className="pt-1">
                  <button
                    type="button"
                    onClick={openAirdropFundingModal}
                    className="secondary-button w-full py-2 text-caption"
                  >
                    Add funds
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="form-action-zone mt-4 -mx-4 px-4 md:-mx-5 md:px-5">
            {formSubmitPending && formStatusDetail ? (
              <FormExecutionStatus phase={formSubmitPhase} detail={formStatusDetail} />
            ) : null}
            <button
              type="submit"
              disabled={submitDisabled}
              aria-busy={formSubmitPending}
              className={`primary-button flex w-full items-center justify-center gap-2${formSubmitPending ? " form-submit-button--loading" : ""}`}
            >
              {formSubmitPending ? (
                <>
                  <span className="trade-submit-spinner" aria-hidden />
                  <span>{submitLabel}</span>
                </>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </section>
      </aside>
    </form>
  );
}
