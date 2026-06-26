"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, formatEther, formatUnits, parseEther, parseSignature, parseUnits } from "viem";
import type { Address, TransactionReceipt } from "viem";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import type { SessionBuyParams, SessionSellParams } from "@/hooks/useSessionTrade";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { TradeConfirmModal } from "@/components/token/TradeConfirmModal";
import { assertScwReadyForUserOp } from "@/lib/aa/scw-preflight";
import { estimateKernelUserOpPrefundWei } from "@/lib/aa/estimate-kernel-user-op-prefund";
import { bufferedGasCostWei } from "@/lib/aa/gas-buffer";
import { userOpPrefundFromCallGasEstimate } from "@/lib/aa/user-op-prefund";
import {
  buildOptimisticBuyPreview,
  buildOptimisticSellPreview,
  type OptimisticTradePreview,
} from "@/lib/trade-optimistic-preview";
import {
  computeConservativeBuyGasReserve,
  computeMaxBuySpendWei,
  createOptimisticPendingId,
  evaluateInstantTradeGate,
  hardValidateInstantTrade,
  type InstantTradeGateBuy,
  type InstantTradeGateResult,
  type InstantTradeGateSell,
} from "@/lib/trade-optimistic-guard";
import { loadTradeAutoConfirm, saveTradeAutoConfirm } from "@/lib/trade-confirm-storage";
import { instantTradeGateMessage, isTransientInstantGateReason } from "@/lib/trade-instant-copy";
import {
  isTradeOrderSettled,
  resolvePendingIdFromTxHash,
  trackTradeOrderConfirmed,
  trackTradeOrderFailed,
  trackTradeOrderIncluded,
  trackTradeOrderPending,
  trackTradeOrderSubmitted,
} from "@/lib/trade-order-toast";
import {
  startPendingTradeConfirmationWatch,
  stopPendingTradeConfirmationWatch,
  trySettleFromTxReceipt,
} from "@/lib/trade-pending-confirm-watch";
import { toast } from "@/lib/toast";
import {
  addPendingReservation,
  availableNativeExcluding,
  availableTokenExcluding,
  createTradePendingLedger,
  effectiveNativeBalance,
  effectiveTokenBalance,
  pendingTradeCount,
  removePendingReservation,
} from "@/lib/trade-pending-ledger";
import {
  useAccount,
  useBalance,
  useGasPrice,
  useReadContract,
  useSignTypedData,
} from "wagmi";
import { useFlashblocksTransactionReceipt } from "@/hooks/useFlashblocksTransactionReceipt";
import {
  useKernelTradeWriteContract,
  type KernelTradeWriteCallbacks,
} from "@/hooks/useKernelTradeWriteContract";
import type { KernelTransactionResult } from "@/lib/aa/send-kernel-transaction";
import {
  createTradeHttpPublicClient,
  isTradeFlashblocksActive,
} from "@/config/flashblocks";
import {
  endTradeTrace,
  failTradeTrace,
  startTradeTrace,
  tradeTraceStep,
} from "@/lib/trade-timing";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { contracts, NATIVE_SYMBOL, pumpChain } from "@/config/chain";
import { erc20Abi, maxUint256 } from "@/lib/abis/erc20";
import { memeTokenAbi } from "@/lib/abis/meme-token";
import { buildPermitTypedData, canUseErc20Permit, PERMIT_ALLOWANCE_MAX, permitDeadline } from "@/lib/erc20-permit";
import {
  bondingCurveManagerAbi,
  bondingCurveFromSnapshot,
  bondingCurveStateFromTuple,
  minOutWithSlippage,
  quoteBuyFromCurveState,
  quoteSellFromCurveState,
  resolveBnbInForTokenOut,
  resolveTokenInForBnbOut,
  SLIPPAGE_BPS,
  type BondingCurveSnapshot,
} from "@/lib/bonding-curve";
import { formatTradeError } from "@/lib/trade-errors";
import {
  clearStoredReferrer,
  readStoredReferrer,
  resolveTradeReferrer,
} from "@/lib/referral-storage";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import { formatEstimatedPriceUsd, quoteFillPriceBnb, quoteFillDeviationBps, isPriceAccuracyViolation, logPriceAccuracyViolation } from "@/lib/price-semantics";
import { tradeFillPriceBnb } from "@/lib/format-usd";
import { parseTradesFromReceipt } from "@/lib/launchpad-events";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import {
  useTradeGasEstimate,
  BUY_GAS_FALLBACK,
  SELL_GAS_FALLBACK,
  APPROVE_GAS_FALLBACK,
} from "@/hooks/useTradeGasEstimate";
import type { TradePrefillConfig } from "@/lib/token-trade-prefill";

type Side = "buy" | "sell";
type TradeInputMode = "usd" | "bnb" | "token";

const CURVE_POLL_MS = 4_000;

export type TradeConfirmedPayload = {
  txHash: string;
  side: Side;
  receipt?: TransactionReceipt;
};

export type TradeSubmittedPayload = {
  userOpHash: string;
  side: "buy" | "sell";
};

export type TradeOptimisticPayload = OptimisticTradePreview & {
  side: "buy" | "sell";
};

type TradePanelProps = {
  tokenAddress: `0x${string}`;
  symbol: string;
  status: string;
  reserveBnb?: string;
  embedded?: boolean;
  prefill?: TradePrefillConfig | null;
  onTradeOptimistic?: (payload: TradeOptimisticPayload) => void;
  onTradeOptimisticRollback?: (payload: { pendingId: string }) => void;
  onTradeSubmitted?: (payload: TradeSubmittedPayload) => void;
  onTradeConfirmed?: (payload: TradeConfirmedPayload) => void;
  /** Live curve snapshot from token page — keeps quotes in sync with chart polling. */
  chainCurveSnapshot?: BondingCurveSnapshot;
};

function parseBnbAmount(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  try {
    return parseEther(trimmed);
  } catch {
    return 0n;
  }
}

function parseTokenAmount(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  try {
    return parseUnits(trimmed, 18);
  } catch {
    return 0n;
  }
}

function formatGasCostLabel(gasCostWei: bigint, bnbUsd: number | null): string {
  const bnb = Number(formatEther(gasCostWei));
  const bnbStr =
    bnb >= 0.001
      ? bnb.toFixed(4)
      : bnb >= 0.0001
        ? bnb.toFixed(5)
        : bnb.toFixed(6);
  const usdValue = bnbUsd ? bnbToUsd(bnb, bnbUsd) : null;
  const usdLabel =
    usdValue != null ? formatUsdReadable(usdValue, { fallback: "" }) : null;
  return usdLabel ? `≈ ${bnbStr} ${NATIVE_SYMBOL} (${usdLabel})` : `≈ ${bnbStr} ${NATIVE_SYMBOL}`;
}

const GAS_PROBE_BNB_WEI = parseEther("0.001");
const GAS_PROBE_TOKEN_WEI = parseUnits("0.000001", 18);
const PROBE_GAS_UNITS = 200_000n;

function capSpendToBalance(
  spendWei: bigint,
  balance: bigint | undefined,
  gasReserve: bigint
): bigint {
  if (spendWei <= 0n || balance === undefined) return spendWei;
  const maxSpend = balance > gasReserve ? balance - gasReserve : 0n;
  return spendWei > maxSpend ? maxSpend : spendWei;
}

function formatAmountFromWei(wei: bigint): string {
  const raw = formatEther(wei);
  if (!raw.includes(".")) return raw;
  return raw.replace(/0+$/, "").replace(/\.$/, "");
}

function formatTokenInputAmount(wei: bigint): string {
  return formatAmountFromWei(wei);
}

function formatBnbReadable(bnb: number): string {
  if (!Number.isFinite(bnb) || bnb <= 0) return "0";
  if (bnb >= 1) return bnb.toFixed(4);
  if (bnb >= 0.0001) return bnb.toFixed(4);
  if (bnb >= 0.00001) return bnb.toFixed(6);
  if (bnb >= 0.000001) return bnb.toFixed(8);
  return bnb.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

function formatReceiveAmount(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-4 w-4 fill-none stroke-current transition ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SwapArrowsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current">
      <path d="M8 7l4-4 4 4M16 17l-4 4-4-4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TradePanel({
  tokenAddress,
  symbol,
  status,
  embedded = false,
  prefill = null,
  onTradeOptimistic,
  onTradeOptimisticRollback,
  onTradeSubmitted,
  onTradeConfirmed,
  chainCurveSnapshot,
}: TradePanelProps) {
  const { address, isConnected, chain } = useAccount();
  const { data: gasPrice } = useGasPrice({ chainId: pumpChain.id });
  const { openConnectModal } = useOpenConnectModal();
  const { openFundChoice } = useWalletFunding();
  const [tradeConfirmOpen, setTradeConfirmOpen] = useState(false);
  const [tradeConfirmError, setTradeConfirmError] = useState<string | null>(null);
  const [pendingTrade, setPendingTrade] = useState<{
    side: Side;
    spendLabel: string;
    receiveLabel: string;
    buyParams?: SessionBuyParams;
    sellParams?: Omit<SessionSellParams, "permit">;
    usePermit?: boolean;
  } | null>(null);
  const { bnbUsd } = useBnbUsdPrice();
  const optimisticNativeUsdRate =
    bnbUsd != null && bnbUsd > 0 ? String(bnbUsd) : undefined;
  const [side, setSide] = useState<Side>("buy");
  const [buyInputMode, setBuyInputMode] = useState<TradeInputMode>("usd");
  const [sellInputMode, setSellInputMode] = useState<TradeInputMode>("usd");
  const [amount, setAmount] = useState("");
  const prefillAppliedRef = useRef(false);
  const sellMaxPendingRef = useRef(false);
  const sellPercentPendingRef = useRef(false);
  const sellPercentTargetRef = useRef(100);
  const buyMaxPendingRef = useRef(false);
  const autoSubmitPendingRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [receiveExpanded, setReceiveExpanded] = useState(false);
  const [pendingReservationTick, setPendingReservationTick] = useState(0);
  const pendingLedgerRef = useRef(createTradePendingLedger());
  const pendingTradesRef = useRef<Map<string, { side: "buy" | "sell" }>>(new Map());
  const bumpPendingLedger = () => setPendingReservationTick((n) => n + 1);
  const [pendingAction, setPendingAction] = useState<"buy" | "sell" | "approve" | null>(null);
  /** Sync side for callbacks — setState(pendingAction) may lag behind userOp submitted. */
  const pendingTradeSideRef = useRef<"buy" | "sell" | null>(null);
  /** Persists until trade confirm completes — fallback receipt hook uses this when kernel omits receipt. */
  const awaitingConfirmSideRef = useRef<"buy" | "sell" | null>(null);
  const awaitingConfirmPendingIdRef = useRef<string | null>(null);
  const legacyPendingIdRef = useRef<string | null>(null);
  const legacyApproveChainRef = useRef(false);
  const pendingSellRef = useRef<{ amountWei: bigint; minBnbOut: bigint } | null>(null);
  const handledReceiptHashRef = useRef<`0x${string}` | null>(null);
  const pendingTradeReferrerRef = useRef<`0x${string}` | null>(null);
  const quoteUsdAtSubmitRef = useRef<number | null>(null);
  /** Set when buy amount comes from slider/max — keeps token mode aligned with BNB/USD spend. */
  const [linkedBuySpendWei, setLinkedBuySpendWei] = useState<bigint | null>(null);
  /** Set when sell amount comes from slider/max — keeps USD/BNB modes aligned with token balance. */
  const [linkedSellTokenWei, setLinkedSellTokenWei] = useState<bigint | null>(null);

  useEffect(() => {
    if (!prefill || prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;
    setSide(prefill.side);
    if (prefill.side === "buy") {
      if (prefill.buyMode) {
        setBuyInputMode(prefill.buyMode);
      }
      if (prefill.buyMax) {
        buyMaxPendingRef.current = true;
      }
    }
    if (prefill.side === "sell") {
      setSellInputMode(prefill.buyMode ?? "token");
      if (prefill.sellMax) {
        sellMaxPendingRef.current = true;
      }
      if (prefill.sellPercent != null) {
        sellPercentPendingRef.current = true;
        sellPercentTargetRef.current = prefill.sellPercent;
      }
    }
    if (prefill.amount) {
      setAmount(prefill.amount);
    }
    if (prefill.autoSubmit) {
      autoSubmitPendingRef.current = true;
    }
  }, [prefill]);

  const buyTargetTokenWei = useMemo(() => {
    if (side !== "buy" || buyInputMode !== "token") return 0n;
    return parseTokenAmount(amount);
  }, [amount, side, buyInputMode]);

  const wrongChain = isConnected && chain?.id !== pumpChain.id;

  const { data: localCurveState } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "curves",
    args: [tokenAddress],
    chainId: pumpChain.id,
    query: {
      enabled: chainCurveSnapshot == null,
      refetchInterval: CURVE_POLL_MS,
    },
  });

  const bondingCurve = useMemo(() => {
    if (chainCurveSnapshot) return bondingCurveFromSnapshot(chainCurveSnapshot);
    if (localCurveState) return bondingCurveStateFromTuple(localCurveState);
    return null;
  }, [chainCurveSnapshot, localCurveState]);

  const { data: protocolFeeBps } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "protocolFeeBps",
    chainId: pumpChain.id,
  });

  const sellTokenWei = useMemo(() => {
    if (side !== "sell") return 0n;
    if (linkedSellTokenWei != null) return linkedSellTokenWei;
    if (sellInputMode === "token") return parseTokenAmount(amount);
    const targetBnbOut = parseBnbAmount(amount);
    if (targetBnbOut === 0n || !bondingCurve || protocolFeeBps === undefined) return 0n;
    return resolveTokenInForBnbOut(bondingCurve, protocolFeeBps, targetBnbOut) ?? 0n;
  }, [side, linkedSellTokenWei, sellInputMode, amount, bondingCurve, protocolFeeBps]);

  const targetTokenWei = side === "sell" ? sellTokenWei : buyTargetTokenWei;

  const resolvedBuyBnbWei = useMemo(() => {
    if (side !== "buy" || buyInputMode !== "token" || buyTargetTokenWei === 0n) return null;
    if (!bondingCurve || protocolFeeBps === undefined) return null;
    return resolveBnbInForTokenOut(bondingCurve, protocolFeeBps, buyTargetTokenWei);
  }, [side, buyInputMode, buyTargetTokenWei, bondingCurve, protocolFeeBps]);

  const buySpendWei = useMemo(() => {
    if (side !== "buy") return 0n;
    if (buyInputMode === "token") return resolvedBuyBnbWei ?? 0n;
    return parseBnbAmount(amount);
  }, [side, buyInputMode, amount, resolvedBuyBnbWei]);

  const buyCostWei = useMemo(() => {
    if (side !== "buy") return 0n;
    if (linkedBuySpendWei != null && linkedBuySpendWei > 0n) return linkedBuySpendWei;
    if (buyInputMode === "token") return resolvedBuyBnbWei ?? 0n;
    return buySpendWei;
  }, [side, buyInputMode, linkedBuySpendWei, resolvedBuyBnbWei, buySpendWei]);

  const effectiveBuyTokenWei = useMemo(() => {
    if (side !== "buy" || buyInputMode !== "token") return 0n;
    if (
      linkedBuySpendWei != null &&
      linkedBuySpendWei > 0n &&
      bondingCurve &&
      protocolFeeBps !== undefined
    ) {
      const { tokenOut } = quoteBuyFromCurveState(
        bondingCurve,
        protocolFeeBps,
        linkedBuySpendWei
      );
      if (tokenOut > 0n) return tokenOut;
    }
    return buyTargetTokenWei;
  }, [
    side,
    buyInputMode,
    linkedBuySpendWei,
    bondingCurve,
    protocolFeeBps,
    buyTargetTokenWei,
  ]);

  const { data: bnbBalance, refetch: refetchBnbBalance } = useBalance({
    address,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, contracts.bondingCurveManager] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  const { isError: permitUnsupported } = useReadContract({
    address: tokenAddress,
    abi: memeTokenAbi,
    functionName: "nonces",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  const supportsPermit = !permitUnsupported;

  const { data: tokenName } = useReadContract({
    address: tokenAddress,
    abi: memeTokenAbi,
    functionName: "name",
    chainId: pumpChain.id,
    query: { enabled: supportsPermit && Boolean(address) },
  });

  const { data: permitNonce } = useReadContract({
    address: tokenAddress,
    abi: memeTokenAbi,
    functionName: "nonces",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: supportsPermit && Boolean(address) },
  });

  const { signTypedDataAsync } = useSignTypedData();
  const { kernelClient } = usePumpWallet();
  const isScw = Boolean(kernelClient);

  const { data: boundReferrer } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "traderReferrer",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  const { data: hasTraded } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "hasTraded",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  const localBuyQuoteOut = useMemo(() => {
    if (
      side !== "buy" ||
      buyInputMode === "token" ||
      buySpendWei === 0n ||
      !bondingCurve ||
      protocolFeeBps === undefined
    ) {
      return null;
    }
    return quoteBuyFromCurveState(bondingCurve, protocolFeeBps, buySpendWei).tokenOut;
  }, [side, buyInputMode, buySpendWei, bondingCurve, protocolFeeBps]);

  const localSellQuoteOut = useMemo(() => {
    if (
      side !== "sell" ||
      targetTokenWei === 0n ||
      !bondingCurve ||
      protocolFeeBps === undefined
    ) {
      return null;
    }
    return quoteSellFromCurveState(bondingCurve, protocolFeeBps, targetTokenWei).ethOut;
  }, [side, targetTokenWei, bondingCurve, protocolFeeBps]);

  const buyQuoteOut = localBuyQuoteOut;
  const sellQuoteOut = localSellQuoteOut;

  const {
    tradeWrite,
    txHash,
    userOpHash,
    receipt: kernelReceipt,
    isSubmitting,
    isBackgroundConfirming,
    reset,
    error: writeError,
  } = useKernelTradeWriteContract();
  const fastTradeConfirm = isTradeFlashblocksActive();
  const { data: fallbackReceipt, isLoading: isFallbackReceiptLoading } =
    useFlashblocksTransactionReceipt({
      hash: txHash,
      query: { enabled: Boolean(txHash && !kernelReceipt && !isSubmitting) },
    });
  const activeReceipt = kernelReceipt ?? fallbackReceipt;
  const isConfirming = Boolean(txHash && !activeReceipt && isFallbackReceiptLoading);

  const uxTraceRef = useRef({
    pending: false,
    confirming: false,
    lastTxHash: undefined as string | undefined,
    lastSubmittedUserOp: undefined as string | undefined,
  });

  useEffect(() => {
    if (isSubmitting && !uxTraceRef.current.pending) {
      tradeTraceStep("ux.state.isSubmitting=true");
      uxTraceRef.current.pending = true;
    } else if (!isSubmitting && uxTraceRef.current.pending) {
      tradeTraceStep("ux.state.isSubmitting=false");
      uxTraceRef.current.pending = false;
    }
  }, [isSubmitting]);

  useEffect(() => {
    if (isConfirming && !uxTraceRef.current.confirming) {
      tradeTraceStep("ux.state.isConfirming=true");
      uxTraceRef.current.confirming = true;
    } else if (!isConfirming && uxTraceRef.current.confirming) {
      tradeTraceStep("ux.state.isConfirming=false");
      uxTraceRef.current.confirming = false;
    }
  }, [isConfirming]);

  useEffect(() => {
    if (txHash && txHash !== uxTraceRef.current.lastTxHash) {
      tradeTraceStep("ux.state.txHash", { txHash });
      uxTraceRef.current.lastTxHash = txHash;
    }
  }, [txHash]);

  useEffect(() => {
    if (fallbackReceipt && !kernelReceipt) {
      tradeTraceStep("ux.fallback_receipt", {
        blockNumber: fallbackReceipt.blockNumber.toString(),
      });
    }
  }, [fallbackReceipt, kernelReceipt]);

  useEffect(() => {
    if (!fallbackReceipt) return;
    const txHash = fallbackReceipt.transactionHash;
    const pendingId = resolvePendingIdFromTxHash(txHash);
    if (!pendingId || isTradeOrderSettled(pendingId)) return;
    const side = pendingTradesRef.current.get(pendingId)?.side ?? awaitingConfirmSideRef.current;
    if (!side) return;
    void trySettleFromTxReceipt(pendingId, txHash, fallbackReceipt, {
      onConfirmed: (result) => handleBuySellConfirmed(pendingId, side, result),
      onFailed: (err) => handleInstantTradeFailure(pendingId, err),
    });
  }, [fallbackReceipt]);

  useEffect(() => {
    if (!writeError) return;
    if (pendingTradeCount(pendingLedgerRef.current) > 0) return;
    legacyApproveChainRef.current = false;
    pendingTradeSideRef.current = null;
    setPendingAction(null);
    handledReceiptHashRef.current = null;
    toast.error("Order failed", formatTradeError(writeError));
    failTradeTrace("ux.write_error", writeError);
  }, [writeError]);

  const paused =
    chainCurveSnapshot?.paused ?? localCurveState?.[7] ?? status === "PAUSED";

  const estimatedOut =
    side === "sell"
      ? sellQuoteOut ?? 0n
      : buyInputMode === "token"
        ? effectiveBuyTokenWei
        : buyQuoteOut ?? 0n;

  const spendBnbNumber =
    side === "buy" ? Number(formatEther(buyCostWei)) : Number(formatEther(estimatedOut));
  const amountUsdValue =
    side === "buy" && spendBnbNumber > 0
      ? bnbToUsd(spendBnbNumber, bnbUsd)
      : side === "sell" && estimatedOut > 0n
        ? bnbToUsd(Number(formatEther(estimatedOut)), bnbUsd)
        : null;
  const amountUsdLabel =
    amountUsdValue != null ? formatUsdReadable(amountUsdValue) : null;

  const needsApproval =
    side === "sell" &&
    sellTokenWei > 0n &&
    allowance !== undefined &&
    allowance < sellTokenWei;

  const sellSupportsPermit = canUseErc20Permit(supportsPermit, isScw);
  const needsLegacyApproval = needsApproval && !sellSupportsPermit;

  const activeInputMode = side === "buy" ? buyInputMode : sellInputMode;

  const displayInputValue =
    activeInputMode === "usd" && bnbUsd != null
      ? amount && Number(amount) > 0
        ? (Number(amount) * bnbUsd).toFixed(2).replace(/\.?0+$/, "")
        : amount
      : amount;

  const hasTradeAmount =
    side === "buy"
      ? buyInputMode === "token"
        ? effectiveBuyTokenWei > 0n
        : buySpendWei > 0n
      : sellTokenWei > 0n;

  const gasProbeSellTokenWei = useMemo(() => {
    if (side !== "sell") return 0n;
    if (sellTokenWei > 0n) return sellTokenWei;
    if (tokenBalance != null && tokenBalance > 0n) {
      return tokenBalance < GAS_PROBE_TOKEN_WEI ? tokenBalance : GAS_PROBE_TOKEN_WEI;
    }
    return GAS_PROBE_TOKEN_WEI;
  }, [side, sellTokenWei, tokenBalance]);

  const gasProbeSellQuoteOut = useMemo(() => {
    if (side !== "sell" || !bondingCurve || protocolFeeBps === undefined) return undefined;
    if (sellQuoteOut != null && sellQuoteOut > 0n) return sellQuoteOut;
    const quoted = quoteSellFromCurveState(
      bondingCurve,
      protocolFeeBps,
      gasProbeSellTokenWei
    ).ethOut;
    return quoted > 0n ? quoted : undefined;
  }, [side, bondingCurve, protocolFeeBps, sellQuoteOut, gasProbeSellTokenWei]);

  const probeGasReserveWei = useMemo(() => {
    if (gasPrice != null && gasPrice > 0n) {
      return bufferedGasCostWei(PROBE_GAS_UNITS, gasPrice);
    }
    return 0n;
  }, [gasPrice]);

  const gasProbeBuySpendWei = useMemo(() => {
    if (side !== "buy") return 0n;
    if (buyCostWei > 0n) return buyCostWei;
    if (bnbBalance != null && probeGasReserveWei > 0n && bnbBalance.value > probeGasReserveWei) {
      return bnbBalance.value - probeGasReserveWei;
    }
    return GAS_PROBE_BNB_WEI;
  }, [side, buyCostWei, bnbBalance, probeGasReserveWei]);

  const gasProbeTokenOut = useMemo(() => {
    if (side !== "buy" || !bondingCurve || protocolFeeBps === undefined) return 1n;
    if (buyInputMode === "token" && effectiveBuyTokenWei > 0n) return effectiveBuyTokenWei;
    if (buyQuoteOut != null && buyQuoteOut > 0n) return buyQuoteOut;
    const quoted = quoteBuyFromCurveState(
      bondingCurve,
      protocolFeeBps,
      gasProbeBuySpendWei
    ).tokenOut;
    return quoted > 0n ? quoted : 1n;
  }, [
    side,
    bondingCurve,
    protocolFeeBps,
    buyInputMode,
    effectiveBuyTokenWei,
    buyQuoteOut,
    gasProbeBuySpendWei,
  ]);

  const { gasCostWei, isLoading: gasLoading } = useTradeGasEstimate({
    enabled: !paused && !wrongChain && Boolean(address),
    address,
    side,
    buyInputMode,
    tokenAddress,
    targetTokenWei:
      side === "buy" && buyInputMode === "token" && buyTargetTokenWei === 0n
        ? GAS_PROBE_TOKEN_WEI
        : side === "sell" && sellTokenWei === 0n
          ? gasProbeSellTokenWei
          : targetTokenWei,
    buySpendWei: side === "buy" ? gasProbeBuySpendWei : buySpendWei,
    resolvedBuyBnbWei:
      side === "buy" && buyInputMode === "token"
        ? linkedBuySpendWei ?? resolvedBuyBnbWei ?? gasProbeBuySpendWei
        : resolvedBuyBnbWei,
    buyQuoteOut: side === "buy" ? gasProbeTokenOut : buyQuoteOut ?? undefined,
    sellQuoteOut: side === "sell" ? gasProbeSellQuoteOut : sellQuoteOut ?? undefined,
    needsApproval: needsLegacyApproval,
  });

  const userOpPrefundWei = useMemo(() => {
    if (gasCostWei != null && gasCostWei > 0n) return gasCostWei;
    if (gasPrice != null && gasPrice > 0n) {
      const callGas =
        side === "buy"
          ? BUY_GAS_FALLBACK
          : SELL_GAS_FALLBACK + (needsLegacyApproval ? APPROVE_GAS_FALLBACK : 0n);
      return userOpPrefundFromCallGasEstimate(callGas, gasPrice);
    }
    return 0n;
  }, [gasCostWei, gasPrice, side, needsLegacyApproval]);

  const buyGasReserveWei = side === "buy" ? userOpPrefundWei : 0n;
  const sellGasReserveWei = side === "sell" ? userOpPrefundWei : 0n;
  const legacyApproveGasReserveWei = 0n;

  const maxBuySpendWei = useMemo(() => {
    if (!isConnected || bnbBalance === undefined) return 0n;
    const effective = effectiveNativeBalance(pendingLedgerRef.current, bnbBalance.value);
    return computeMaxBuySpendWei(effective, buyGasReserveWei, gasPrice);
  }, [isConnected, bnbBalance, buyGasReserveWei, gasPrice, pendingReservationTick]);

  const maxSellTokenWei = useMemo(() => {
    if (!isConnected || tokenBalance === undefined || tokenBalance === 0n) {
      return 0n;
    }
    return effectiveTokenBalance(pendingLedgerRef.current, tokenBalance);
  }, [isConnected, tokenBalance, pendingReservationTick]);

  const insufficientSellTokenBalance =
    side === "sell" &&
    isConnected &&
    tokenBalance !== undefined &&
    sellTokenWei > 0n &&
    sellTokenWei > maxSellTokenWei;

  const insufficientSellGas =
    side === "sell" &&
    isConnected &&
    sellTokenWei > 0n &&
    bnbBalance !== undefined &&
    bnbBalance.value < sellGasReserveWei;

  const insufficientSellBalance = insufficientSellTokenBalance || insufficientSellGas;

  const insufficientBuyBalance =
    side === "buy" &&
    isConnected &&
    bnbBalance !== undefined &&
    buyCostWei > 0n &&
    buyCostWei > maxBuySpendWei;

  const insufficientBalance =
    side === "buy" ? insufficientBuyBalance : insufficientSellBalance;

  const insufficientTokenOnly =
    side === "sell" && insufficientSellTokenBalance && !insufficientSellGas;

  const needsBnbFunding =
    isConnected &&
    !wrongChain &&
    (insufficientBuyBalance || (side === "sell" && insufficientSellGas && !insufficientSellTokenBalance));

  const showDepositCta = needsBnbFunding && isConnected && !wrongChain;

  const showInsufficientTokenBalance =
    side === "sell" &&
    isConnected &&
    !wrongChain &&
    sellTokenWei > 0n &&
    insufficientSellTokenBalance;

  const balancePending =
    side === "buy"
      ? isConnected && bnbBalance === undefined && buyCostWei > 0n
      : isConnected && tokenBalance === undefined && sellTokenWei > 0n;

  const sellUsesPermit = side === "sell" && needsApproval && sellSupportsPermit;
  const allowanceSufficient =
    side !== "sell" || !needsApproval
      ? true
      : allowance !== undefined && allowance >= sellTokenWei;

  const evaluateLiveInstantGate = (): InstantTradeGateResult => {
    const availableNative =
      bnbBalance !== undefined
        ? effectiveNativeBalance(pendingLedgerRef.current, bnbBalance.value)
        : undefined;
    const availableToken =
      tokenBalance !== undefined
        ? effectiveTokenBalance(pendingLedgerRef.current, tokenBalance)
        : undefined;
    const liveMaxBuy =
      availableNative !== undefined
        ? computeMaxBuySpendWei(availableNative, buyGasReserveWei, gasPrice)
        : 0n;

    return evaluateInstantTradeGate({
      side,
      paused,
      wrongChain,
      needsLegacyApproval,
      sellUsesPermit,
      allowanceSufficient,
      bondingCurve: bondingCurve ?? undefined,
      protocolFeeBps,
      buyCostWei,
      sellTokenWei,
      bnbBalance: bnbBalance?.value,
      tokenBalance,
      availableBnbBalance: availableNative,
      availableTokenBalance: availableToken,
      buyGasReserveWei,
      sellGasReserveWei,
      legacyApproveGasReserveWei,
      maxBuySpendWei: liveMaxBuy,
      maxFeePerGasWei: gasPrice,
    });
  };

  const instantTradeGate = useMemo((): InstantTradeGateResult => {
    return evaluateLiveInstantGate();
  }, [
    side,
    paused,
    wrongChain,
    needsLegacyApproval,
    sellUsesPermit,
    allowanceSufficient,
    bondingCurve,
    protocolFeeBps,
    buyCostWei,
    sellTokenWei,
    bnbBalance?.value,
    tokenBalance,
    buyGasReserveWei,
    sellGasReserveWei,
    legacyApproveGasReserveWei,
    gasPrice,
    pendingReservationTick,
  ]);

  const currencyLabel =
    activeInputMode === "usd"
      ? "USD"
      : activeInputMode === "bnb"
        ? NATIVE_SYMBOL
        : symbol;

  const conversionParts: string[] = [];
  if (side === "buy") {
    if (buyInputMode === "token") {
      if (buyCostWei > 0n) {
        conversionParts.push(
          `≈ ${formatBnbReadable(Number(formatEther(buyCostWei)))} ${NATIVE_SYMBOL}`
        );
      }
      if (amountUsdLabel) {
        conversionParts.push(`≈ ${amountUsdLabel}`);
      }
    } else {
      if (Number(amount) > 0) {
        if (buyInputMode === "usd") {
          conversionParts.push(`≈ ${formatBnbReadable(Number(amount))} ${NATIVE_SYMBOL}`);
        } else if (amountUsdLabel) {
          conversionParts.push(`≈ ${amountUsdLabel}`);
        }
      }
      if (estimatedOut > 0n) {
        conversionParts.push(
          `≈ ${formatReceiveAmount(formatUnits(estimatedOut, 18))} ${symbol}`
        );
      }
    }
  } else if (sellTokenWei > 0n) {
    if (sellInputMode === "token") {
      if (estimatedOut > 0n) {
        conversionParts.push(
          `≈ ${formatBnbReadable(Number(formatEther(estimatedOut)))} ${NATIVE_SYMBOL}`
        );
      }
      if (amountUsdLabel) {
        conversionParts.push(`≈ ${amountUsdLabel}`);
      }
    } else {
      if (Number(amount) > 0) {
        if (sellInputMode === "usd") {
          conversionParts.push(`≈ ${formatBnbReadable(Number(amount))} ${NATIVE_SYMBOL}`);
        } else if (amountUsdLabel) {
          conversionParts.push(`≈ ${amountUsdLabel}`);
        }
      }
      conversionParts.push(
        `≈ ${formatReceiveAmount(formatUnits(sellTokenWei, 18))} ${symbol}`
      );
    }
  }

  const receiveAmount =
    side === "buy"
      ? formatReceiveAmount(estimatedOut > 0n ? formatUnits(estimatedOut, 18) : "0")
      : estimatedOut > 0n
        ? formatBnbReadable(Number(formatEther(estimatedOut)))
        : "0";
  const receiveUnit = side === "buy" ? symbol : NATIVE_SYMBOL;

  const minReceivedWei = useMemo(() => {
    if (side === "buy") {
      if (buyInputMode === "token" && effectiveBuyTokenWei > 0n) {
        return minOutWithSlippage(effectiveBuyTokenWei);
      }
      if (estimatedOut > 0n) return minOutWithSlippage(estimatedOut);
    } else if (estimatedOut > 0n) {
      return minOutWithSlippage(estimatedOut);
    }
    return 0n;
  }, [side, buyInputMode, effectiveBuyTokenWei, estimatedOut]);

  const minReceivedLabel =
    side === "buy"
      ? `${formatReceiveAmount(formatUnits(minReceivedWei, 18))} ${symbol}`
      : `${formatBnbReadable(Number(formatEther(minReceivedWei)))} ${NATIVE_SYMBOL}`;

  const buySliderPct = useMemo(() => {
    if (side !== "buy" || maxBuySpendWei === 0n) return 0;
    const spendWei = buyCostWei;
    if (spendWei <= 0n) return 0;
    const scaled = Number((spendWei * 10000n) / maxBuySpendWei) / 100;
    return Math.max(0, Math.min(100, Math.round(scaled)));
  }, [side, maxBuySpendWei, buyCostWei]);

  const buySliderFillPct = buySliderPct;

  const sellSliderPct = useMemo(() => {
    if (side !== "sell" || maxSellTokenWei === 0n) return 0;
    if (sellTokenWei <= 0n) return 0;
    const scaled = Number((sellTokenWei * 10000n) / maxSellTokenWei) / 100;
    return Math.max(0, Math.min(100, Math.round(scaled)));
  }, [side, maxSellTokenWei, sellTokenWei]);

  const sellSliderFillPct = sellSliderPct;

  const gasCostLabel =
    gasLoading && gasCostWei == null
      ? "…"
      : userOpPrefundWei > 0n
        ? formatGasCostLabel(userOpPrefundWei, bnbUsd)
        : "—";

  const slippagePct = Number(SLIPPAGE_BPS) / 100;

  const estimatedQuotePriceUsd = useMemo(() => {
    if (side === "buy" && estimatedOut > 0n && buyCostWei > 0n) {
      const priceBnb = quoteFillPriceBnb(
        Number(formatEther(buyCostWei)),
        Number(formatUnits(estimatedOut, 18))
      );
      return priceBnb != null ? bnbToUsd(priceBnb, bnbUsd) : null;
    }
    if (side === "sell" && sellTokenWei > 0n && estimatedOut > 0n) {
      const priceBnb = quoteFillPriceBnb(
        Number(formatEther(estimatedOut)),
        Number(formatUnits(sellTokenWei, 18))
      );
      return priceBnb != null ? bnbToUsd(priceBnb, bnbUsd) : null;
    }
    return null;
  }, [side, estimatedOut, buyCostWei, sellTokenWei, bnbUsd]);

  const estimatedQuotePriceLabel = formatEstimatedPriceUsd(
    estimatedQuotePriceUsd,
    (value) => formatUsdReadable(value)
  );

  useEffect(() => {
    if (side !== "buy" || linkedBuySpendWei == null || maxBuySpendWei === 0n) return;
    if (linkedBuySpendWei <= maxBuySpendWei) return;
    if (!bondingCurve || protocolFeeBps === undefined) return;

    setLinkedBuySpendWei(maxBuySpendWei);
    if (buyInputMode === "token") {
      const { tokenOut } = quoteBuyFromCurveState(
        bondingCurve,
        protocolFeeBps,
        maxBuySpendWei
      );
      if (tokenOut > 0n) setAmount(formatTokenInputAmount(tokenOut));
    } else {
      setAmount(formatAmountFromWei(maxBuySpendWei));
    }
  }, [
    side,
    linkedBuySpendWei,
    maxBuySpendWei,
    buyInputMode,
    bondingCurve,
    protocolFeeBps,
  ]);

  useEffect(() => {
    if (side !== "buy" || buyInputMode !== "token" || linkedBuySpendWei == null) return;
    if (!bondingCurve || protocolFeeBps === undefined) return;
    const { tokenOut } = quoteBuyFromCurveState(
      bondingCurve,
      protocolFeeBps,
      linkedBuySpendWei
    );
    if (tokenOut === 0n) return;
    const synced = formatTokenInputAmount(tokenOut);
    if (amount !== synced) setAmount(synced);
  }, [side, buyInputMode, linkedBuySpendWei, bondingCurve, protocolFeeBps, amount]);

  useEffect(() => {
    if (!activeReceipt || !txHash || !legacyApproveChainRef.current) return;
    if (activeReceipt.transactionHash !== txHash) return;
    if (handledReceiptHashRef.current === txHash) return;

    if (activeReceipt.status !== "success") {
      handledReceiptHashRef.current = txHash;
      legacyApproveChainRef.current = false;
      failTradeTrace("chain.receipt_reverted", new Error("Transaction reverted on-chain"));
      if (legacyPendingIdRef.current) {
        rollbackInstantOptimistic(legacyPendingIdRef.current);
        legacyPendingIdRef.current = null;
      }
      toast.error(
        "Order failed",
        "Approval reverted on-chain. Check balance and token status."
      );
      setPendingAction(null);
      pendingSellRef.current = null;
      pendingTradeReferrerRef.current = null;
      endTradeInFlight();
      reset();
      return;
    }

    handledReceiptHashRef.current = txHash;
    const pendingSell = pendingSellRef.current;
    legacyApproveChainRef.current = false;

    void (async () => {
      await refetchAllowance();

      if (!pendingSell) {
        setPendingAction(null);
        pendingSellRef.current = null;
        endTradeInFlight();
        reset();
        return;
      }

      const pendingId = legacyPendingIdRef.current;
      if (!pendingId) {
        setPendingAction(null);
        pendingSellRef.current = null;
        reset();
        return;
      }

      const tradeReferrer = resolvePendingTradeReferrer();
      pendingTradeReferrerRef.current = tradeReferrer;
      quoteUsdAtSubmitRef.current = estimatedQuotePriceUsd;
      handledReceiptHashRef.current = null;
      reset();
      tradeTraceStep("ui.approve_complete.starting_sell");
      tradeWrite({
        address: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: tradeReferrer ? "sellWithReferrer" : "sell",
        args: tradeReferrer
          ? [tokenAddress, pendingSell.amountWei, pendingSell.minBnbOut, tradeReferrer]
          : [tokenAddress, pendingSell.amountWei, pendingSell.minBnbOut],
        chainId: pumpChain.id,
        preflight: scwPreflightForTrade(0n),
        callbacks: pumpTradeCallbacks(pendingId, "sell"),
      });
      legacyPendingIdRef.current = null;
    })();
  }, [
    activeReceipt,
    pendingAction,
    txHash,
    refetchAllowance,
    reset,
    tokenAddress,
    tradeWrite,
    estimatedQuotePriceUsd,
  ]);

  function onDisplayInputChange(raw: string) {
    setLinkedBuySpendWei(null);
    setLinkedSellTokenWei(null);
    const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    if (activeInputMode === "usd" && bnbUsd != null && bnbUsd > 0) {
      if (!cleaned) {
        setAmount("");
        return;
      }
      const usd = Number(cleaned);
      if (!Number.isFinite(usd)) return;
      setAmount(String(usd / bnbUsd));
      return;
    }
    setAmount(cleaned);
  }

  function applyBuySpendWei(spendWei: bigint) {
    if (spendWei <= 0n) {
      setAmount("");
      setLinkedBuySpendWei(null);
      setError(null);
      return;
    }

    if (buyInputMode === "token") {
      if (!bondingCurve || protocolFeeBps === undefined) return;
      const { tokenOut } = quoteBuyFromCurveState(bondingCurve, protocolFeeBps, spendWei);
      if (tokenOut === 0n) return;
      setAmount(formatTokenInputAmount(tokenOut));
      setLinkedBuySpendWei(spendWei);
      setError(null);
      return;
    }

    setAmount(formatAmountFromWei(spendWei));
    setLinkedBuySpendWei(spendWei);
    setError(null);
  }

  function applyBuySliderPercent(pct: number) {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (wrongChain || paused || maxBuySpendWei === 0n) {
      if (isConnected && maxBuySpendWei === 0n) {
        setError(`Not enough ${NATIVE_SYMBOL} left after gas.`);
      }
      return;
    }

    const clamped = Math.max(0, Math.min(100, pct));
    if (clamped === 0) {
      applyBuySpendWei(0n);
      return;
    }

    const spendWei =
      clamped >= 100
        ? maxBuySpendWei
        : (maxBuySpendWei * BigInt(clamped)) / 100n;
    applyBuySpendWei(spendWei);
  }

  function applySellTokenWei(tokenWei: bigint) {
    if (tokenWei <= 0n) {
      setAmount("");
      setLinkedSellTokenWei(null);
      setError(null);
      return;
    }

    if (!bondingCurve || protocolFeeBps === undefined) return;

    setLinkedSellTokenWei(tokenWei);

    if (sellInputMode === "token") {
      setAmount(formatTokenInputAmount(tokenWei));
      setError(null);
      return;
    }

    const { ethOut } = quoteSellFromCurveState(bondingCurve, protocolFeeBps, tokenWei);
    if (ethOut === 0n) return;
    setAmount(formatAmountFromWei(ethOut));
    setError(null);
  }

  function applySellSliderPercent(pct: number) {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (wrongChain || paused || maxSellTokenWei === 0n) {
      if (isConnected && maxSellTokenWei === 0n) {
        setError("No token balance to sell.");
      }
      return;
    }

    const clamped = Math.max(0, Math.min(100, pct));
    if (clamped === 0) {
      applySellTokenWei(0n);
      return;
    }

    const tokenWei =
      clamped >= 100
        ? maxSellTokenWei
        : (maxSellTokenWei * BigInt(clamped)) / 100n;
    applySellTokenWei(tokenWei);
  }

  function toggleInputMode() {
    setAmount("");
    setLinkedBuySpendWei(null);
    setLinkedSellTokenWei(null);
    setError(null);
    if (side === "buy") {
      setBuyInputMode((mode) => {
        if (mode === "usd") return "bnb";
        if (mode === "bnb") return "token";
        return "usd";
      });
      return;
    }
    setSellInputMode((mode) => {
      if (mode === "usd") return "bnb";
      if (mode === "bnb") return "token";
      return "usd";
    });
  }

  async function assertScwForTrade(scw: Address, callValueWei: bigint) {
    const client = fastTradeConfirm ? createTradeHttpPublicClient() : undefined;
    await assertScwReadyForUserOp(scw, callValueWei, client);
  }

  function scwPreflightForTrade(callValueWei: bigint): (() => Promise<void>) | undefined {
    if (!address) return undefined;
    return () => assertScwForTrade(address, callValueWei);
  }

  function beginTradeInFlight() {
    /* Rapid-trade mode: UI stays unlocked; ledger tracks in-flight reservations. */
  }

  function endTradeInFlight() {
    /* no-op */
  }

  function commitPendingReservation(
    pendingId: string,
    tradeSide: "buy" | "sell",
    nativeReservedWei: bigint,
    tokenReservedWei: bigint
  ) {
    addPendingReservation(pendingLedgerRef.current, {
      id: pendingId,
      side: tradeSide,
      nativeReservedWei,
      tokenReservedWei,
    });
    pendingTradesRef.current.set(pendingId, { side: tradeSide });
    bumpPendingLedger();
  }

  function releasePendingReservation(pendingId: string) {
    removePendingReservation(pendingLedgerRef.current, pendingId);
    pendingTradesRef.current.delete(pendingId);
    bumpPendingLedger();
  }

  function unlockTradeFormAfterSubmit(side: "buy" | "sell", submittedUserOpHash: string) {
    setAmount("");
    setLinkedBuySpendWei(null);
    setLinkedSellTokenWei(null);
    setError(null);
    pendingTradeSideRef.current = null;
    setPendingAction(null);
    tradeTraceStep("ux.on_trade_submitted", { userOpHash: submittedUserOpHash, side });
    onTradeSubmitted?.({ userOpHash: submittedUserOpHash, side });
  }

  function handleBuySellConfirmed(
    pendingId: string,
    side: "buy" | "sell",
    result: KernelTransactionResult
  ) {
    if (isTradeOrderSettled(pendingId)) return;

    const txHash = result.receipt?.transactionHash ?? result.hash;
    if (!txHash) return;

    stopPendingTradeConfirmationWatch(pendingId);

    const activeReceipt = result.receipt;

    if (activeReceipt && activeReceipt.status !== "success") {
      failTradeTrace("chain.receipt_reverted", new Error("Transaction reverted on-chain"));
      rollbackInstantOptimistic(pendingId);
      trackTradeOrderFailed(
        pendingId,
        "Transaction reverted on-chain. Check balance and token status."
      );
      if (pendingTradeCount(pendingLedgerRef.current) === 0) reset();
      awaitingConfirmSideRef.current = null;
      awaitingConfirmPendingIdRef.current = null;
      return;
    }

    releasePendingReservation(pendingId);
    if (pendingTradeReferrerRef.current) {
      clearStoredReferrer();
      pendingTradeReferrerRef.current = null;
    }

    const quoteUsd = quoteUsdAtSubmitRef.current;
    quoteUsdAtSubmitRef.current = null;

    if (activeReceipt && quoteUsd != null && quoteUsd > 0 && bnbUsd != null && bnbUsd > 0) {
      const parsed = parseTradesFromReceipt(activeReceipt, tokenAddress);
      const trade = parsed[0];
      if (trade) {
        const native = formatEther(trade.nativeAmount);
        const fee = formatEther(trade.feeBnb);
        const net = formatEther(trade.nativeAmount - trade.feeBnb);
        const tokens = formatUnits(trade.tokenAmount, 18);
        const fillBnb = tradeFillPriceBnb(native, tokens, fee, net);
        const fillUsd = fillBnb != null ? bnbToUsd(fillBnb, bnbUsd) : null;
        if (fillUsd != null) {
          const deviationBps = quoteFillDeviationBps(quoteUsd, fillUsd);
          if (deviationBps != null && isPriceAccuracyViolation(deviationBps)) {
            logPriceAccuracyViolation({
              tokenAddress,
              side,
              quoteUsd,
              fillUsd,
              deviationBps,
              txHash: activeReceipt.transactionHash,
            });
          }
        }
      }
    }

    trackTradeOrderConfirmed(pendingId, side, symbol);

    onTradeConfirmed?.({
      txHash,
      side,
      receipt: activeReceipt,
    });

    awaitingConfirmSideRef.current = null;
    awaitingConfirmPendingIdRef.current = null;
    void (async () => {
      const t0 = performance.now();
      tradeTraceStep("ux.refetch_balances.start");
      await Promise.all([refetchBnbBalance(), refetchBalance(), refetchAllowance()]);
      tradeTraceStep("ux.refetch_balances.done", {
        ms: Math.round(performance.now() - t0),
      });
      endTradeTrace("ui.trade_complete", {
        side,
        txHash,
        blockNumber: activeReceipt?.blockNumber.toString() ?? "unknown",
      });
      if (pendingTradeCount(pendingLedgerRef.current) === 0) reset();
    })();
  }

  function rollbackInstantOptimistic(pendingId: string) {
    if (!pendingTradesRef.current.has(pendingId)) return;
    tradeTraceStep("ux.optimistic.rollback", { pendingId });
    onTradeOptimisticRollback?.({ pendingId });
    releasePendingReservation(pendingId);
    legacyApproveChainRef.current = false;
  }

  function handleInstantTradeFailure(pendingId: string, err: unknown) {
    stopPendingTradeConfirmationWatch(pendingId);
    rollbackInstantOptimistic(pendingId);
    pendingTradeSideRef.current = null;
    setPendingAction(null);
    failTradeTrace("ux.instant_trade.failed", err);
    trackTradeOrderFailed(pendingId, formatTradeError(err));
  }

  function applyInstantOptimisticUi(
    preview: OptimisticTradePreview,
    tradeSide: "buy" | "sell"
  ) {
    tradeTraceStep("ux.optimistic.instant", {
      pendingId: preview.pendingId,
      side: tradeSide,
    });
    setError(null);
    onTradeOptimistic?.({ ...preview, side: tradeSide });
    onTradeSubmitted?.({
      userOpHash: preview.pendingTxHash,
      side: tradeSide,
    });
  }

  async function resolveBuyUserOpPrefundWei(buyParams: SessionBuyParams): Promise<bigint> {
    const buyData = encodeFunctionData({
      abi: bondingCurveManagerAbi,
      functionName: buyParams.referrer ? "buyWithReferrer" : "buy",
      args: buyParams.referrer
        ? [buyParams.tokenAddress, buyParams.minTokenOut, buyParams.referrer]
        : [buyParams.tokenAddress, buyParams.minTokenOut],
    });

    if (kernelClient?.account) {
      return estimateKernelUserOpPrefundWei(kernelClient, {
        to: contracts.bondingCurveManager,
        data: buyData,
        value: buyParams.value,
      });
    }

    return computeConservativeBuyGasReserve(buyGasReserveWei, gasPrice);
  }

  async function hardValidateBeforeSend(
    pendingId: string,
    tradeSide: "buy" | "sell",
    callValueWei: bigint,
    userOpPrefundWei: bigint,
    sellAmountWei?: bigint
  ) {
    if (!address || bnbBalance === undefined) {
      throw new Error("Wallet balance not ready.");
    }
    const bnbWei = availableNativeExcluding(
      pendingLedgerRef.current,
      bnbBalance.value,
      pendingId
    );
    const tokenWei =
      tradeSide === "sell" && tokenBalance !== undefined
        ? availableTokenExcluding(pendingLedgerRef.current, tokenBalance, pendingId)
        : tokenBalance;

    await hardValidateInstantTrade({
      scwAddress: address,
      side: tradeSide,
      callValueWei,
      bnbBalanceWei: bnbWei,
      tokenBalanceWei: tokenWei,
      sellTokenWei: sellAmountWei,
      userOpPrefundWei,
      publicClient: fastTradeConfirm ? createTradeHttpPublicClient() : undefined,
    });
  }

  function dispatchInstantBuy(buyParams: SessionBuyParams, gate: InstantTradeGateBuy) {
    if (!address || !bondingCurve) return;
    const pendingId = createOptimisticPendingId();
    const panelPrefund = computeConservativeBuyGasReserve(buyGasReserveWei, gasPrice);
    commitPendingReservation(
      pendingId,
      "buy",
      gate.submitValue + panelPrefund,
      0n
    );
    trackTradeOrderPending(pendingId, "buy", symbol);
    const preview = buildOptimisticBuyPreview({
      pendingId,
      tokenAddress,
      traderAddress: address,
      submitValueWei: gate.submitValue,
      tokenOutWei: gate.tokenOut,
      feeZug: gate.feeZug,
      curve: bondingCurve,
      nativeUsdRate: optimisticNativeUsdRate,
    });
    applyInstantOptimisticUi(preview, "buy");
    queueMicrotask(() => {
      void (async () => {
        try {
          const userOpPrefund = await resolveBuyUserOpPrefundWei(buyParams);
          await hardValidateBeforeSend(pendingId, "buy", buyParams.value, userOpPrefund);
          await submitBuyWriteContract(pendingId, buyParams);
        } catch (err) {
          handleInstantTradeFailure(pendingId, err);
        }
      })();
    });
  }

  function dispatchInstantSell(
    sellParams: SessionSellParams,
    gate: InstantTradeGateSell,
    usePermit: boolean
  ) {
    if (!address || !bondingCurve) return;
    const pendingId = createOptimisticPendingId();
    commitPendingReservation(
      pendingId,
      "sell",
      sellGasReserveWei,
      gate.sellTokenWei
    );
    trackTradeOrderPending(pendingId, "sell", symbol);
    const preview = buildOptimisticSellPreview({
      pendingId,
      tokenAddress,
      traderAddress: address,
      sellTokenWei: gate.sellTokenWei,
      zugOutWei: gate.zugOut,
      feeZug: gate.feeZug,
      curve: bondingCurve,
      nativeUsdRate: optimisticNativeUsdRate,
    });
    applyInstantOptimisticUi(preview, "sell");
    queueMicrotask(() => {
      void (async () => {
        try {
          await hardValidateBeforeSend(
            pendingId,
            "sell",
            0n,
            sellGasReserveWei,
            sellParams.amountWei
          );
          await submitSellWriteContract(pendingId, sellParams, usePermit);
        } catch (err) {
          handleInstantTradeFailure(pendingId, err);
        }
      })();
    });
  }

  function dispatchInstantLegacyApproveSell(
    sellParams: SessionSellParams,
    gate: InstantTradeGateSell
  ) {
    if (!address || !bondingCurve) return;
    const pendingId = createOptimisticPendingId();
    commitPendingReservation(
      pendingId,
      "sell",
      sellGasReserveWei,
      gate.sellTokenWei
    );
    trackTradeOrderPending(pendingId, "sell", symbol);
    pendingSellRef.current = {
      amountWei: sellParams.amountWei,
      minBnbOut: sellParams.minBnbOut,
    };
    const preview = buildOptimisticSellPreview({
      pendingId,
      tokenAddress,
      traderAddress: address,
      sellTokenWei: gate.sellTokenWei,
      zugOutWei: gate.zugOut,
      feeZug: gate.feeZug,
      curve: bondingCurve,
      nativeUsdRate: optimisticNativeUsdRate,
    });
    legacyPendingIdRef.current = pendingId;
    applyInstantOptimisticUi(preview, "sell");
    queueMicrotask(() => {
      void (async () => {
        try {
          await hardValidateBeforeSend(
            pendingId,
            "sell",
            0n,
            sellGasReserveWei,
            sellParams.amountWei
          );
          legacyApproveChainRef.current = true;
          tradeTraceStep("ux.legacy_approve.start");
          tradeWrite({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "approve",
            args: [contracts.bondingCurveManager, maxUint256],
            chainId: pumpChain.id,
          });
        } catch (err) {
          legacyApproveChainRef.current = false;
          pendingSellRef.current = null;
          setPendingAction(null);
          handleInstantTradeFailure(pendingId, err);
        }
      })();
    });
  }

  function notifyInstantGateFailure(gate: InstantTradeGateResult & { ok: false }): void {
    if (isTransientInstantGateReason(gate.reason)) {
      tradeTraceStep("ux.optimistic.skipped.silent", { reason: gate.reason });
      return;
    }
    tradeTraceStep("ux.optimistic.skipped", { reason: gate.reason });
    toast.error("Order not sent", instantTradeGateMessage(gate.reason));
  }

  function tryDispatchInstantTrade(
    buyParams?: SessionBuyParams,
    sellParams?: SessionSellParams,
    usePermit = false
  ): boolean {
    const gate = evaluateLiveInstantGate();
    if (!gate.ok) {
      notifyInstantGateFailure(gate);
      return false;
    }
    if (gate.side === "buy" && buyParams) {
      dispatchInstantBuy(buyParams, gate);
      return true;
    }
    if (gate.side === "sell" && sellParams) {
      if (needsLegacyApproval) {
        dispatchInstantLegacyApproveSell(sellParams, gate);
      } else {
        dispatchInstantSell(sellParams, gate, usePermit);
      }
      return true;
    }
    return false;
  }

  function pumpTradeCallbacks(
    pendingId: string,
    side: "buy" | "sell"
  ): KernelTradeWriteCallbacks {
    awaitingConfirmSideRef.current = side;
    awaitingConfirmPendingIdRef.current = pendingId;
    return {
      onSubmitted: ({ userOpHash: submittedHash }) => {
        trackTradeOrderSubmitted(pendingId, side, symbol, submittedHash);
        if (kernelClient) {
          startPendingTradeConfirmationWatch(kernelClient, pendingId, submittedHash, {
            onConfirmed: (result) => handleBuySellConfirmed(pendingId, side, result),
            onFailed: (err) => handleInstantTradeFailure(pendingId, err),
          });
        }
        tradeTraceStep("ux.on_trade_submitted.background", {
          userOpHash: submittedHash,
          side,
          pendingId,
        });
      },
      onIncluded: (txHash) => {
        trackTradeOrderIncluded(pendingId, txHash);
      },
      onConfirmed: (result) => {
        stopPendingTradeConfirmationWatch(pendingId);
        handleBuySellConfirmed(pendingId, side, result);
      },
      onFailed: (err) => {
        stopPendingTradeConfirmationWatch(pendingId);
        handleInstantTradeFailure(pendingId, err);
      },
    };
  }

  async function submitBuyWriteContract(pendingId: string, buyParams: SessionBuyParams) {
    tradeTraceStep("ux.submit_buy.start", {
      value: buyParams.value.toString(),
      minTokenOut: buyParams.minTokenOut.toString(),
      pendingId,
    });
    tradeWrite({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: buyParams.referrer ? "buyWithReferrer" : "buy",
      args: buyParams.referrer
        ? [buyParams.tokenAddress, buyParams.minTokenOut, buyParams.referrer]
        : [buyParams.tokenAddress, buyParams.minTokenOut],
      value: buyParams.value,
      chainId: pumpChain.id,
      preflight: scwPreflightForTrade(buyParams.value),
      callbacks: pumpTradeCallbacks(pendingId, "buy"),
    });
  }

  async function submitSellWriteContract(
    pendingId: string,
    sellParams: SessionSellParams,
    usePermit: boolean
  ) {
    const params = usePermit ? await buildSellParamsWithPermit(sellParams, true) : sellParams;
    if (params.permit) {
      const { deadline, v, r, s } = params.permit;
      tradeWrite({
        address: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: params.referrer ? "sellWithReferrerAndPermit" : "sellWithPermit",
        args: params.referrer
          ? [
              params.tokenAddress,
              params.amountWei,
              params.minBnbOut,
              deadline,
              v,
              r,
              s,
              params.referrer,
            ]
          : [params.tokenAddress, params.amountWei, params.minBnbOut, deadline, v, r, s],
        chainId: pumpChain.id,
        preflight: scwPreflightForTrade(0n),
        callbacks: pumpTradeCallbacks(pendingId, "sell"),
      });
      return;
    }
    tradeWrite({
      address: contracts.bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: params.referrer ? "sellWithReferrer" : "sell",
      args: params.referrer
        ? [params.tokenAddress, params.amountWei, params.minBnbOut, params.referrer]
        : [params.tokenAddress, params.amountWei, params.minBnbOut],
      chainId: pumpChain.id,
      preflight: scwPreflightForTrade(0n),
      callbacks: pumpTradeCallbacks(pendingId, "sell"),
    });
  }

  function resolvePendingTradeReferrer(): `0x${string}` | null {
    return resolveTradeReferrer({
      storedReferrer: readStoredReferrer(),
      boundReferrer,
      hasTraded,
      traderAddress: address,
    });
  }

  async function buildSellParamsWithPermit(
    base: Omit<SessionSellParams, "permit">,
    usePermit: boolean
  ): Promise<SessionSellParams> {
    if (!usePermit) return base;
    if (!address || !tokenName || permitNonce === undefined) {
      throw new Error("Could not prepare permit signature. Try again.");
    }

    const deadline = permitDeadline();
    const signature = await signTypedDataAsync(
      buildPermitTypedData({
        tokenName,
        tokenAddress,
        chainId: pumpChain.id,
        owner: address,
        spender: contracts.bondingCurveManager,
        value: PERMIT_ALLOWANCE_MAX,
        nonce: permitNonce,
        deadline,
      })
    );
    const parsed = parseSignature(signature);
    const permitV = parsed.yParity !== undefined ? parsed.yParity + 27 : Number(parsed.v ?? 27);

    return {
      ...base,
      permit: {
        deadline,
        v: permitV,
        r: parsed.r,
        s: parsed.s,
      },
    };
  }

  async function submitTrade() {
    tradeTraceStep("ux.submit_trade.start", { side });

    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }
    if (showDepositCta) {
      openFundChoice({
        title: `Add ${NATIVE_SYMBOL} to trade`,
        message:
          side === "buy"
            ? `You need more ${NATIVE_SYMBOL} on Base to complete this buy, including network fees.`
            : `You need a small ${NATIVE_SYMBOL} balance to pay network fees for this sell.`,
      });
      return;
    }
    if (wrongChain) {
      toast.error("Wrong network", "Switch to Base Sepolia to trade.");
      return;
    }
    if (paused) {
      toast.error("Trading paused", "This bonding curve is not accepting trades.");
      return;
    }
    if (side === "buy" && buyCostWei === 0n) {
      toast.error("Enter amount", instantTradeGateMessage("zero_amount"));
      return;
    }
    if (side === "sell" && sellTokenWei === 0n) {
      toast.error("Enter amount", instantTradeGateMessage("zero_amount"));
      return;
    }

    try {
      if (side === "buy") {
        if (!bondingCurve || protocolFeeBps === undefined) {
          toast.error("Quote unavailable", instantTradeGateMessage("curve_unavailable"));
          return;
        }

        const gate = evaluateLiveInstantGate();
        if (!gate.ok || gate.side !== "buy") {
          if (!gate.ok) {
            notifyInstantGateFailure(gate);
          } else {
            toast.error("Order not sent", instantTradeGateMessage("quote_zero"));
          }
          return;
        }

        const tradeReferrer = resolvePendingTradeReferrer();
        pendingTradeReferrerRef.current = tradeReferrer;
        quoteUsdAtSubmitRef.current = estimatedQuotePriceUsd;

        const buyParams: SessionBuyParams = {
          tokenAddress,
          minTokenOut: minOutWithSlippage(gate.tokenOut),
          value: gate.submitValue,
          referrer: tradeReferrer ?? undefined,
        };

        tryDispatchInstantTrade(buyParams);
        return;
      }

      if (!sellQuoteOut) {
        toast.error("Quote unavailable", "Could not quote sell. Try a smaller amount.");
        return;
      }

      const tradeReferrer = resolvePendingTradeReferrer();
      const minBnbOut = minOutWithSlippage(sellQuoteOut);
      const baseSellParams: Omit<SessionSellParams, "permit"> = {
        tokenAddress,
        amountWei: sellTokenWei,
        minBnbOut,
        referrer: tradeReferrer ?? undefined,
      };
      const usePermit = needsApproval && sellSupportsPermit;

      pendingTradeReferrerRef.current = tradeReferrer;
      quoteUsdAtSubmitRef.current = estimatedQuotePriceUsd;
      tryDispatchInstantTrade(undefined, baseSellParams, usePermit);
    } catch (err) {
      pendingSellRef.current = null;
      failTradeTrace("ux.submit_trade.failed", err);
      toast.error("Order failed", formatTradeError(err));
    }
  }

  useEffect(() => {
    if (!sellMaxPendingRef.current || side !== "sell") return;
    if (maxSellTokenWei === 0n) return;
    if (!bondingCurve || protocolFeeBps === undefined) return;
    sellMaxPendingRef.current = false;
    applySellTokenWei(maxSellTokenWei);
  }, [side, maxSellTokenWei, bondingCurve, protocolFeeBps]);

  useEffect(() => {
    if (!sellPercentPendingRef.current || side !== "sell") return;
    if (maxSellTokenWei === 0n) return;
    if (!bondingCurve || protocolFeeBps === undefined) return;
    sellPercentPendingRef.current = false;
    applySellSliderPercent(sellPercentTargetRef.current);
  }, [side, maxSellTokenWei, bondingCurve, protocolFeeBps]);

  useEffect(() => {
    if (!buyMaxPendingRef.current || side !== "buy") return;
    if (maxBuySpendWei === 0n) return;
    if (!bondingCurve || protocolFeeBps === undefined) return;
    buyMaxPendingRef.current = false;
    applyBuySliderPercent(100);
  }, [side, maxBuySpendWei, bondingCurve, protocolFeeBps]);

  useEffect(() => {
    if (side !== "sell" || tokenBalance === undefined || sellTokenWei <= 0n) return;
    if (sellTokenWei <= tokenBalance) return;
    if (pendingAction !== null) return;
    applySellTokenWei(tokenBalance);
    toast.info("Amount adjusted", "Set to your current token balance.");
  }, [side, tokenBalance, sellTokenWei, pendingAction]);

  async function confirmPendingTrade(rememberAutoConfirm: boolean) {
    if (!pendingTrade) return;
    setTradeConfirmError(null);
    saveTradeAutoConfirm(rememberAutoConfirm);
    tradeTraceStep("ux.confirm_modal.accepted", { side: pendingTrade.side });
    try {
      if (pendingTrade.side === "buy" && pendingTrade.buyParams) {
        quoteUsdAtSubmitRef.current = estimatedQuotePriceUsd;
        tryDispatchInstantTrade(pendingTrade.buyParams);
      } else if (pendingTrade.side === "sell" && pendingTrade.sellParams) {
        pendingTradeReferrerRef.current = pendingTrade.sellParams.referrer ?? null;
        quoteUsdAtSubmitRef.current = estimatedQuotePriceUsd;
        tryDispatchInstantTrade(
          undefined,
          pendingTrade.sellParams,
          pendingTrade.usePermit ?? false
        );
      }
      setTradeConfirmOpen(false);
      setPendingTrade(null);
    } catch (err) {
      setTradeConfirmError(formatTradeError(err));
      failTradeTrace("ux.confirm_modal.failed", err);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const traceSide = side === "buy" ? "buy" : "sell";
    startTradeTrace(traceSide, {
      tokenAddress,
      side,
      buyCostWei: side === "buy" ? buyCostWei.toString() : undefined,
      sellTokenWei: side === "sell" ? sellTokenWei.toString() : undefined,
      flashblocks: fastTradeConfirm,
    });
    void submitTrade();
  }

  useEffect(() => {
    if (!autoSubmitPendingRef.current || autoSubmitTriggeredRef.current) return;
    if (balancePending) return;
    if (side === "sell") {
      if (sellTokenWei === 0n || !sellQuoteOut) return;
    } else if (side === "buy") {
      if (buyCostWei === 0n) return;
    } else {
      return;
    }
    autoSubmitPendingRef.current = false;
    autoSubmitTriggeredRef.current = true;
    void submitTrade();
  }, [side, sellTokenWei, sellQuoteOut, buyCostWei, balancePending]);

  const hasSubmitAmount = side === "buy" ? buyCostWei > 0n : sellTokenWei > 0n;

  const buyGateBlocked =
    side === "buy" &&
    isConnected &&
    !wrongChain &&
    hasSubmitAmount &&
    !instantTradeGate.ok &&
    !isTransientInstantGateReason(instantTradeGate.reason);

  const submitActionLabel = (() => {
    if (!isConnected) return "Sign in to trade";
    if (wrongChain) return "Switch to Base Sepolia";
    if (paused) return "Trading paused";
    if (!hasSubmitAmount) return "Enter amount";
    if (showInsufficientTokenBalance) return "Insufficient balance";
    if (showDepositCta) return `Deposit ${NATIVE_SYMBOL}`;
    if (buyGateBlocked) return `Not enough ${NATIVE_SYMBOL}`;
    return side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`;
  })();

  const submitButtonClass =
    showDepositCta || side === "buy"
      ? "trade-submit-button--buy"
      : "trade-submit-button--sell";

  const submitDisabled = (() => {
    if (!isConnected) return false;
    if (wrongChain || paused) return true;
    if (!hasSubmitAmount) return true;
    if (showInsufficientTokenBalance || buyGateBlocked) return true;
    return false;
  })();

  const canUseMaxBuy =
    side === "buy" &&
    !paused &&
    (!isConnected || (!wrongChain && maxBuySpendWei > 0n));

  const canUseMaxSell =
    side === "sell" &&
    !paused &&
    (!isConnected || (!wrongChain && maxSellTokenWei > 0n));

  const sliderPct = side === "buy" ? buySliderPct : sellSliderPct;
  const sliderFillPct = side === "buy" ? buySliderFillPct : sellSliderFillPct;
  const canUseSlider = side === "buy" ? canUseMaxBuy : canUseMaxSell;
  const applySliderPercent = side === "buy" ? applyBuySliderPercent : applySellSliderPercent;

  return (
    <section
      className={embedded ? "trade-panel-embedded overflow-hidden p-0" : "panel-surface overflow-hidden p-0"}
    >
      <form onSubmit={onSubmit}>
        <div className="trade-side-group">
          <button
            type="button"
            onClick={() => {
              setSide("buy");
              setAmount("");
              setLinkedBuySpendWei(null);
              setLinkedSellTokenWei(null);
              setError(null);
            }}
            className={side === "buy" ? "trade-side-button-active-buy" : "trade-side-button"}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => {
              setSide("sell");
              setAmount("");
              setLinkedBuySpendWei(null);
              setLinkedSellTokenWei(null);
              setError(null);
            }}
            className={side === "sell" ? "trade-side-button-active-sell" : "trade-side-button"}
          >
            Sell
          </button>
        </div>

        {paused ? (
          <p className="notice-warning mx-4 mt-2 text-caption">Trading is paused on this curve.</p>
        ) : null}
        <div className="px-4 pt-4 pb-0">
          <div className="flex justify-center">
            <div className="inline-flex max-w-full items-baseline flex-nowrap gap-2">
              <div
                className={
                  activeInputMode === "usd" ? "relative shrink-0 pl-3.5 md:pl-4" : "shrink-0"
                }
              >
                {activeInputMode === "usd" ? (
                  <span
                    className="financial-value absolute bottom-[0.22em] left-0 text-body-sm font-medium leading-none text-pump-muted md:text-body"
                    aria-hidden
                  >
                    $
                  </span>
                ) : null}
                <input
                  id="trade-amount"
                  name="trade-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={displayInputValue}
                  onChange={(e) => onDisplayInputChange(e.target.value)}
                  placeholder="0"
                  style={{
                    width: `${Math.min(Math.max(displayInputValue.length || 1, 1), 10)}ch`,
                  }}
                  className="financial-value min-w-[1ch] max-w-[10ch] bg-transparent p-0 text-[2.5rem] font-semibold leading-none text-pump-text outline-none placeholder:text-pump-muted/45 md:text-[2.75rem]"
                  aria-label={
                    side === "buy"
                      ? "Trade amount"
                      : sellInputMode === "token"
                        ? `Amount in ${symbol}`
                        : "Expected receive amount"
                  }
                />
              </div>
              <button
                type="button"
                onClick={toggleInputMode}
                className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-caption leading-none text-pump-muted transition hover:text-pump-text"
                aria-label="Toggle input currency"
              >
                {currencyLabel}
                <SwapArrowsIcon />
              </button>
            </div>
          </div>

          {conversionParts.length > 0 ? (
            <p className="mt-2 text-center text-caption text-pump-muted">
              {conversionParts.join(" · ")}
            </p>
          ) : null}

          <div className="mt-3 flex items-center gap-2.5 pb-3">
            <div className="relative min-w-0 flex-1 pt-1">
              <div
                className="pointer-events-none absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-pump-border/25"
                aria-hidden
              />
              <div
                className={`pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-[width] duration-75 ${
                  side === "buy" ? "bg-pump-success/70" : "bg-pump-danger/70"
                }`}
                style={{ width: `${sliderFillPct}%` }}
                aria-hidden
              />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={sliderPct}
                onChange={(e) => applySliderPercent(Number(e.target.value))}
                disabled={!canUseSlider}
                className={`trade-amount-slider relative z-[1] w-full disabled:opacity-40 ${
                  side === "sell" ? "trade-amount-slider-danger" : ""
                }`}
                aria-label={side === "buy" ? "Buy amount slider" : "Sell amount slider"}
                aria-valuetext={
                  sliderPct >= 100
                    ? "Max"
                    : `${sliderPct}% of ${side === "buy" ? "wallet balance" : "token balance"}`
                }
              />
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySliderPercent(100)}
              disabled={!canUseSlider}
              className={`shrink-0 text-caption font-semibold text-pump-muted transition disabled:opacity-40 ${
                side === "buy" ? "hover:text-pump-success" : "hover:text-pump-danger"
              }`}
            >
              Max
            </button>
          </div>
        </div>

        {hasTradeAmount ? (
          <div className="px-4 pb-4 pt-1">
            <button
              type="button"
              onClick={() => setReceiveExpanded((v) => !v)}
              className="flex w-full items-center justify-between py-2 text-left text-caption text-pump-muted transition hover:text-pump-text"
              aria-expanded={receiveExpanded}
            >
              <span>You receive ≈ {receiveAmount} {receiveUnit}</span>
              <ChevronDownIcon open={receiveExpanded} />
            </button>
            {receiveExpanded ? (
              <div className="space-y-2 pt-1 text-caption">
                {estimatedQuotePriceLabel ? (
                  <div className="flex items-center justify-between gap-3 text-pump-muted">
                    <span>Est. price</span>
                    <span className="financial-value text-pump-text">
                      {estimatedQuotePriceLabel}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 text-pump-muted">
                  <span>Min received</span>
                  <span className="financial-value text-pump-text">{minReceivedLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-pump-muted">
                  <span>Max slippage</span>
                  <span className="financial-value text-pump-text">{slippagePct}%</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-pump-muted">
                  <span>Est. gas</span>
                  <span className="financial-value text-pump-text">
                    {gasCostLabel}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="notice-error mx-4 mb-3 px-3 py-2 text-caption" role="alert">
            {error}
          </div>
        ) : null}

        <div className="trade-action-zone">
          <button
            type="submit"
            disabled={submitDisabled}
            className={`trade-submit-button ${submitButtonClass}`}
          >
            {submitActionLabel}
          </button>
        </div>
      </form>

      <TradeConfirmModal
        open={tradeConfirmOpen}
        side={pendingTrade?.side ?? side}
        symbol={symbol}
        spendLabel={pendingTrade?.spendLabel ?? ""}
        receiveLabel={pendingTrade?.receiveLabel ?? ""}
        loading={false}
        error={tradeConfirmError}
        onClose={() => {
          setTradeConfirmOpen(false);
          setTradeConfirmError(null);
          setPendingTrade(null);
        }}
        onConfirm={(remember) => void confirmPendingTrade(remember)}
      />
    </section>
  );
}
