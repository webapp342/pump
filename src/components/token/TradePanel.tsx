"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import type { TransactionReceipt } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { contracts, pumpChain } from "@/config/chain";
import { erc20Abi, maxUint256 } from "@/lib/abis/erc20";
import {
  bondingCurveManagerAbi,
  bondingCurveStateFromTuple,
  minOutWithSlippage,
  quoteBuyFromCurveState,
  resolveBnbInForTokenOut,
  SLIPPAGE_BPS,
} from "@/lib/bonding-curve";
import { formatTradeError } from "@/lib/trade-errors";
import { bnbToUsd, formatUsdReadable } from "@/lib/format-usd";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { BUY_GAS_FALLBACK, useTradeGasEstimate } from "@/hooks/useTradeGasEstimate";
import type { TradePrefillConfig } from "@/lib/token-trade-prefill";

type Side = "buy" | "sell";
type BuyInputMode = "usd" | "bnb" | "token";

const QUICK_USD_AMOUNTS = [25, 100, 250] as const;
const QUICK_BNB_AMOUNTS = [0.01, 0.1, 0.5] as const;
const QUICK_SELL_PERCENTAGES = [25, 50, 100] as const;

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

const GAS_RESERVE_BUFFER_BPS = 12_000n;
const TOKEN_MAX_SAFETY_BPS = 9_995n;
const FALLBACK_GAS_RESERVE_WEI = parseEther("0.0005");

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
}: TradePanelProps) {
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient({ chainId: pumpChain.id });
  const { openConnectModal } = useConnectModal();
  const { bnbUsd } = useBnbUsdPrice();
  const [side, setSide] = useState<Side>("buy");
  const [buyInputMode, setBuyInputMode] = useState<BuyInputMode>("usd");
  const [amount, setAmount] = useState("");
  const prefillAppliedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [receiveExpanded, setReceiveExpanded] = useState(true);
  const [pendingAction, setPendingAction] = useState<"buy" | "sell" | "approve" | null>(null);
  const pendingSellRef = useRef<{ amountWei: bigint; minBnbOut: bigint } | null>(null);

  useEffect(() => {
    if (!prefill || prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;
    setSide(prefill.side);
    if (prefill.side === "buy" && prefill.buyMode) {
      setBuyInputMode(prefill.buyMode);
    }
    if (prefill.amount) {
      setAmount(prefill.amount);
    }
  }, [prefill]);

  const targetTokenWei = useMemo(() => {
    if (side === "sell" || (side === "buy" && buyInputMode === "token")) {
      return parseTokenAmount(amount);
    }
    return 0n;
  }, [amount, side, buyInputMode]);

  const wrongChain = isConnected && chain?.id !== pumpChain.id;

  const { data: curveState } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "curves",
    args: [tokenAddress],
    chainId: pumpChain.id,
  });

  const { data: protocolFeeBps } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "protocolFeeBps",
    chainId: pumpChain.id,
  });

  const resolvedBuyBnbWei = useMemo(() => {
    if (side !== "buy" || buyInputMode !== "token" || targetTokenWei === 0n) return null;
    if (!curveState || protocolFeeBps === undefined) return null;
    return resolveBnbInForTokenOut(
      bondingCurveStateFromTuple(curveState),
      protocolFeeBps,
      targetTokenWei
    );
  }, [side, buyInputMode, targetTokenWei, curveState, protocolFeeBps]);

  const buySpendWei = useMemo(() => {
    if (side !== "buy") return 0n;
    if (buyInputMode === "token") return resolvedBuyBnbWei ?? 0n;
    return parseBnbAmount(amount);
  }, [side, buyInputMode, amount, resolvedBuyBnbWei]);

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

  const { data: buyQuote } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "quoteBuy",
    args: [tokenAddress, buySpendWei],
    chainId: pumpChain.id,
    query: {
      enabled: side === "buy" && buyInputMode !== "token" && buySpendWei > 0n,
    },
  });

  const { data: sellQuote } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "quoteSell",
    args: [tokenAddress, targetTokenWei],
    chainId: pumpChain.id,
    query: { enabled: side === "sell" && targetTokenWei > 0n },
  });

  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!writeError) return;
    setPendingAction(null);
    pendingSellRef.current = null;
    setError(formatTradeError(writeError));
  }, [writeError]);

  const paused = curveState?.[9] ?? status === "PAUSED";

  const estimatedOut =
    side === "sell"
      ? sellQuote?.[0] ?? 0n
      : buyInputMode === "token"
        ? targetTokenWei
        : buyQuote?.[0] ?? 0n;

  const spendBnbNumber =
    side === "buy" ? Number(formatEther(buySpendWei)) : Number(formatEther(estimatedOut));
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
    targetTokenWei > 0n &&
    allowance !== undefined &&
    allowance < targetTokenWei;

  const displayInputValue =
    side === "buy" && buyInputMode === "usd" && bnbUsd != null
      ? amount && Number(amount) > 0
        ? (Number(amount) * bnbUsd).toFixed(2).replace(/\.?0+$/, "")
        : amount
      : amount;

  const hasTradeAmount =
    side === "buy"
      ? buyInputMode === "token"
        ? targetTokenWei > 0n
        : buySpendWei > 0n
      : targetTokenWei > 0n;

  const buyCostWei = useMemo(() => {
    if (side !== "buy") return 0n;
    if (buyInputMode === "token") return resolvedBuyBnbWei ?? 0n;
    return buySpendWei;
  }, [side, buyInputMode, resolvedBuyBnbWei, buySpendWei]);

  const insufficientSellBalance =
    side === "sell" &&
    isConnected &&
    tokenBalance !== undefined &&
    targetTokenWei > 0n &&
    targetTokenWei > tokenBalance;

  const insufficientBuyBalance =
    side === "buy" &&
    isConnected &&
    bnbBalance !== undefined &&
    buyCostWei > 0n &&
    buyCostWei > bnbBalance.value;

  const insufficientBalance =
    side === "buy" ? insufficientBuyBalance : insufficientSellBalance;

  const balancePending =
    side === "buy"
      ? isConnected && bnbBalance === undefined && buyCostWei > 0n
      : isConnected && tokenBalance === undefined && targetTokenWei > 0n;

  const currencyLabel =
    side === "buy"
      ? buyInputMode === "usd"
        ? "USD"
        : buyInputMode === "bnb"
          ? "BNB"
          : symbol
      : symbol;

  const conversionParts: string[] = [];
  if (side === "buy") {
    if (buyInputMode === "token") {
      if (buySpendWei > 0n) {
        conversionParts.push(
          `≈ ${formatBnbReadable(Number(formatEther(buySpendWei)))} BNB`
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
  } else if (targetTokenWei > 0n && estimatedOut > 0n) {
    const bnbOut = Number(formatEther(estimatedOut));
    conversionParts.push(`≈ ${formatBnbReadable(bnbOut)} BNB`);
    const usdOut = bnbToUsd(bnbOut, bnbUsd);
    if (usdOut != null) {
      conversionParts.push(`≈ ${formatUsdReadable(usdOut)}`);
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
      if (buyInputMode === "token" && targetTokenWei > 0n) {
        return minOutWithSlippage(targetTokenWei);
      }
      if (estimatedOut > 0n) return minOutWithSlippage(estimatedOut);
    } else if (estimatedOut > 0n) {
      return minOutWithSlippage(estimatedOut);
    }
    return 0n;
  }, [side, buyInputMode, targetTokenWei, estimatedOut]);

  const minReceivedLabel =
    side === "buy"
      ? `${formatReceiveAmount(formatUnits(minReceivedWei, 18))} ${symbol}`
      : `${formatBnbReadable(Number(formatEther(minReceivedWei)))} BNB`;

  const slippagePct = Number(SLIPPAGE_BPS) / 100;

  const gasEstimateEnabled =
    !paused &&
    hasTradeAmount &&
    (side === "buy" ? buyCostWei > 0n : targetTokenWei > 0n) &&
    (!isConnected || Boolean(address) && !wrongChain);

  const { gasCostWei, isLoading: gasLoading } = useTradeGasEstimate({
    enabled: gasEstimateEnabled,
    address,
    side,
    buyInputMode,
    tokenAddress,
    targetTokenWei,
    buySpendWei,
    resolvedBuyBnbWei,
    buyQuoteOut: buyQuote?.[0],
    sellQuoteOut: sellQuote?.[0],
    needsApproval,
  });

  const gasCostLabel =
    gasCostWei !== null ? formatGasCostLabel(gasCostWei, bnbUsd) : null;

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
    const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    if (side === "buy" && buyInputMode === "usd" && bnbUsd != null && bnbUsd > 0) {
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

  function setQuickUsd(usd: number) {
    if (!bnbUsd || bnbUsd <= 0) return;
    setAmount(String(usd / bnbUsd));
    setError(null);
  }

  function setQuickBnb(bnb: number) {
    setAmount(String(bnb));
    setError(null);
  }

  function setQuickSellPercent(percent: number) {
    if (tokenBalance === undefined || tokenBalance === 0n) return;
    const amountWei = (tokenBalance * BigInt(percent)) / 100n;
    if (amountWei === 0n) return;
    setAmount(formatUnits(amountWei, 18));
    setError(null);
  }

  async function resolveBuyGasReserveWei(): Promise<bigint> {
    if (gasCostWei != null && gasCostWei > 0n) {
      return (gasCostWei * GAS_RESERVE_BUFFER_BPS) / 10_000n;
    }
    if (!publicClient) return FALLBACK_GAS_RESERVE_WEI;
    try {
      const gasPrice = await publicClient.getGasPrice();
      return (BUY_GAS_FALLBACK * gasPrice * GAS_RESERVE_BUFFER_BPS) / 10_000n;
    } catch {
      return FALLBACK_GAS_RESERVE_WEI;
    }
  }

  async function onUseMaxBuy() {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (wrongChain || paused || bnbBalance === undefined || bnbBalance.value === 0n) return;

    const gasReserve = await resolveBuyGasReserveWei();
    const maxSpend =
      bnbBalance.value > gasReserve ? bnbBalance.value - gasReserve : 0n;
    if (maxSpend === 0n) {
      setError("Not enough BNB left after gas.");
      return;
    }

    if (buyInputMode === "token") {
      if (!curveState || protocolFeeBps === undefined) {
        setError("Curve quote unavailable — try again.");
        return;
      }
      const curve = bondingCurveStateFromTuple(curveState);
      const { tokenOut } = quoteBuyFromCurveState(curve, protocolFeeBps, maxSpend);
      if (tokenOut === 0n) {
        setError("Could not quote max buy for this token.");
        return;
      }
      let safeTokens = (tokenOut * TOKEN_MAX_SAFETY_BPS) / 10_000n;
      const required = resolveBnbInForTokenOut(curve, protocolFeeBps, safeTokens);
      if (required != null && required > maxSpend && safeTokens > 0n) {
        safeTokens = (safeTokens * TOKEN_MAX_SAFETY_BPS) / 10_000n;
      }
      if (safeTokens === 0n) {
        setError("Amount too small after gas reserve.");
        return;
      }
      setAmount(formatTokenInputAmount(safeTokens));
      setError(null);
      return;
    }

    setAmount(formatAmountFromWei(maxSpend));
    setError(null);
  }

  function toggleBuyInputMode() {
    if (side !== "buy") return;
    setBuyInputMode((mode) => {
      if (mode === "usd") return "bnb";
      if (mode === "bnb") return "token";
      return "usd";
    });
    setAmount("");
    setError(null);
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
      if (buyInputMode === "token" && targetTokenWei === 0n) {
        setError("Enter a valid amount.");
        return;
      }
      if (buyInputMode !== "token" && buySpendWei === 0n) {
        setError("Enter a valid amount.");
        return;
      }
    } else if (targetTokenWei === 0n) {
      setError("Enter a valid amount.");
      return;
    }

    try {
      if (side === "buy") {
        if (bnbBalance !== undefined && buyCostWei > bnbBalance.value) {
          return;
        }

        if (buyInputMode === "token") {
          if (!resolvedBuyBnbWei) {
            setError("Could not quote buy for this token amount.");
            return;
          }
          setPendingAction("buy");
          writeContract({
            address: contracts.bondingCurveManager,
            abi: bondingCurveManagerAbi,
            functionName: "buy",
            args: [tokenAddress, minOutWithSlippage(targetTokenWei)],
            value: resolvedBuyBnbWei,
            chainId: pumpChain.id,
          });
          return;
        }

        if (!buyQuote?.[0]) {
          setError("Could not quote buy. Try a smaller amount.");
          return;
        }

        setPendingAction("buy");
        writeContract({
          address: contracts.bondingCurveManager,
          abi: bondingCurveManagerAbi,
          functionName: "buy",
          args: [tokenAddress, minOutWithSlippage(buyQuote[0])],
          value: buySpendWei,
          chainId: pumpChain.id,
        });
        return;
      }

      if (!sellQuote?.[0]) {
        setError("Could not quote sell. Try a smaller amount.");
        return;
      }
      if (tokenBalance !== undefined && targetTokenWei > tokenBalance) {
        return;
      }

      if (needsApproval) {
        pendingSellRef.current = {
          amountWei: targetTokenWei,
          minBnbOut: minOutWithSlippage(sellQuote[0]),
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
        args: [tokenAddress, targetTokenWei, minOutWithSlippage(sellQuote[0])],
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
        ? "Insufficient balance"
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
    side === "sell" && isConnected && !wrongChain
      ? "bg-pump-danger text-white"
      : "bg-pump-accent text-pump-accent-foreground";

  const canUseMaxBuy =
    side === "buy" &&
    !paused &&
    (!isConnected || (!wrongChain && bnbBalance !== undefined && bnbBalance.value > 0n));

  const maxRevealClass =
    "overflow-hidden whitespace-nowrap transition-[opacity,transform,max-width,padding,margin] duration-200 ease-out " +
    "max-w-0 scale-95 px-0 opacity-0 ml-0 pointer-events-none " +
    "max-md:group-focus-within/trade:max-w-[3.75rem] max-md:group-focus-within/trade:scale-100 max-md:group-focus-within/trade:px-2.5 max-md:group-focus-within/trade:opacity-100 max-md:group-focus-within/trade:ml-1.5 max-md:group-focus-within/trade:pointer-events-auto " +
    "md:group-focus-within/trade:max-w-[3.75rem] md:group-focus-within/trade:scale-100 md:group-focus-within/trade:px-2.5 md:group-focus-within/trade:opacity-100 md:group-focus-within/trade:ml-1.5 md:group-focus-within/trade:pointer-events-auto " +
    "md:group-hover/trade:max-w-[3.75rem] md:group-hover/trade:scale-100 md:group-hover/trade:px-2.5 md:group-hover/trade:opacity-100 md:group-hover/trade:ml-1.5 md:group-hover/trade:pointer-events-auto";

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
        <div className="group/trade px-4 pt-4 pb-0">
          <div className="flex justify-center">
            <div className="inline-flex max-w-full items-baseline flex-nowrap gap-2">
              <div
                className={
                  side === "buy" && buyInputMode === "usd" ? "relative shrink-0 pl-3.5 md:pl-4" : "shrink-0"
                }
              >
                {side === "buy" && buyInputMode === "usd" ? (
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
                  aria-label={side === "buy" ? "Trade amount" : `Amount in ${symbol}`}
                />
              </div>
              <button
                type="button"
                onClick={toggleBuyInputMode}
                disabled={side === "sell"}
                className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-caption leading-none text-pump-muted transition hover:text-pump-text disabled:opacity-40"
                aria-label="Toggle input currency"
              >
                {currencyLabel}
                {side === "buy" ? <SwapArrowsIcon /> : null}
              </button>
            </div>
          </div>

          {conversionParts.length > 0 ? (
            <p className="mt-2 text-center text-caption text-pump-muted">
              {conversionParts.join(" · ")}
            </p>
          ) : null}

          {side === "buy" ? (
            <div className="mt-3 flex justify-center pb-3">
              <div className="inline-flex max-w-full items-center justify-center">
                {buyInputMode !== "token" ? (
                  <div className="inline-flex items-center gap-2 md:gap-3">
                    {buyInputMode === "usd"
                      ? QUICK_USD_AMOUNTS.map((usd) => (
                          <button
                            key={usd}
                            type="button"
                            onClick={() => setQuickUsd(usd)}
                            disabled={!bnbUsd}
                            className="chip-button-quick shrink-0 disabled:opacity-40"
                          >
                            ${usd}
                          </button>
                        ))
                      : QUICK_BNB_AMOUNTS.map((bnb) => (
                          <button
                            key={bnb}
                            type="button"
                            onClick={() => setQuickBnb(bnb)}
                            className="chip-button-quick shrink-0 whitespace-nowrap"
                          >
                            {bnb}&nbsp;BNB
                          </button>
                        ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void onUseMaxBuy()}
                  disabled={!canUseMaxBuy}
                  className={`chip-button-quick shrink-0 text-caption disabled:opacity-40 ${maxRevealClass}`}
                >
                  Max
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {side === "sell" ? (
          <div className="mt-3 flex items-center justify-center gap-10 px-4 pb-3">
            {QUICK_SELL_PERCENTAGES.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setQuickSellPercent(pct)}
                disabled={tokenBalance === undefined || tokenBalance === 0n}
                className="chip-button-quick chip-button-quick-danger disabled:opacity-40"
              >
                {pct}%
              </button>
            ))}
          </div>
        ) : null}

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
                    {gasLoading && gasCostWei === null
                      ? "…"
                      : gasCostLabel ?? (gasLoading ? "…" : "—")}
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
