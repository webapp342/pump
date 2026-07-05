"use client";

import { PumpIcon, faCheck, faChevronDown } from "@/lib/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, formatEther, formatUnits, parseEther, parseSignature, parseUnits } from "viem";
import type { Address, TransactionReceipt } from "viem";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import type { SessionBuyParams, SessionSellParams } from "@/hooks/useSessionTrade";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { PumpAmountNumpad } from "@/components/token/PumpAmountNumpad";
import { PumpAmountPresets } from "@/components/token/PumpAmountPresets";
import { TradeQuickOrderHeader } from "@/components/token/TradeQuickOrderHeader";
import { TradeConfirmModal, type TradeConfirmAssetLine } from "@/components/token/TradeConfirmModal";
import { ModalPortal } from "@/components/ui/ModalPortal";
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
import { persistTokenMobileTradeFromPanel } from "@/lib/token-mobile-trade-prefs";
import { instantTradeGateMessage, isQuickSubmitFundingBlock, isTransientInstantGateReason } from "@/lib/trade-instant-copy";
import { invalidateScwBalance } from "@/lib/scw-balance-sync";
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
import { NativeLogo } from "@/components/token/NativeLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
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
import {
  isEmptyCurveSnapshot,
  isUninitializedCurveTuple,
  machineFromTokenReserves,
} from "@/lib/bonding-curve-state";
import { quoteFillPriceBnb, quoteFillDeviationBps, isPriceAccuracyViolation, logPriceAccuracyViolation } from "@/lib/price-semantics";
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
type TradeMode = "market" | "limit";
type TradeInputMode = "usd" | "token";

function normalizeTradeInputMode(mode?: string): TradeInputMode {
  return mode === "token" ? "token" : "usd";
}

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
  tokenSold?: string;
  embedded?: boolean;
  /** Mobile inline trade box — tighter spacing below chart. */
  compact?: boolean;
  prefill?: TradePrefillConfig | null;
  onTradeOptimistic?: (payload: TradeOptimisticPayload) => void;
  onTradeOptimisticRollback?: (payload: { pendingId: string }) => void;
  onTradeSubmitted?: (payload: TradeSubmittedPayload) => void;
  onTradeConfirmed?: (payload: TradeConfirmedPayload) => void;
  /** Live curve snapshot from token page — keeps quotes in sync with chart polling. */
  chainCurveSnapshot?: BondingCurveSnapshot;
  /** Mobile trade sheet — 24h price change for Quick Order header. */
  changePct?: number | null;
  /** Mobile trade sheet — live spot for Quick Order header. */
  priceUsd?: number | null;
  /** Mobile trade sheet — close handler for Quick Order header. */
  sheetOnClose?: () => void;
  /** Token logo for mobile Quick Order header. */
  logoUrl?: string | null;
  /** Opens explore-coins sheet from Quick Order header. */
  onOpenMarket?: () => void;
  /** Persist buy USD / sell % to token mobile dock prefs when sheet unmounts. */
  persistTokenMobileTradePrefs?: boolean;
  /** Mobile dock auto-submit failed — open trade sheet instead of toast/connect flows. */
  onQuickSubmitBlocked?: () => void;
  /** Portfolio max trade — show confirm modal only (no trade form). */
  confirmOnly?: boolean;
  onConfirmOnlyClose?: () => void;
  /** Portfolio sell max — prefer verified on-chain balance over ERC20 read lag. */
  overrideTokenBalanceWei?: bigint;
  /** Portfolio confirm-only — insufficient balance/gas; open full trade sheet. */
  onConfirmOnlyFundingBlocked?: () => void;
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

function usdStringToSpendWei(usdStr: string, nativeUsd: number): bigint {
  const trimmed = usdStr.trim();
  if (!trimmed) return 0n;
  const usd = Number(trimmed);
  if (!Number.isFinite(usd) || usd <= 0) return 0n;
  try {
    return parseEther((usd / nativeUsd).toFixed(12));
  } catch {
    return 0n;
  }
}

function formatUsdInputAmount(wei: bigint, nativeUsd: number): string {
  const native = Number(formatEther(wei));
  if (!Number.isFinite(native) || native <= 0 || nativeUsd <= 0) return "";
  const usd = native * nativeUsd;
  const fixed = usd >= 1 ? usd.toFixed(2) : usd.toFixed(4);
  return fixed.replace(/\.?0+$/, "");
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

function formatSellAvailTokenBalance(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0.00";
  if (n > 99_999) {
    if (n >= 1_000_000_000) {
      const scaled = n / 1_000_000_000;
      return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(2).replace(/\.?0+$/, "")}B`;
    }
    if (n >= 1_000_000) {
      const scaled = n / 1_000_000;
      return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(2).replace(/\.?0+$/, "")}M`;
    }
    const scaled = n / 1_000;
    return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTokenCompact(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000_000) {
    const scaled = n / 1_000_000_000;
    return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(2).replace(/\.?0+$/, "")}B`;
  }
  if (n >= 1_000_000) {
    const scaled = n / 1_000_000;
    return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (n >= 10_000) {
    const scaled = n / 1_000;
    return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "")}K`;
  }
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

const TRADE_TEETH_COUNT = 100;

export function TradePanel({
  tokenAddress,
  symbol,
  status,
  reserveBnb,
  tokenSold = "0",
  embedded = false,
  compact = false,
  prefill = null,
  onTradeOptimistic,
  onTradeOptimisticRollback,
  onTradeSubmitted,
  onTradeConfirmed,
  chainCurveSnapshot,
  changePct = null,
  priceUsd = null,
  sheetOnClose,
  logoUrl = null,
  onOpenMarket,
  persistTokenMobileTradePrefs = false,
  onQuickSubmitBlocked,
  confirmOnly = false,
  onConfirmOnlyClose,
  overrideTokenBalanceWei,
  onConfirmOnlyFundingBlocked,
}: TradePanelProps) {
  const { address, isConnected, chain } = useAccount();
  const { data: gasPrice } = useGasPrice({ chainId: pumpChain.id });
  const { openConnectModal } = useOpenConnectModal();
  const { openDeposit } = useWalletFunding();
  const [tradeConfirmOpen, setTradeConfirmOpen] = useState(false);
  const [tradeConfirmError, setTradeConfirmError] = useState<string | null>(null);
  const [tradeConfirmLoading, setTradeConfirmLoading] = useState(false);
  const [confirmOnlyPreparing, setConfirmOnlyPreparing] = useState(confirmOnly);
  const confirmOnlyOpenedRef = useRef(false);
  const [pendingTrade, setPendingTrade] = useState<{
    side: Side;
    spend: TradeConfirmAssetLine;
    receive: TradeConfirmAssetLine;
    buyParams?: SessionBuyParams;
    sellParams?: Omit<SessionSellParams, "permit">;
    usePermit?: boolean;
  } | null>(null);
  const { bnbUsd } = useBnbUsdPrice();
  const optimisticNativeUsdRate =
    bnbUsd != null && bnbUsd > 0 ? String(bnbUsd) : undefined;
  const [side, setSide] = useState<Side>("buy");
  const [tradeMode, setTradeMode] = useState<TradeMode>("market");
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
  const quickSubmitFallbackUsedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [amountInputHint, setAmountInputHint] = useState<string | null>(null);
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [numpadPreset, setNumpadPreset] = useState<number | "max" | null>(null);
  const assetMenuRef = useRef<HTMLDivElement>(null);
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
        setBuyInputMode(normalizeTradeInputMode(prefill.buyMode));
      }
      if (prefill.buyMax) {
        buyMaxPendingRef.current = true;
      }
    }
    if (prefill.side === "sell") {
      setSellInputMode(normalizeTradeInputMode(prefill.buyMode ?? "token"));
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
      quickSubmitFallbackUsedRef.current = false;
    }
  }, [prefill]);

  function openQuickSubmitSheetInstead(): boolean {
    if (
      !onQuickSubmitBlocked ||
      !prefill?.autoSubmit ||
      quickSubmitFallbackUsedRef.current
    ) {
      return false;
    }
    quickSubmitFallbackUsedRef.current = true;
    autoSubmitPendingRef.current = false;
    autoSubmitTriggeredRef.current = true;
    onQuickSubmitBlocked();
    return true;
  }

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
      enabled:
        !chainCurveSnapshot ||
        isEmptyCurveSnapshot(chainCurveSnapshot),
      refetchInterval: CURVE_POLL_MS,
    },
  });

  const paused =
    chainCurveSnapshot?.paused ?? localCurveState?.[7] ?? status === "PAUSED";

  const dbCurveSnapshot = useMemo(() => {
    if (!reserveBnb && !tokenSold) return null;
    return machineFromTokenReserves(reserveBnb ?? "0", tokenSold, paused).snapshot;
  }, [reserveBnb, tokenSold, paused]);

  const bondingCurve = useMemo(() => {
    if (chainCurveSnapshot && !isEmptyCurveSnapshot(chainCurveSnapshot)) {
      return bondingCurveFromSnapshot(chainCurveSnapshot);
    }
    if (localCurveState && !isUninitializedCurveTuple(localCurveState)) {
      return bondingCurveStateFromTuple(localCurveState);
    }
    if (dbCurveSnapshot) {
      return bondingCurveFromSnapshot(dbCurveSnapshot);
    }
    return null;
  }, [chainCurveSnapshot, localCurveState, dbCurveSnapshot]);

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
    if (bnbUsd == null || bnbUsd <= 0) return 0n;
    const targetBnbOut = usdStringToSpendWei(amount, bnbUsd);
    if (targetBnbOut === 0n || !bondingCurve || protocolFeeBps === undefined) return 0n;
    return resolveTokenInForBnbOut(bondingCurve, protocolFeeBps, targetBnbOut) ?? 0n;
  }, [side, linkedSellTokenWei, sellInputMode, amount, bondingCurve, protocolFeeBps, bnbUsd]);

  const targetTokenWei = side === "sell" ? sellTokenWei : buyTargetTokenWei;

  const resolvedBuyBnbWei = useMemo(() => {
    if (side !== "buy" || buyInputMode !== "token" || buyTargetTokenWei === 0n) return null;
    if (!bondingCurve || protocolFeeBps === undefined) return null;
    return resolveBnbInForTokenOut(bondingCurve, protocolFeeBps, buyTargetTokenWei);
  }, [side, buyInputMode, buyTargetTokenWei, bondingCurve, protocolFeeBps]);

  const buySpendWei = useMemo(() => {
    if (side !== "buy") return 0n;
    if (buyInputMode === "token") return resolvedBuyBnbWei ?? 0n;
    if (bnbUsd == null || bnbUsd <= 0) return 0n;
    return usdStringToSpendWei(amount, bnbUsd);
  }, [side, buyInputMode, amount, resolvedBuyBnbWei, bnbUsd]);

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

  const resolvedTokenBalanceWei = overrideTokenBalanceWei ?? tokenBalance;

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

  const displayInputValue = amount;

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

  /** Fixed probe for UserOp gas overhead — stable Max / deposit / button (not amount-dependent). */
  const buyGasReserveProbeSpendWei = GAS_PROBE_BNB_WEI;

  const buyGasReserveProbeQuoteOut = useMemo(() => {
    if (side !== "buy" || !bondingCurve || protocolFeeBps === undefined) return 1n;
    const { tokenOut } = quoteBuyFromCurveState(
      bondingCurve,
      protocolFeeBps,
      buyGasReserveProbeSpendWei
    );
    return tokenOut > 0n ? tokenOut : 1n;
  }, [side, bondingCurve, protocolFeeBps]);

  const sellGasReserveProbeTokenWei = useMemo(() => {
    if (side !== "sell") return GAS_PROBE_TOKEN_WEI;
    if (tokenBalance != null && tokenBalance > 0n && tokenBalance < GAS_PROBE_TOKEN_WEI) {
      return tokenBalance;
    }
    return GAS_PROBE_TOKEN_WEI;
  }, [side, tokenBalance]);

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
    enabled: !paused && !wrongChain && hasTradeAmount,
    address,
    side,
    buyInputMode,
    tokenAddress,
    targetTokenWei:
      side === "sell"
        ? sellGasReserveProbeTokenWei
        : side === "buy" && buyInputMode === "token" && buyTargetTokenWei === 0n
          ? GAS_PROBE_TOKEN_WEI
          : targetTokenWei,
    buySpendWei: side === "buy" ? buyGasReserveProbeSpendWei : buySpendWei,
    resolvedBuyBnbWei: side === "buy" ? buyGasReserveProbeSpendWei : resolvedBuyBnbWei,
    buyQuoteOut: side === "buy" ? buyGasReserveProbeQuoteOut : buyQuoteOut ?? undefined,
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
    if (!isConnected || resolvedTokenBalanceWei === undefined || resolvedTokenBalanceWei === 0n) {
      return 0n;
    }
    return effectiveTokenBalance(pendingLedgerRef.current, resolvedTokenBalanceWei);
  }, [isConnected, resolvedTokenBalanceWei, pendingReservationTick]);

  const maxSellEthOutWei = useMemo(() => {
    if (!isConnected || maxSellTokenWei === 0n || !bondingCurve || protocolFeeBps === undefined) {
      return 0n;
    }
    const { ethOut } = quoteSellFromCurveState(bondingCurve, protocolFeeBps, maxSellTokenWei);
    return ethOut > 0n ? ethOut : 0n;
  }, [isConnected, maxSellTokenWei, bondingCurve, protocolFeeBps]);

  const insufficientSellTokenBalance =
    side === "sell" &&
    isConnected &&
    resolvedTokenBalanceWei !== undefined &&
    sellTokenWei > 0n &&
    sellTokenWei > maxSellTokenWei;

  const insufficientSellGas =
    side === "sell" &&
    isConnected &&
    sellTokenWei > 0n &&
    bnbBalance !== undefined &&
    sellGasReserveWei > 0n &&
    bnbBalance.value < sellGasReserveWei;

  const insufficientSellBalance = insufficientSellTokenBalance || insufficientSellGas;

  const effectiveNativeWei = useMemo(() => {
    if (!isConnected || bnbBalance === undefined) return undefined;
    return effectiveNativeBalance(pendingLedgerRef.current, bnbBalance.value);
  }, [isConnected, bnbBalance, pendingReservationTick]);

  const hasSubmitAmount = side === "buy" ? buyCostWei > 0n : sellTokenWei > 0n;

  const needsBuyEthFunding =
    side === "buy" &&
    hasSubmitAmount &&
    isConnected &&
    effectiveNativeWei !== undefined &&
    buyGasReserveWei > 0n &&
    buyCostWei + buyGasReserveWei > effectiveNativeWei;

  const needsSellEthFunding =
    side === "sell" &&
    hasSubmitAmount &&
    isConnected &&
    effectiveNativeWei !== undefined &&
    sellGasReserveWei > 0n &&
    effectiveNativeWei < sellGasReserveWei &&
    !insufficientSellTokenBalance;

  const showDepositCta =
    isConnected && !wrongChain && (needsBuyEthFunding || needsSellEthFunding);

  const insufficientBuyBalance = needsBuyEthFunding;

  const insufficientBalance =
    side === "buy" ? insufficientBuyBalance : insufficientSellBalance;

  const insufficientTokenOnly =
    side === "sell" && insufficientSellTokenBalance && !insufficientSellGas;

  const showInsufficientTokenBalance =
    side === "sell" &&
    isConnected &&
    !wrongChain &&
    hasSubmitAmount &&
    insufficientSellTokenBalance;

  const balancePending =
    side === "buy"
      ? isConnected && bnbBalance === undefined && buyCostWei > 0n
      : isConnected && resolvedTokenBalanceWei === undefined && sellTokenWei > 0n;

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
      resolvedTokenBalanceWei !== undefined
        ? effectiveTokenBalance(pendingLedgerRef.current, resolvedTokenBalanceWei)
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
      tokenBalance: resolvedTokenBalanceWei,
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
    resolvedTokenBalanceWei,
    buyGasReserveWei,
    sellGasReserveWei,
    legacyApproveGasReserveWei,
    gasPrice,
    pendingReservationTick,
  ]);

  const currencyLabel = activeInputMode === "usd" ? "USD" : symbol;
  const inputFieldLabel = activeInputMode === "usd" ? "Total" : "Amount";

  const availableLabel = useMemo(() => {
    if (!isConnected) return null;

    if (side === "buy") {
      if (bnbBalance === undefined) return "…";
      if (bnbUsd == null) return "…";
      const usd = bnbToUsd(Number(formatEther(maxBuySpendWei)), bnbUsd);
      return usd != null ? formatUsdReadable(usd) : "…";
    }

    if (resolvedTokenBalanceWei === undefined) return "…";
    return `${formatSellAvailTokenBalance(formatUnits(maxSellTokenWei, 18))} ${symbol}`;
  }, [
    isConnected,
    side,
    bnbBalance,
    resolvedTokenBalanceWei,
    maxBuySpendWei,
    maxSellTokenWei,
    bnbUsd,
    symbol,
  ]);

  /** Slider tracks wallet % only when amount ≤ max; manual over-max decouples (Coinbase/Jupiter pattern). */
  const [buySliderPct, setBuySliderPct] = useState(0);
  const [sellSliderPct, setSellSliderPct] = useState(0);
  const [teethDragging, setTeethDragging] = useState(false);
  const [teethDragPct, setTeethDragPct] = useState<number | null>(null);
  const sliderDraggingRef = useRef(false);
  const teethFrameRef = useRef<HTMLDivElement>(null);
  const applySliderPercentRef = useRef<(pct: number) => void>(() => {});

  useEffect(() => {
    if (!teethDragging) return;
    const onMove = (e: PointerEvent) => {
      if (!sliderDraggingRef.current) return;
      const frame = teethFrameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = Math.max(
        0,
        Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
      );
      setTeethDragPct(pct);
      applySliderPercentRef.current(pct);
    };
    const endDrag = () => {
      sliderDraggingRef.current = false;
      setTeethDragging(false);
      setTeethDragPct(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [teethDragging]);

  useEffect(() => {
    if (side !== "buy") return;
    if (sliderDraggingRef.current) return;
    if (maxBuySpendWei === 0n || buyCostWei <= 0n) {
      setBuySliderPct(0);
      return;
    }
    if (buyCostWei > maxBuySpendWei) {
      setBuySliderPct(0);
      return;
    }
    const pct = Math.max(
      0,
      Math.min(100, Math.round(Number((buyCostWei * 10000n) / maxBuySpendWei) / 100))
    );
    setBuySliderPct(pct);
  }, [side, buyCostWei, maxBuySpendWei]);

  useEffect(() => {
    if (side !== "sell") return;
    if (sliderDraggingRef.current) return;
    if (maxSellTokenWei === 0n || sellTokenWei <= 0n) {
      setSellSliderPct(0);
      return;
    }
    if (sellTokenWei > maxSellTokenWei) {
      setSellSliderPct(0);
      return;
    }
    const pct = Math.max(
      0,
      Math.min(100, Math.round(Number((sellTokenWei * 10000n) / maxSellTokenWei) / 100))
    );
    setSellSliderPct(pct);
  }, [side, sellTokenWei, maxSellTokenWei]);

  const buyAmountOverMax =
    side === "buy" && buyCostWei > maxBuySpendWei && buyCostWei > 0n && maxBuySpendWei > 0n;
  const sellAmountOverMax =
    side === "sell" && sellTokenWei > maxSellTokenWei && sellTokenWei > 0n && maxSellTokenWei > 0n;
  const amountOverMax = side === "buy" ? buyAmountOverMax : sellAmountOverMax;
  const atMaxSpend =
    side === "buy"
      ? buyCostWei > 0n &&
        maxBuySpendWei > 0n &&
        buyCostWei <= maxBuySpendWei &&
        buySliderPct >= 100
      : sellTokenWei > 0n &&
        maxSellTokenWei > 0n &&
        sellTokenWei <= maxSellTokenWei &&
        sellSliderPct >= 100;

  const gasCostLabel =
    gasLoading && gasCostWei == null
      ? "…"
      : userOpPrefundWei > 0n
        ? formatGasCostLabel(userOpPrefundWei, bnbUsd)
        : "—";

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

  const orderValuePrimary = useMemo(() => {
    if (!hasTradeAmount) return null;
    if (side === "buy") {
      if (estimatedOut <= 0n) return null;
      return `${formatTokenCompact(formatUnits(estimatedOut, 18))} ${symbol}`;
    }
    if (estimatedOut <= 0n) return null;
    return `${formatBnbReadable(Number(formatEther(estimatedOut)))} ${NATIVE_SYMBOL}`;
  }, [hasTradeAmount, side, estimatedOut, symbol]);

  const orderValueUsd = useMemo(() => {
    if (!hasTradeAmount) return null;
    if (side === "buy") {
      if (estimatedOut <= 0n) return null;
      if (estimatedQuotePriceUsd != null) {
        const usd = Number(formatUnits(estimatedOut, 18)) * estimatedQuotePriceUsd;
        return formatUsdReadable(usd, { compact: true });
      }
      return amountUsdValue != null ? formatUsdReadable(amountUsdValue, { compact: true }) : null;
    }
    if (amountUsdLabel) return amountUsdLabel;
    if (estimatedOut > 0n && bnbUsd != null) {
      const usd = bnbToUsd(Number(formatEther(estimatedOut)), bnbUsd);
      return usd != null ? formatUsdReadable(usd, { compact: true }) : null;
    }
    return null;
  }, [
    hasTradeAmount,
    side,
    estimatedOut,
    estimatedQuotePriceUsd,
    amountUsdValue,
    amountUsdLabel,
    bnbUsd,
  ]);

  const orderValueUsdNumber = useMemo(() => {
    if (!hasTradeAmount) return null;
    if (side === "buy") {
      if (estimatedOut <= 0n) return null;
      if (estimatedQuotePriceUsd != null) {
        return Number(formatUnits(estimatedOut, 18)) * estimatedQuotePriceUsd;
      }
      return amountUsdValue;
    }
    if (amountUsdValue != null) return amountUsdValue;
    if (estimatedOut > 0n && bnbUsd != null) {
      return bnbToUsd(Number(formatEther(estimatedOut)), bnbUsd);
    }
    return null;
  }, [
    hasTradeAmount,
    side,
    estimatedOut,
    estimatedQuotePriceUsd,
    amountUsdValue,
    bnbUsd,
  ]);

  const mobileTradePersistRef = useRef({
    hasTradeAmount: false,
    orderValueUsd: null as number | null,
  });

  mobileTradePersistRef.current = {
    hasTradeAmount,
    orderValueUsd: orderValueUsdNumber,
  };

  useEffect(() => {
    if (!persistTokenMobileTradePrefs) return;
    return () => {
      persistTokenMobileTradeFromPanel(mobileTradePersistRef.current);
    };
  }, [persistTokenMobileTradePrefs]);

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
    } else if (bnbUsd != null && bnbUsd > 0) {
      setAmount(formatUsdInputAmount(maxBuySpendWei, bnbUsd));
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
    bnbUsd,
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
    setAmountInputHint(null);
    setLinkedBuySpendWei(null);
    setLinkedSellTokenWei(null);
    setNumpadPreset(null);
    const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    setAmount(cleaned);
  }

  function clearTradeAmountInput() {
    setAmount("");
    setLinkedBuySpendWei(null);
    setLinkedSellTokenWei(null);
    setBuySliderPct(0);
    setSellSliderPct(0);
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

    if (bnbUsd != null && bnbUsd > 0) {
      setAmount(formatUsdInputAmount(spendWei, bnbUsd));
    } else {
      setAmount(formatAmountFromWei(spendWei));
    }
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
    setBuySliderPct(clamped);
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
    if (bnbUsd != null && bnbUsd > 0) {
      setAmount(formatUsdInputAmount(ethOut, bnbUsd));
    } else {
      setAmount(formatAmountFromWei(ethOut));
    }
    setError(null);
  }

  function applySellSliderPercent(pct: number) {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (wrongChain || paused || maxSellTokenWei === 0n) {
      return;
    }

    const clamped = Math.max(0, Math.min(100, pct));
    setSellSliderPct(clamped);
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

  function selectInputMode(mode: TradeInputMode) {
    if (mode === activeInputMode) {
      setAssetMenuOpen(false);
      return;
    }
    setAmount("");
    setLinkedBuySpendWei(null);
    setLinkedSellTokenWei(null);
    setError(null);
    setNumpadPreset(null);
    if (side === "buy") {
      setBuyInputMode(mode);
    } else {
      setSellInputMode(mode);
    }
    setAssetMenuOpen(false);
  }

  function toggleInputMode() {
    selectInputMode(activeInputMode === "usd" ? "token" : "usd");
  }

  useEffect(() => {
    if (!assetMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!assetMenuRef.current?.contains(event.target as Node)) {
        setAssetMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [assetMenuOpen]);

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
    setNumpadPreset(null);
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
      invalidateScwBalance();
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
      tradeSide === "sell" && resolvedTokenBalanceWei !== undefined
        ? availableTokenExcluding(pendingLedgerRef.current, resolvedTokenBalanceWei, pendingId)
        : resolvedTokenBalanceWei;

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
    if (prefill?.autoSubmit && isQuickSubmitFundingBlock(gate.reason)) {
      openQuickSubmitSheetInstead();
      return;
    }
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
      clearTradeAmountInput();
      return true;
    }
    if (gate.side === "sell" && sellParams) {
      if (needsLegacyApproval) {
        dispatchInstantLegacyApproveSell(sellParams, gate);
      } else {
        dispatchInstantSell(sellParams, gate, usePermit);
      }
      clearTradeAmountInput();
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

  function buildNativeConfirmLine(
    amountBnb: number,
    bnbUsdRate: number | null | undefined
  ): TradeConfirmAssetLine {
    return {
      amount: formatBnbReadable(amountBnb),
      symbol: NATIVE_SYMBOL,
      asset: "native",
      usd: bnbToUsd(amountBnb, bnbUsdRate),
    };
  }

  function buildTokenConfirmLine(
    tokenWei: bigint,
    tokenSym: string,
    addr: `0x${string}`,
    priceUsd: number | null | undefined
  ): TradeConfirmAssetLine {
    const qty = Number(formatUnits(tokenWei, 18));
    return {
      amount: formatTokenCompact(formatUnits(tokenWei, 18)),
      symbol: tokenSym,
      asset: "token",
      tokenAddress: addr,
      usd: priceUsd != null && Number.isFinite(priceUsd) ? qty * priceUsd : null,
    };
  }

  function openMaxTradeConfirmModal(): void {
    if (side === "buy") {
      const gate = evaluateLiveInstantGate();
      if (!gate.ok || gate.side !== "buy") {
        if (!gate.ok) notifyInstantGateFailure(gate);
        else toast.error("Order not sent", instantTradeGateMessage("quote_zero"));
        onConfirmOnlyClose?.();
        return;
      }

      const tradeReferrer = resolvePendingTradeReferrer();
      setPendingTrade({
        side: "buy",
        spend: buildNativeConfirmLine(Number(formatEther(buyCostWei)), bnbUsd),
        receive: buildTokenConfirmLine(
          gate.tokenOut,
          symbol,
          tokenAddress,
          estimatedQuotePriceUsd
        ),
        buyParams: {
          tokenAddress,
          minTokenOut: minOutWithSlippage(gate.tokenOut),
          value: gate.submitValue,
          referrer: tradeReferrer ?? undefined,
        },
      });
    } else {
      if (!sellQuoteOut) {
        toast.error("Quote unavailable", "Could not quote sell. Try a smaller amount.");
        onConfirmOnlyClose?.();
        return;
      }

      const tradeReferrer = resolvePendingTradeReferrer();
      setPendingTrade({
        side: "sell",
        spend: buildTokenConfirmLine(
          sellTokenWei,
          symbol,
          tokenAddress,
          estimatedQuotePriceUsd
        ),
        receive: buildNativeConfirmLine(Number(formatEther(sellQuoteOut)), bnbUsd),
        sellParams: {
          tokenAddress,
          amountWei: sellTokenWei,
          minBnbOut: minOutWithSlippage(sellQuoteOut),
          referrer: tradeReferrer ?? undefined,
        },
        usePermit: needsApproval && sellSupportsPermit,
      });
    }

    setConfirmOnlyPreparing(false);
    setTradeConfirmOpen(true);
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
      if (openQuickSubmitSheetInstead()) return;
      openDeposit();
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
    if (side === "sell" && showInsufficientTokenBalance) {
      if (openQuickSubmitSheetInstead()) return;
      return;
    }
    if (side === "buy" && buyCostWei === 0n) {
      setAmountInputHint("Please input amount");
      return;
    }
    if (side === "sell" && sellTokenWei === 0n) {
      setAmountInputHint("Please input amount");
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
    if (hasSubmitAmount) setAmountInputHint(null);
  }, [hasSubmitAmount]);

  async function confirmPendingTrade(rememberAutoConfirm: boolean) {
    if (!pendingTrade) return;
    setTradeConfirmError(null);
    setTradeConfirmLoading(true);
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
      if (confirmOnly) {
        onConfirmOnlyClose?.();
      }
    } catch (err) {
      setTradeConfirmError(formatTradeError(err));
      failTradeTrace("ux.confirm_modal.failed", err);
    } finally {
      setTradeConfirmLoading(false);
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

  const gasEstimatePending =
    isConnected && !wrongChain && hasSubmitAmount && userOpPrefundWei === 0n;

  const walletDataPending =
    isConnected &&
    hasSubmitAmount &&
    (side === "buy" ? bnbBalance === undefined : resolvedTokenBalanceWei === undefined);

  const tradeSubmitPending =
    hasSubmitAmount && isConnected && !wrongChain && (walletDataPending || gasEstimatePending);

  const buyGateBlocked =
    side === "buy" &&
    isConnected &&
    !wrongChain &&
    hasSubmitAmount &&
    !tradeSubmitPending &&
    !needsBuyEthFunding &&
    !instantTradeGate.ok &&
    !isTransientInstantGateReason(instantTradeGate.reason);

  useEffect(() => {
    if (!autoSubmitPendingRef.current || autoSubmitTriggeredRef.current) return;
    if (balancePending || tradeSubmitPending) return;
    if (!bondingCurve || protocolFeeBps === undefined) return;
    if (side === "sell") {
      if (sellTokenWei === 0n || !sellQuoteOut) return;
    } else if (side === "buy") {
      if (buyCostWei === 0n) return;
    } else {
      return;
    }

    if (showDepositCta || showInsufficientTokenBalance) {
      autoSubmitPendingRef.current = false;
      autoSubmitTriggeredRef.current = true;
      openQuickSubmitSheetInstead();
      return;
    }

    const gate = evaluateLiveInstantGate();
    if (!gate.ok) {
      if (isTransientInstantGateReason(gate.reason)) return;
      if (isQuickSubmitFundingBlock(gate.reason)) {
        autoSubmitPendingRef.current = false;
        autoSubmitTriggeredRef.current = true;
        openQuickSubmitSheetInstead();
      }
      return;
    }

    autoSubmitPendingRef.current = false;
    autoSubmitTriggeredRef.current = true;
    void submitTrade();
  }, [
    side,
    sellTokenWei,
    sellQuoteOut,
    buyCostWei,
    balancePending,
    tradeSubmitPending,
    bondingCurve,
    protocolFeeBps,
    showDepositCta,
    showInsufficientTokenBalance,
  ]);

  useEffect(() => {
    if (!confirmOnly) return;

    if (!isConnected) {
      openConnectModal?.();
      setConfirmOnlyPreparing(false);
      onConfirmOnlyClose?.();
      return;
    }

    if (confirmOnlyOpenedRef.current) return;

    if (wrongChain) {
      confirmOnlyOpenedRef.current = true;
      setConfirmOnlyPreparing(false);
      toast.error("Wrong network", "Switch to Base Sepolia to trade.");
      onConfirmOnlyClose?.();
      return;
    }

    if (paused) {
      confirmOnlyOpenedRef.current = true;
      setConfirmOnlyPreparing(false);
      toast.error("Trading paused", "This bonding curve is not accepting trades.");
      onConfirmOnlyClose?.();
      return;
    }

    if (tradeSubmitPending || balancePending) return;
    if (!bondingCurve || protocolFeeBps === undefined) return;

    if (side === "buy") {
      if (maxBuySpendWei === 0n || buyCostWei === 0n) {
        if (showDepositCta || maxBuySpendWei === 0n) {
          confirmOnlyOpenedRef.current = true;
          setConfirmOnlyPreparing(false);
          onConfirmOnlyFundingBlocked?.();
          onConfirmOnlyClose?.();
        }
        return;
      }
    } else if (maxSellTokenWei === 0n || sellTokenWei === 0n || !sellQuoteOut) {
      if (showInsufficientTokenBalance || showDepositCta || maxSellTokenWei === 0n) {
        confirmOnlyOpenedRef.current = true;
        setConfirmOnlyPreparing(false);
        onConfirmOnlyFundingBlocked?.();
        onConfirmOnlyClose?.();
      }
      return;
    }

    const gate = evaluateLiveInstantGate();
    if (!gate.ok) {
      if (isTransientInstantGateReason(gate.reason)) return;
      confirmOnlyOpenedRef.current = true;
      setConfirmOnlyPreparing(false);
      if (isQuickSubmitFundingBlock(gate.reason)) {
        onConfirmOnlyFundingBlocked?.();
        onConfirmOnlyClose?.();
        return;
      }
      notifyInstantGateFailure(gate);
      onConfirmOnlyClose?.();
      return;
    }

    confirmOnlyOpenedRef.current = true;
    openMaxTradeConfirmModal();
  }, [
    confirmOnly,
    isConnected,
    wrongChain,
    paused,
    tradeSubmitPending,
    balancePending,
    bondingCurve,
    protocolFeeBps,
    side,
    maxBuySpendWei,
    buyCostWei,
    maxSellTokenWei,
    sellTokenWei,
    sellQuoteOut,
    showDepositCta,
    showInsufficientTokenBalance,
    openConnectModal,
    onConfirmOnlyClose,
    onConfirmOnlyFundingBlocked,
  ]);

  const submitActionLabel = (() => {
    if (!isConnected) return "Sign in";
    if (wrongChain) return "Switch to Base Sepolia";
    if (paused) return "Trading paused";
    if (showInsufficientTokenBalance) return "Insufficient balance";
    if (tradeSubmitPending) return side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`;
    if (buyGateBlocked) return `Not enough ${NATIVE_SYMBOL}`;
    return side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`;
  })();

  const submitButtonClass =
    side === "buy"
      ? "trade-submit-button--buy"
      : showInsufficientTokenBalance
        ? "trade-submit-button--sell trade-submit-button--insufficient"
        : "trade-submit-button--sell";

  const submitDisabled = (() => {
    if (!isConnected) return false;
    if (wrongChain || paused) return true;
    if (showInsufficientTokenBalance) return true;
    if (tradeSubmitPending) return true;
    if (showDepositCta) return false;
    if (buyGateBlocked) return true;
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

  const canUseSlider = side === "buy" ? canUseMaxBuy : canUseMaxSell;
  const applySliderPercent = side === "buy" ? applyBuySliderPercent : applySellSliderPercent;
  applySliderPercentRef.current = applySliderPercent;
  const sliderPct = side === "buy" ? buySliderPct : sellSliderPct;
  const displayTeethPct = teethDragPct ?? sliderPct;
  const teethTooltipLeft =
    displayTeethPct <= 4 ? 4 : displayTeethPct >= 96 ? 96 : displayTeethPct;

  function updateTeethFromClientX(clientX: number) {
    const frame = teethFrameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(
      0,
      Math.min(100, Math.round(((clientX - rect.left) / rect.width) * 100))
    );
    setTeethDragPct(pct);
    applySliderPercent(pct);
  }

  function onTeethFramePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canUseSlider) return;
    e.preventDefault();
    sliderDraggingRef.current = true;
    setTeethDragging(true);
    updateTeethFromClientX(e.clientX);
  }

  function onTeethFramePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!sliderDraggingRef.current || !canUseSlider) return;
    e.preventDefault();
    updateTeethFromClientX(e.clientX);
  }

  function endTeethDrag() {
    if (!sliderDraggingRef.current) return;
    sliderDraggingRef.current = false;
    setTeethDragging(false);
    setTeethDragPct(null);
  }

  function onTeethSliderInput(value: number) {
    const clamped = Math.max(0, Math.min(100, value));
    setTeethDragPct(clamped);
    applySliderPercent(clamped);
  }

  const useCustomAmountNumpad = Boolean(embedded && compact);
  const useQuickOrderHeader = Boolean(embedded && compact && sheetOnClose);

  function switchTradeSide(next: Side) {
    if (next === side) return;
    setSide(next);
    setAmount("");
    setLinkedBuySpendWei(null);
    setLinkedSellTokenWei(null);
    setError(null);
    setAmountInputHint(null);
    setNumpadPreset(null);
    setAssetMenuOpen(false);
  }

  function applyNumpadPreset(pct: number) {
    setNumpadPreset(pct >= 100 ? "max" : pct);
    applySliderPercent(pct);
  }

  const resolvedNumpadPreset = (() => {
    if (numpadPreset != null) return numpadPreset;
    if (sliderPct >= 100 && hasTradeAmount) return "max" as const;
    if (sliderPct === 25 || sliderPct === 50 || sliderPct === 75) return sliderPct;
    return null;
  })();

  if (confirmOnly) {
    return (
      <>
        {confirmOnlyPreparing ? (
          <ModalPortal open>
            <>
              <button
                type="button"
                className="modal-backdrop modal-backdrop-dismiss z-[120] cursor-default"
                aria-label="Close"
                onClick={() => onConfirmOnlyClose?.()}
              />
              <div
                className="modal-sheet-host z-[121] items-center p-4"
                role="dialog"
                aria-modal="true"
                aria-busy="true"
                aria-label="Preparing trade quote"
              >
                <div className="modal-panel max-w-md rounded-xl p-5">
                  <p className="text-body-sm text-pump-muted">Preparing quote…</p>
                </div>
              </div>
            </>
          </ModalPortal>
        ) : null}
        <TradeConfirmModal
          open={tradeConfirmOpen}
          side={pendingTrade?.side ?? side}
          spend={
            pendingTrade?.spend ?? {
              amount: "—",
              symbol: NATIVE_SYMBOL,
              asset: "native",
              usd: null,
            }
          }
          receive={
            pendingTrade?.receive ?? {
              amount: "—",
              symbol,
              asset: "token",
              tokenAddress,
              usd: null,
            }
          }
          loading={tradeConfirmLoading}
          error={tradeConfirmError}
          onClose={() => {
            setTradeConfirmOpen(false);
            setTradeConfirmError(null);
            setPendingTrade(null);
            onConfirmOnlyClose?.();
          }}
          onConfirm={(remember) => void confirmPendingTrade(remember)}
        />
      </>
    );
  }

  return (
    <section
      className={
        embedded
          ? `trade-panel-embedded overflow-hidden p-0${compact ? " trade-panel--compact" : ""}${useCustomAmountNumpad ? " trade-panel--mobile-numpad" : ""}`
          : `panel-surface overflow-hidden p-0${compact ? " trade-panel--compact" : ""}`
      }
    >
      <form onSubmit={onSubmit}>
        {!compact ? (
          <div className="trade-panel-mode-tabs" role="tablist" aria-label="Order type">
            <button
              type="button"
              role="tab"
              aria-selected={tradeMode === "market"}
              className={
                tradeMode === "market"
                  ? "trade-panel-mode-tab trade-panel-mode-tab--active"
                  : "trade-panel-mode-tab"
              }
              onClick={() => {
                setTradeMode("market");
                setAssetMenuOpen(false);
              }}
            >
              Market
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tradeMode === "limit"}
              className={
                tradeMode === "limit"
                  ? "trade-panel-mode-tab trade-panel-mode-tab--active"
                  : "trade-panel-mode-tab"
              }
              onClick={() => {
                setTradeMode("limit");
                setAssetMenuOpen(false);
              }}
            >
              Limit
            </button>
          </div>
        ) : null}

        {tradeMode === "market" && useQuickOrderHeader ? (
          <TradeQuickOrderHeader
            tokenAddress={tokenAddress}
            symbol={symbol}
            logoUrl={logoUrl}
            priceUsd={priceUsd}
            changePct={changePct}
            side={side}
            onSideChange={switchTradeSide}
            onClose={sheetOnClose!}
            onOpenMarket={onOpenMarket}
          />
        ) : null}

        {tradeMode === "market" && !useQuickOrderHeader ? (
          <div className="trade-panel-tabs">
            <div className="trade-side-group">
              <button
                type="button"
                onClick={() => switchTradeSide("buy")}
                className={side === "buy" ? "trade-side-button-active-buy" : "trade-side-button"}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => switchTradeSide("sell")}
                className={side === "sell" ? "trade-side-button-active-sell" : "trade-side-button"}
              >
                Sell
              </button>
            </div>
          </div>
        ) : null}

        {tradeMode === "market" ? (
          <>
        {paused ? (
          <p className="notice-warning mx-4 mt-2 text-caption">Trading is paused on this curve.</p>
        ) : null}

        <div className={useCustomAmountNumpad ? "trade-panel-mobile-numpad-scroll" : undefined}>
        <div className="trade-panel-input-zone">
          <div className="trade-field">
            <div className="trade-field-header">
              <span className="trade-field-label">{inputFieldLabel}</span>
              {availableLabel ? (
                <span className="trade-field-avail text-caption leading-snug text-pump-muted">
                  Avail.{" "}
                  <span className="financial-value text-pump-text">{availableLabel}</span>
                </span>
              ) : null}
            </div>
            <div className="trade-amount-box">
              <input
                id="trade-amount"
                name="trade-amount"
                type="text"
                inputMode={useCustomAmountNumpad ? "none" : "decimal"}
                readOnly={useCustomAmountNumpad}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={displayInputValue}
                onChange={(e) => onDisplayInputChange(e.target.value)}
                onFocus={
                  useCustomAmountNumpad
                    ? (e) => {
                        e.currentTarget.blur();
                      }
                    : undefined
                }
                placeholder="0.0"
                className="trade-amount-box__input financial-value"
                aria-label={
                  side === "buy"
                    ? activeInputMode === "usd"
                      ? "Total in USD"
                      : `Amount in ${symbol}`
                    : sellInputMode === "token"
                      ? `Amount in ${symbol}`
                      : "Total in USD"
                }
              />
              <div className="trade-amount-box__asset" ref={assetMenuRef}>
                {useCustomAmountNumpad ? (
                  <button
                    type="button"
                    onClick={toggleInputMode}
                    className="trade-unit-chip"
                    aria-label={
                      activeInputMode === "usd" ? `Switch to ${symbol}` : "Switch to USD"
                    }
                  >
                    <span
                      className={
                        activeInputMode === "usd"
                          ? "trade-unit-chip__seg trade-unit-chip__seg--active"
                          : "trade-unit-chip__seg"
                      }
                    >
                      USD
                    </span>
                    <span className="trade-unit-chip__divider" aria-hidden />
                    <span
                      className={
                        activeInputMode === "token"
                          ? "trade-unit-chip__seg trade-unit-chip__seg--active"
                          : "trade-unit-chip__seg"
                      }
                    >
                      {symbol}
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setAssetMenuOpen((open) => !open)}
                      className="trade-asset-select"
                      aria-haspopup="listbox"
                      aria-expanded={assetMenuOpen}
                      aria-label="Select input currency"
                    >
                      <span className="text-body-sm font-medium text-pump-text">{currencyLabel}</span>
                      <PumpIcon icon={faChevronDown} className="h-3.5 w-3.5 opacity-70" />
                    </button>
                    {assetMenuOpen ? (
                      <div className="trade-asset-menu" role="listbox" aria-label="Input currency">
                        <button
                          type="button"
                          role="option"
                          aria-selected={activeInputMode === "usd"}
                          className="trade-asset-menu__option"
                          onClick={() => selectInputMode("usd")}
                        >
                          <span>USD</span>
                          {activeInputMode === "usd" ? (
                            <PumpIcon icon={faCheck} className="h-4 w-4 shrink-0" />
                          ) : null}
                        </button>
                        <button
                          type="button"
                          role="option"
                          aria-selected={activeInputMode === "token"}
                          className="trade-asset-menu__option"
                          onClick={() => selectInputMode("token")}
                        >
                          <span>{symbol}</span>
                          {activeInputMode === "token" ? (
                            <PumpIcon icon={faCheck} className="h-4 w-4 shrink-0" />
                          ) : null}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {amountInputHint ? (
              <p className="trade-field-hint text-caption text-pump-danger" role="alert">
                {amountInputHint}
              </p>
            ) : null}

            {useCustomAmountNumpad ? (
              <PumpAmountPresets
                onPresetPercent={applyNumpadPreset}
                onMax={() => applyNumpadPreset(100)}
                activePreset={resolvedNumpadPreset}
                presetsDisabled={!canUseSlider}
                maxDisabled={side === "buy" ? !canUseMaxBuy : !canUseMaxSell}
                disabled={paused}
                side={side}
              />
            ) : null}

            {!useCustomAmountNumpad ? (
            <div
              className={`trade-teeth-slider trade-teeth-slider--${side}${
                teethDragging ? " trade-teeth-slider--dragging" : ""
              }`}
            >
              <div
                ref={teethFrameRef}
                className={
                  teethDragging
                    ? "trade-teeth-slider__frame trade-teeth-slider__frame--dragging"
                    : "trade-teeth-slider__frame"
                }
                onPointerDown={onTeethFramePointerDown}
                onPointerMove={onTeethFramePointerMove}
                onPointerUp={endTeethDrag}
                onPointerCancel={endTeethDrag}
              >
              <div className="trade-teeth-stack" aria-hidden>
                <div className="trade-teeth-row trade-teeth-row--idle">
                  {Array.from({ length: TRADE_TEETH_COUNT }, (_, index) => (
                    <span
                      key={`idle-${index}`}
                      className={`trade-teeth-tick${
                        index % 10 === 9 ? " trade-teeth-tick--major" : " trade-teeth-tick--minor"
                      }`}
                    />
                  ))}
                </div>
                <div
                  className={`trade-teeth-row trade-teeth-row--fill trade-teeth-row--fill-${side}`}
                  style={{ clipPath: `inset(0 ${100 - displayTeethPct}% 0 0)` }}
                >
                  {Array.from({ length: TRADE_TEETH_COUNT }, (_, index) => (
                    <span
                      key={`fill-${index}`}
                      className={`trade-teeth-tick${
                        index % 10 === 9 ? " trade-teeth-tick--major" : " trade-teeth-tick--minor"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={displayTeethPct}
                onChange={(e) => onTeethSliderInput(Number(e.target.value))}
                onInput={(e) => onTeethSliderInput(Number(e.currentTarget.value))}
                disabled={!canUseSlider}
                className="trade-teeth-slider__input"
                aria-label={side === "buy" ? "Buy amount slider" : "Sell amount slider"}
                aria-valuenow={displayTeethPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={
                  amountOverMax
                    ? "Over available balance"
                    : atMaxSpend
                      ? "Max"
                      : `${sliderPct}% of ${side === "buy" ? "wallet balance" : "token balance"}`
                }
              />
            </div>
              {teethDragging ? (
                <span
                  className={`trade-teeth-tooltip trade-teeth-tooltip--${side}`}
                  style={{ left: `${teethTooltipLeft}%` }}
                  role="tooltip"
                >
                  {displayTeethPct}%
                </span>
              ) : null}
            </div>
            ) : null}
          </div>
        </div>

        {hasTradeAmount ? (
        <div className="trade-panel-details-zone trade-panel-details-grid">
          <span className="trade-detail-row__label">Order value</span>
          {orderValuePrimary ? (
            <div className="trade-order-value-primary">
              {side === "buy" ? (
                <TokenAvatar
                  address={tokenAddress}
                  symbol={symbol}
                  size={16}
                  className="!ring-0"
                />
              ) : (
                <NativeLogo size={16} />
              )}
              <span className="financial-value text-pump-text">{orderValuePrimary}</span>
            </div>
          ) : (
            <span className="trade-order-value-primary financial-value text-pump-text">—</span>
          )}
          <span className="trade-order-value-usd financial-value text-pump-muted">
            {orderValueUsd ?? "—"}
          </span>
          <span className="trade-detail-row__label">Est. gas</span>
          <span className="trade-detail-row__value trade-detail-row__value--wide financial-value">
            {gasCostLabel}
          </span>
        </div>
        ) : null}

        {error ? (
          <div className="notice-error mx-3 mb-2 px-3 py-2 text-caption" role="alert">
            {error}
          </div>
        ) : null}

        {useCustomAmountNumpad ? (
          <div className="trade-action-zone trade-action-zone--numpad-inline">
            <button
              type="submit"
              disabled={submitDisabled}
              className={`trade-submit-button ${submitButtonClass}`}
            >
              {submitActionLabel}
            </button>
          </div>
        ) : null}
        </div>

        {useCustomAmountNumpad ? (
          <div className="trade-panel-mobile-numpad-foot">
            <PumpAmountNumpad
              value={displayInputValue}
              onValueChange={onDisplayInputChange}
              disabled={paused}
            />
          </div>
        ) : (
        <div className="trade-action-zone">
          <button
            type="submit"
            disabled={submitDisabled}
            className={`trade-submit-button ${submitButtonClass}`}
          >
            {submitActionLabel}
          </button>
        </div>
        )}
          </>
        ) : (
          <div className="trade-limit-placeholder">
            <p className="text-body-sm font-medium text-pump-muted">Coming soon</p>
          </div>
        )}
      </form>

      <TradeConfirmModal
        open={tradeConfirmOpen}
        side={pendingTrade?.side ?? side}
        spend={
          pendingTrade?.spend ?? {
            amount: "—",
            symbol: NATIVE_SYMBOL,
            asset: "native",
            usd: null,
          }
        }
        receive={
          pendingTrade?.receive ?? {
            amount: "—",
            symbol,
            asset: "token",
            tokenAddress,
            usd: null,
          }
        }
        loading={tradeConfirmLoading}
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
