"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import type { TransactionReceipt } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useGasPrice,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { contracts, pumpChain } from "@/config/chain";
import { erc20Abi, maxUint256 } from "@/lib/abis/erc20";
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
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
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
  receipt: TransactionReceipt;
};

type TradePanelProps = {
  tokenAddress: `0x${string}`;
  symbol: string;
  status: string;
  reserveBnb?: string;
  embedded?: boolean;
  prefill?: TradePrefillConfig | null;
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
  return usdLabel ? `≈ ${bnbStr} BNB (${usdLabel})` : `≈ ${bnbStr} BNB`;
}

const GAS_EXTRA_WEI = parseEther("0.00015");
const GAS_PROBE_BNB_WEI = parseEther("0.001");
const GAS_PROBE_TOKEN_WEI = parseUnits("0.000001", 18);

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
  onTradeConfirmed,
  chainCurveSnapshot,
}: TradePanelProps) {
  const { address, isConnected, chain } = useAccount();
  const { data: gasPrice } = useGasPrice({ chainId: pumpChain.id });
  const { openConnectModal } = useConnectModal();
  const { bnbUsd } = useBnbUsdPrice();
  const [side, setSide] = useState<Side>("buy");
  const [buyInputMode, setBuyInputMode] = useState<TradeInputMode>("usd");
  const [sellInputMode, setSellInputMode] = useState<TradeInputMode>("usd");
  const [amount, setAmount] = useState("");
  const prefillAppliedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [receiveExpanded, setReceiveExpanded] = useState(true);
  const [pendingAction, setPendingAction] = useState<"buy" | "sell" | "approve" | null>(null);
  const pendingSellRef = useRef<{ amountWei: bigint; minBnbOut: bigint } | null>(null);
  /** Set when buy amount comes from slider/max — keeps token mode aligned with BNB/USD spend. */
  const [linkedBuySpendWei, setLinkedBuySpendWei] = useState<bigint | null>(null);
  /** Set when sell amount comes from slider/max — keeps USD/BNB modes aligned with token balance. */
  const [linkedSellTokenWei, setLinkedSellTokenWei] = useState<bigint | null>(null);

  useEffect(() => {
    if (!prefill || prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;
    setSide(prefill.side);
    if (prefill.side === "buy" && prefill.buyMode) {
      setBuyInputMode(prefill.buyMode);
    }
    if (prefill.side === "sell" && prefill.buyMode) {
      setSellInputMode(prefill.buyMode);
    }
    if (prefill.amount) {
      setAmount(prefill.amount);
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
    return quoteSellFromCurveState(bondingCurve, protocolFeeBps, targetTokenWei).zugOut;
  }, [side, targetTokenWei, bondingCurve, protocolFeeBps]);

  const buyQuoteOut = localBuyQuoteOut;
  const sellQuoteOut = localSellQuoteOut;

  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!writeError) return;
    setPendingAction(null);
    pendingSellRef.current = null;
    setError(formatTradeError(writeError));
  }, [writeError]);

  const paused =
    chainCurveSnapshot?.paused ?? localCurveState?.[9] ?? status === "PAUSED";

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
    ).zugOut;
    return quoted > 0n ? quoted : undefined;
  }, [side, bondingCurve, protocolFeeBps, sellQuoteOut, gasProbeSellTokenWei]);

  const gasProbeBuySpendWei = useMemo(() => {
    if (side !== "buy") return 0n;
    if (buyCostWei > 0n) return buyCostWei;
    if (bnbBalance != null && bnbBalance.value > GAS_EXTRA_WEI) {
      return bnbBalance.value - GAS_EXTRA_WEI;
    }
    return GAS_PROBE_BNB_WEI;
  }, [side, buyCostWei, bnbBalance]);

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
    needsApproval,
  });

  const estimatedGasWei = useMemo(() => {
    if (gasCostWei != null && gasCostWei > 0n) return gasCostWei;
    if (gasPrice != null && gasPrice > 0n) {
      const gasUnits =
        side === "buy"
          ? BUY_GAS_FALLBACK
          : SELL_GAS_FALLBACK + (needsApproval ? APPROVE_GAS_FALLBACK : 0n);
      return gasUnits * gasPrice;
    }
    return 0n;
  }, [gasCostWei, gasPrice, side, needsApproval]);

  /** On-chain estimate + hidden buffer for Max / balance checks (not shown in UI). */
  const gasReserveWei = useMemo(
    () => estimatedGasWei + GAS_EXTRA_WEI,
    [estimatedGasWei]
  );

  const buyGasReserveWei = side === "buy" ? gasReserveWei : 0n;
  const sellGasReserveWei = side === "sell" ? gasReserveWei : 0n;

  const maxBuySpendWei = useMemo(() => {
    if (!isConnected || bnbBalance === undefined || bnbBalance.value <= buyGasReserveWei) {
      return 0n;
    }
    return bnbBalance.value - buyGasReserveWei;
  }, [isConnected, bnbBalance, buyGasReserveWei]);

  const maxSellTokenWei = useMemo(() => {
    if (!isConnected || tokenBalance === undefined || tokenBalance === 0n) {
      return 0n;
    }
    return tokenBalance;
  }, [isConnected, tokenBalance]);

  const insufficientSellTokenBalance =
    side === "sell" &&
    isConnected &&
    tokenBalance !== undefined &&
    sellTokenWei > 0n &&
    sellTokenWei > tokenBalance;

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
    (buyCostWei > maxBuySpendWei || buyCostWei + buyGasReserveWei > bnbBalance.value);

  const insufficientBalance =
    side === "buy" ? insufficientBuyBalance : insufficientSellBalance;

  const balancePending =
    side === "buy"
      ? isConnected && bnbBalance === undefined && buyCostWei > 0n
      : isConnected && tokenBalance === undefined && sellTokenWei > 0n;

  const currencyLabel =
    activeInputMode === "usd"
      ? "USD"
      : activeInputMode === "bnb"
        ? "BNB"
        : symbol;

  const conversionParts: string[] = [];
  if (side === "buy") {
    if (buyInputMode === "token") {
      if (buyCostWei > 0n) {
        conversionParts.push(
          `≈ ${formatBnbReadable(Number(formatEther(buyCostWei)))} BNB`
        );
      }
      if (amountUsdLabel) {
        conversionParts.push(`≈ ${amountUsdLabel}`);
      }
    } else {
      if (Number(amount) > 0) {
        if (buyInputMode === "usd") {
          conversionParts.push(`≈ ${formatBnbReadable(Number(amount))} BNB`);
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
          `≈ ${formatBnbReadable(Number(formatEther(estimatedOut)))} BNB`
        );
      }
      if (amountUsdLabel) {
        conversionParts.push(`≈ ${amountUsdLabel}`);
      }
    } else {
      if (Number(amount) > 0) {
        if (sellInputMode === "usd") {
          conversionParts.push(`≈ ${formatBnbReadable(Number(amount))} BNB`);
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
  const receiveUnit = side === "buy" ? symbol : "BNB";

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
      : `${formatBnbReadable(Number(formatEther(minReceivedWei)))} BNB`;

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
      : estimatedGasWei > 0n
        ? formatGasCostLabel(estimatedGasWei, bnbUsd)
        : "—";

  const slippagePct = Number(SLIPPAGE_BPS) / 100;

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
    if (!receipt || !pendingAction) return;

    if (receipt.status !== "success") {
      setError("Transaction reverted on-chain. Check wallet balance, token status, and amount.");
      setPendingAction(null);
      pendingSellRef.current = null;
      reset();
      return;
    }

    if (pendingAction === "approve") {
      const pendingSell = pendingSellRef.current;
      refetchAllowance();

      if (pendingSell) {
        setPendingAction("sell");
        writeContract({
          address: contracts.bondingCurveManager,
          abi: bondingCurveManagerAbi,
          functionName: "sell",
          args: [tokenAddress, pendingSell.amountWei, pendingSell.minBnbOut],
          chainId: pumpChain.id,
        });
        return;
      }

      setPendingAction(null);
      pendingSellRef.current = null;
      reset();
      return;
    }

    setAmount("");
    setError(null);
    setLinkedBuySpendWei(null);
    setLinkedSellTokenWei(null);
    const confirmedSide = pendingAction;
    setPendingAction(null);
    pendingSellRef.current = null;
    void refetchBnbBalance();
    refetchBalance();
    refetchAllowance();
    reset();
    if (receipt.transactionHash && (confirmedSide === "buy" || confirmedSide === "sell")) {
      onTradeConfirmed?.({
        txHash: receipt.transactionHash,
        side: confirmedSide,
        receipt,
      });
    }
  }, [
    receipt,
    pendingAction,
    refetchAllowance,
    refetchBalance,
    refetchBnbBalance,
    reset,
    onTradeConfirmed,
    tokenAddress,
    writeContract,
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
        setError("Not enough BNB left after gas.");
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

    const { zugOut } = quoteSellFromCurveState(bondingCurve, protocolFeeBps, tokenWei);
    if (zugOut === 0n) return;
    setAmount(formatAmountFromWei(zugOut));
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
    if (bnbBalance !== undefined && bnbBalance.value < sellGasReserveWei) {
      setError("Not enough BNB for gas.");
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }
    if (wrongChain) {
      setError("Switch to BSC Testnet.");
      return;
    }
    if (paused) {
      setError("Trading is paused for this token.");
      return;
    }
    if (side === "buy") {
      if (buyCostWei === 0n) {
        setError("Enter a valid amount.");
        return;
      }
    } else if (sellTokenWei === 0n) {
      setError("Enter a valid amount.");
      return;
    }

    try {
      if (side === "buy") {
        const submitValue = capSpendToBalance(
          buyCostWei,
          bnbBalance?.value,
          buyGasReserveWei
        );
        if (submitValue === 0n) {
          setError("Insufficient BNB for trade and gas.");
          return;
        }
        if (bnbBalance !== undefined && submitValue + buyGasReserveWei > bnbBalance.value) {
          setError("Insufficient BNB for trade and gas.");
          return;
        }

        if (!bondingCurve || protocolFeeBps === undefined) {
          setError("Could not quote buy.");
          return;
        }

        const { tokenOut } = quoteBuyFromCurveState(
          bondingCurve,
          protocolFeeBps,
          submitValue
        );
        if (tokenOut === 0n) {
          setError("Could not quote buy. Try a smaller amount.");
          return;
        }

        setPendingAction("buy");
        writeContract({
          address: contracts.bondingCurveManager,
          abi: bondingCurveManagerAbi,
          functionName: "buy",
          args: [tokenAddress, minOutWithSlippage(tokenOut)],
          value: submitValue,
          chainId: pumpChain.id,
        });
        return;
      }

      if (!sellQuoteOut) {
        setError("Could not quote sell. Try a smaller amount.");
        return;
      }
      if (tokenBalance !== undefined && sellTokenWei > tokenBalance) {
        setError("Insufficient token balance.");
        return;
      }
      if (bnbBalance !== undefined && bnbBalance.value < sellGasReserveWei) {
        setError("Insufficient BNB for gas.");
        return;
      }

      if (needsApproval) {
        pendingSellRef.current = {
          amountWei: sellTokenWei,
          minBnbOut: minOutWithSlippage(sellQuoteOut),
        };
        setPendingAction("approve");
        writeContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [contracts.bondingCurveManager, maxUint256],
          chainId: pumpChain.id,
        });
        return;
      }

      pendingSellRef.current = null;
      setPendingAction("sell");
      writeContract({
        address: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "sell",
        args: [tokenAddress, sellTokenWei, minOutWithSlippage(sellQuoteOut)],
        chainId: pumpChain.id,
      });
    } catch (err) {
      setPendingAction(null);
      pendingSellRef.current = null;
      setError(formatTradeError(err));
    }
  }

  const isBusy = isPending || isConfirming;
  const submitLabel = !isConnected
    ? "Connect wallet to trade"
    : wrongChain
      ? "Switch to BSC Testnet"
      : insufficientBalance
        ? insufficientSellGas && !insufficientSellTokenBalance
          ? "Insufficient BNB for gas"
          : "Insufficient balance"
        : side === "buy"
          ? isBusy
            ? "Buying…"
            : "Buy"
          : needsApproval || pendingAction === "approve"
            ? isBusy
              ? pendingAction === "sell"
                ? "Selling…"
                : "Approving…"
              : `Approve ${symbol}`
            : isBusy
              ? "Selling…"
              : "Sell";

  const submitDisabled =
    isConnected &&
    (wrongChain || isBusy || paused || insufficientBalance || balancePending);
  const submitTone =
    side === "sell"
      ? "bg-pump-danger text-white"
      : "bg-pump-accent text-pump-accent-foreground";

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
      className={embedded ? "overflow-hidden p-0" : "panel-surface overflow-hidden p-0"}
    >
      <form onSubmit={onSubmit}>
        <div className="flex gap-2 px-4 pt-4">
          <button
            type="button"
            onClick={() => {
              setSide("buy");
              setAmount("");
              setLinkedBuySpendWei(null);
              setLinkedSellTokenWei(null);
              setError(null);
            }}
            className={
              side === "buy"
                ? "flex-1 rounded-full bg-pump-accent py-2 text-center text-caption font-semibold text-pump-accent-foreground"
                : "trade-side-button"
            }
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
            className={
              side === "sell"
                ? "flex-1 rounded-full bg-pump-danger py-2 text-center text-caption font-semibold text-white"
                : "trade-side-button"
            }
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
                  side === "buy" ? "bg-pump-accent/70" : "bg-pump-danger/70"
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
                side === "buy" ? "hover:text-pump-accent" : "hover:text-pump-danger"
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

        {error ? <p className="notice-error mx-4 mb-3">{error}</p> : null}

        {txHash ? (
          <p className="mx-4 mb-3 text-caption text-pump-muted break-all">
            Tx: {txHash}
            {isConfirming ? " — confirming…" : null}
          </p>
        ) : null}

        <div className="px-4 pb-4">
          <button
            type="submit"
            disabled={submitDisabled}
            className={`w-full rounded-xl py-3.5 text-body-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${submitTone}`}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
