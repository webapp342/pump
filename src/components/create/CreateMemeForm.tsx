"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther, parseEventLogs } from "viem";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { contracts, pumpChain } from "@/config/chain";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import {
  bondingCurveManagerAbi,
  DEFAULT_VIRTUAL_BNB_RESERVE,
  DEFAULT_VIRTUAL_TOKEN_RESERVE,
  formatTokenAmountCompact,
  minOutWithSlippage,
  quoteFreshBuy,
  SLIPPAGE_BPS,
} from "@/lib/bonding-curve";
import { MISSION_KEYS, pushOptimisticActivity } from "@/lib/optimistic-activity";
import { saveTokenMetadata } from "@/lib/save-token-metadata";
import { normalizeSocialLinks } from "@/lib/token-social";
import {
  LOGO_ACCEPT,
  uploadTokenLogo,
  validateLogoFileClient,
} from "@/lib/upload-token-logo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { BnbLogo } from "@/components/token/BnbLogo";
import {
  BnbAmountDisplay,
  BnbAmountLabel,
  TokenAmountDisplay,
} from "@/components/token/AssetAmountDisplay";
import { TokenLaunchSuccessModal } from "@/components/create/TokenLaunchSuccessModal";
import { DEFAULT_MIN_INITIAL_BUY_BNB } from "@/lib/platform-settings";
import { formatCampaignAmount, formatCampaignAmountInput } from "@/lib/airdrop-board-format";

type LaunchSuccess = {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  logoPreviewUrl?: string;
};

/** Headroom for create + initial-buy tx gas on top of fee + buy amount. */
const CREATE_GAS_BUFFER_BNB = parseEther("0.003");

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read logo file"));
    reader.readAsDataURL(file);
  });
}

function IssuanceSummaryRows({
  feeWei,
  initialBuyWei,
  showReceivePreview,
  estimatedTokens,
  displaySymbol,
  logoPreview,
  totalValue,
  variant = "desktop",
}: {
  feeWei: bigint;
  initialBuyWei: bigint;
  showReceivePreview: boolean;
  estimatedTokens: bigint;
  displaySymbol: string;
  logoPreview: string | null;
  totalValue: bigint;
  variant?: "desktop" | "mobile";
}) {
  const isMobile = variant === "mobile";
  const rowClass = `flex items-center justify-between gap-3 ${isMobile ? "text-caption" : "text-body-sm"}`;
  const totalLogoSize = isMobile ? 16 : 20;
  const totalAmountClass = isMobile
    ? "financial-value text-body-sm font-semibold tabular-nums text-pump-text"
    : "financial-value text-h3 font-semibold tabular-nums text-pump-text";
  const totalSymbolClass = isMobile
    ? "text-caption font-medium text-pump-muted"
    : "text-body-sm font-medium text-pump-muted";

  return (
    <dl className={isMobile ? "space-y-2.5" : "mt-4 space-y-3"}>
      <div className={rowClass}>
        <dt className="text-pump-muted">Create fee</dt>
        <dd className="min-w-0 shrink-0 text-right">
          <BnbAmountDisplay
            amount={formatCampaignAmount(feeWei)}
            logoSize={isMobile ? 14 : 18}
            amountClassName={
              isMobile
                ? "financial-value text-caption font-medium tabular-nums text-pump-text"
                : undefined
            }
            symbolClassName={isMobile ? "text-caption font-medium text-pump-muted" : undefined}
          />
        </dd>
      </div>
      {initialBuyWei > 0n ? (
        <div className={rowClass}>
          <dt className="text-pump-muted">Initial buy</dt>
          <dd className="min-w-0 shrink-0 text-right">
            <BnbAmountDisplay
              amount={formatCampaignAmount(initialBuyWei)}
              logoSize={isMobile ? 14 : 18}
              amountClassName={
                isMobile
                  ? "financial-value text-caption font-medium tabular-nums text-pump-text"
                  : undefined
              }
              symbolClassName={isMobile ? "text-caption font-medium text-pump-muted" : undefined}
            />
          </dd>
        </div>
      ) : null}
      {showReceivePreview ? (
        <div className={rowClass}>
          <dt className="text-pump-muted">You receive</dt>
          <dd className="min-w-0 max-w-[58%] shrink-0 text-right">
            <TokenAmountDisplay
              amount={formatTokenAmountCompact(estimatedTokens)}
              symbol={displaySymbol}
              previewUrl={logoPreview}
              logoSize={isMobile ? 14 : 18}
              amountClassName={
                isMobile
                  ? "financial-value text-caption font-medium tabular-nums text-pump-text"
                  : undefined
              }
              symbolClassName={isMobile ? "text-caption font-medium text-pump-muted" : undefined}
            />
          </dd>
        </div>
      ) : null}
      <div
        className={`${rowClass} border-t border-pump-border/15 ${isMobile ? "pt-2.5" : "pt-3"}`}
      >
        <dt className="font-medium text-pump-text">Total</dt>
        <dd className="min-w-0 shrink-0 text-right">
          <BnbAmountDisplay
            amount={formatCampaignAmount(totalValue)}
            logoSize={totalLogoSize}
            amountClassName={totalAmountClass}
            symbolClassName={totalSymbolClass}
          />
        </dd>
      </div>
    </dl>
  );
}

export function CreateMemeForm() {
  const router = useRouter();
  const handledReceiptRef = useRef<string | null>(null);
  const logoFileRef = useRef<File | null>(null);
  const logoPreviewRef = useRef<string | null>(null);
  const descriptionRef = useRef("");
  const socialLinksRef = useRef({ twitter: "", website: "", telegram: "", discord: "" });
  const { openConnectModal } = useOpenConnectModal();
  const { address, isConnected, chain } = useAccount();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [minInitialBuyBnb, setMinInitialBuyBnb] = useState(DEFAULT_MIN_INITIAL_BUY_BNB);
  const [initialBuyBnb, setInitialBuyBnb] = useState(DEFAULT_MIN_INITIAL_BUY_BNB);
  const [socialOpen, setSocialOpen] = useState(false);
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchFinalizing, setLaunchFinalizing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<LaunchSuccess | null>(null);

  logoFileRef.current = logoFile;
  logoPreviewRef.current = logoPreview;
  descriptionRef.current = description;
  socialLinksRef.current = { twitter, website, telegram, discord };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/platform/settings", { cache: "no-store" });
        const body = (await res.json()) as { data?: { minInitialBuyBnb?: string } };
        if (!res.ok || cancelled) return;
        const min = body.data?.minInitialBuyBnb ?? DEFAULT_MIN_INITIAL_BUY_BNB;
        setMinInitialBuyBnb(min);
        setInitialBuyBnb(min);
      } catch {
        // Keep defaults on transient errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const minInitialBuyWei = useMemo(() => parseEther(minInitialBuyBnb), [minInitialBuyBnb]);

  const contractsReady = Boolean(contracts.memeFactory && contracts.bondingCurveManager);

  const { data: createFee } = useReadContract({
    address: contracts.memeFactory,
    abi: memeFactoryAbi,
    functionName: "createFee",
    chainId: pumpChain.id,
  });

  const { data: virtualBnbReserveOnChain } = useReadContract({
    address: contracts.memeFactory,
    abi: memeFactoryAbi,
    functionName: "defaultVirtualZugReserve",
    chainId: pumpChain.id,
  });

  const { data: virtualTokenReserve } = useReadContract({
    address: contracts.memeFactory,
    abi: memeFactoryAbi,
    functionName: "defaultVirtualTokenReserve",
    chainId: pumpChain.id,
  });

  const { data: protocolFeeBps } = useReadContract({
    address: contracts.bondingCurveManager,
    abi: bondingCurveManagerAbi,
    functionName: "protocolFeeBps",
    chainId: pumpChain.id,
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const { data: bnbBalance, isLoading: bnbBalanceLoading } = useBalance({
    address,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    if (!receipt) return;
    if (handledReceiptRef.current === receipt.transactionHash) return;
    handledReceiptRef.current = receipt.transactionHash;

    const events = parseEventLogs({
      abi: memeFactoryAbi,
      logs: receipt.logs,
      eventName: "TokenCreated",
    });

    const token = events[0]?.args.token;
    if (!token) {
      setError("Token created but address could not be read from receipt. Check explorer.");
      reset();
      return;
    }

    const created = events[0]?.args;
    const file = logoFileRef.current;
    const preview = logoPreviewRef.current;
    const savedDescription = descriptionRef.current.trim();
    const savedSocial = normalizeSocialLinks(socialLinksRef.current);

    void (async () => {
        let logoPreviewUrl: string | undefined;
        if (file) {
          try {
            logoPreviewUrl = preview?.startsWith("data:") ? preview : await fileToDataUrl(file);
          } catch {
            logoPreviewUrl = preview ?? undefined;
          }
        }

        pushOptimisticActivity({
          txHash: receipt.transactionHash,
          type: "create",
          at: new Date().toISOString(),
          tokenAddress: token,
          tokenName: created?.name,
          tokenSymbol: created?.symbol,
          tokenDescription: savedDescription || undefined,
          socialLinks: savedSocial,
          creatorAddress: address ?? created?.creator,
          logoPreviewUrl,
          missionKeys: [MISSION_KEYS.deployMeme, MISSION_KEYS.dailySwap],
        });

        setLaunchFinalizing(true);

        setUploadStatus("Saving profile…");
        try {
          await saveTokenMetadata({
            tokenAddress: token,
            txHash: receipt.transactionHash,
            description: savedDescription || undefined,
            socialLinks: savedSocial,
          });
        } catch (metaErr) {
          console.warn("[create] metadata save failed:", metaErr);
        }

        if (file) {
          setUploadStatus("Uploading logo…");
          try {
            await uploadTokenLogo({
              tokenAddress: token,
              txHash: receipt.transactionHash,
              file,
            });
            setUploadStatus("Logo uploaded");
          } catch (uploadErr) {
            console.warn("[create] logo upload failed:", uploadErr);
            setUploadStatus("Logo upload failed — you can retry from token page later");
          }
        } else {
          setUploadStatus("Profile saved");
        }

      setLaunchSuccess({
        tokenAddress: token,
        tokenName: created?.name ?? (name.trim() || "Token"),
        tokenSymbol: created?.symbol ?? (symbol.trim() || "TOKEN"),
        logoPreviewUrl,
      });
      setLaunchFinalizing(false);
      setUploadStatus(null);
    })();
  }, [receipt, reset, address, name, symbol]);

  const wrongChain = isConnected && chain?.id !== pumpChain.id;
  const feeWei = createFee ?? 0n;

  const initialBuyWei = useMemo(() => {
    const trimmed = initialBuyBnb.trim();
    if (!trimmed) return 0n;
    try {
      const value = parseEther(trimmed);
      return value > 0n ? value : 0n;
    } catch {
      return 0n;
    }
  }, [initialBuyBnb]);

  const resolvedVirtualBnb = virtualBnbReserveOnChain ?? DEFAULT_VIRTUAL_BNB_RESERVE;
  const resolvedVirtualToken = virtualTokenReserve ?? DEFAULT_VIRTUAL_TOKEN_RESERVE;

  const estimatedTokens = useMemo(() => {
    if (initialBuyWei <= 0n || protocolFeeBps === undefined) {
      return 0n;
    }

    return quoteFreshBuy({
      zugIn: initialBuyWei,
      virtualZugReserve: resolvedVirtualBnb,
      virtualTokenReserve: resolvedVirtualToken,
      protocolFeeBps,
    });
  }, [initialBuyWei, resolvedVirtualBnb, resolvedVirtualToken, protocolFeeBps]);

  const minInitialBuyTokens = minOutWithSlippage(estimatedTokens, SLIPPAGE_BPS);
  const totalValue = feeWei + initialBuyWei;
  const showReceivePreview = initialBuyWei > 0n && estimatedTokens > 0n && protocolFeeBps !== undefined;

  const maxInitialBuyWei = useMemo(() => {
    const overhead = feeWei + CREATE_GAS_BUFFER_BNB;
    if (!isConnected || bnbBalance === undefined) {
      return minInitialBuyWei;
    }
    if (bnbBalance.value <= overhead) {
      return minInitialBuyWei;
    }
    const afford = bnbBalance.value - overhead;
    return afford > minInitialBuyWei ? afford : minInitialBuyWei;
  }, [isConnected, bnbBalance, feeWei, minInitialBuyWei]);

  const canUseInitialBuySlider =
    isConnected &&
    !bnbBalanceLoading &&
    bnbBalance !== undefined &&
    maxInitialBuyWei > minInitialBuyWei;

  const launchRequiredWei = useMemo(() => {
    const buyWei =
      initialBuyWei >= minInitialBuyWei
        ? initialBuyWei
        : initialBuyWei > 0n
          ? initialBuyWei
          : minInitialBuyWei;
    return feeWei + buyWei + CREATE_GAS_BUFFER_BNB;
  }, [feeWei, initialBuyWei, minInitialBuyWei]);

  const bnbShortfallWei = useMemo(() => {
    if (!isConnected || bnbBalanceLoading || bnbBalance === undefined) return 0n;
    if (bnbBalance.value >= launchRequiredWei) return 0n;
    return launchRequiredWei - bnbBalance.value;
  }, [isConnected, bnbBalanceLoading, bnbBalance, launchRequiredWei]);

  const showInitialBuySlider = canUseInitialBuySlider;

  const initialBuySliderPct = useMemo(() => {
    if (maxInitialBuyWei <= minInitialBuyWei) return 100;
    const clamped =
      initialBuyWei < minInitialBuyWei
        ? minInitialBuyWei
        : initialBuyWei > maxInitialBuyWei
          ? maxInitialBuyWei
          : initialBuyWei;
    const range = maxInitialBuyWei - minInitialBuyWei;
    const scaled = Number(((clamped - minInitialBuyWei) * 10000n) / range) / 100;
    return Math.max(0, Math.min(100, scaled));
  }, [initialBuyWei, minInitialBuyWei, maxInitialBuyWei]);

  const initialBuySliderFillPct = initialBuySliderPct;
  const maxInitialBuyLabel = formatCampaignAmount(maxInitialBuyWei);

  function onInitialBuyChange(raw: string) {
    const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    setInitialBuyBnb(cleaned);
  }

  function applyInitialBuySliderPct(pct: number) {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (bnbBalance === undefined || maxInitialBuyWei <= minInitialBuyWei) {
      setInitialBuyBnb(minInitialBuyBnb);
      return;
    }

    const clamped = Math.max(0, Math.min(100, pct));
    const range = maxInitialBuyWei - minInitialBuyWei;
    const wei =
      clamped >= 100
        ? maxInitialBuyWei
        : minInitialBuyWei + (range * BigInt(clamped)) / 100n;
    setInitialBuyBnb(formatCampaignAmountInput(wei));
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateLogoFileClient(file);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }

    setError(null);
    setLogoFile(file);
    void fileToDataUrl(file)
      .then(setLogoPreview)
      .catch(() => setError("Could not read logo file"));
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
    if (!name.trim() || !symbol.trim()) {
      setError("Name and symbol are required.");
      return;
    }
    if (!logoFile) {
      setError("Token logo is required.");
      return;
    }
    if (initialBuyWei < minInitialBuyWei) {
      setError(`Initial buy is required (minimum ${minInitialBuyBnb} BNB).`);
      return;
    }
    if (minInitialBuyTokens === 0n) {
      setError("Initial buy is too small for the bonding curve.");
      return;
    }
    if (bnbBalance !== undefined && launchRequiredWei > bnbBalance.value) {
      setError(
        `Need ${formatCampaignAmount(launchRequiredWei - bnbBalance.value)} more BNB for create fee, initial buy, and gas.`
      );
      return;
    }

    try {
      writeContract({
        address: contracts.memeFactory,
        abi: memeFactoryAbi,
        functionName: "createMeme",
        args: [name.trim(), symbol.trim().toUpperCase(), "", minInitialBuyTokens],
        value: totalValue,
        chainId: pumpChain.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  const isBusy = isPending || isConfirming || launchFinalizing;

  function goToAirdropCreate() {
    if (!launchSuccess) return;
    const params = new URLSearchParams({
      token: launchSuccess.tokenAddress,
      symbol: launchSuccess.tokenSymbol,
      name: launchSuccess.tokenName,
    });
    router.push(`/airdrops/create?${params.toString()}`);
  }

  function goToTokenPage() {
    if (!launchSuccess) return;
    router.push(`/token/${launchSuccess.tokenAddress}`);
  }

  const submitLabel = !isConnected
    ? "Connect wallet"
    : wrongChain
      ? "Switch to BSC Testnet"
      : isBusy
        ? "Creating…"
        : "Create + Launch";

  const submitDisabled = isConnected && (wrongChain || isBusy || !contractsReady);

  const displayName = name.trim() || "Your coin";
  const displaySymbol = symbol.trim() || "TICKER";

  return (
    <form
      onSubmit={onSubmit}
      className="create-meme-form grid gap-3 pb-[calc(var(--mobile-bottom-nav-height)+5.25rem)] md:gap-4 md:pb-0 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] xl:items-start"
    >
      <div className="space-y-3 md:space-y-4">
        <section className="panel-surface p-3 md:p-5">
          <p className="section-label">Token profile</p>

          <div className="mt-3 flex flex-col gap-4 sm:mt-4 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex min-w-0 items-center gap-3 sm:w-[5.75rem] sm:shrink-0 sm:flex-col sm:items-center sm:gap-2">
              <TokenAvatar
                address="0x0000000000000000000000000000000000000000"
                symbol={displaySymbol}
                previewUrl={logoPreview}
                size={56}
                className="sm:hidden"
              />
              <TokenAvatar
                address="0x0000000000000000000000000000000000000000"
                symbol={displaySymbol}
                previewUrl={logoPreview}
                size={72}
                className="hidden sm:flex"
              />
              <label
                htmlFor="logo"
                className="secondary-button w-fit cursor-pointer px-3 py-2 text-caption sm:w-full sm:justify-center sm:px-2"
              >
                Upload logo
              </label>
              <input
                id="logo"
                type="file"
                accept={LOGO_ACCEPT}
                onChange={onLogoChange}
                className="hidden"
              />
              <p className="field-hint min-w-0 flex-1 sm:w-full sm:flex-none sm:text-center">
                PNG, JPEG, WebP or GIF · max 2 MB
              </p>
            </div>

            <div className="min-w-0 flex-1 space-y-3 md:space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="name">
                    Coin name <span className="text-pump-accent">*</span>
                  </label>
                  <input
                    id="name"
                    maxLength={64}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Moon Pepe"
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="symbol">
                    Ticker <span className="text-pump-accent">*</span>
                  </label>
                  <input
                    id="symbol"
                    maxLength={16}
                    required
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="MPEPE"
                    className="field-input"
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="description">
                  Description
                </label>
                <textarea
                  id="description"
                  maxLength={2000}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this coin about?"
                  className="field-textarea min-h-[5.5rem] md:min-h-[6.5rem]"
                />
                <p className="mt-1 field-hint">{description.length}/2000</p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel-surface p-3 md:p-5">
          <p className="section-label">Initial issuance</p>

          <div className="mt-3 md:mt-4">
            <label className="field-label" htmlFor="initialBuy">
              Initial buy <span className="text-pump-accent">*</span>
            </label>
            <div className="relative w-full sm:max-w-xs">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <BnbLogo size={20} />
              </div>
              <input
                id="initialBuy"
                inputMode="decimal"
                required
                value={initialBuyBnb}
                onChange={(e) => onInitialBuyChange(e.target.value)}
                placeholder={minInitialBuyBnb}
                className="field-input financial-value w-full pl-11 pr-14"
              />
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <span className="text-caption font-medium text-pump-muted">BNB</span>
              </div>
            </div>

            {showInitialBuySlider ? (
              <div className="mt-3 w-full sm:max-w-sm">
                <div className="flex items-center gap-2.5">
                  <div className="relative min-w-0 flex-1 pt-1">
                    <div
                      className="pointer-events-none absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-pump-border/25"
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-pump-accent/70 transition-[width] duration-75"
                      style={{ width: `${initialBuySliderFillPct}%` }}
                      aria-hidden
                    />
                    <input
                      id="initialBuySlider"
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={initialBuySliderPct}
                      onChange={(e) => applyInitialBuySliderPct(Number(e.target.value))}
                      className="trade-amount-slider relative z-[1] w-full"
                      aria-label="Initial buy amount slider"
                      aria-valuetext={
                        initialBuySliderPct >= 100
                          ? `Max (${maxInitialBuyLabel} BNB)`
                          : `${initialBuySliderPct}% between ${minInitialBuyBnb} and ${maxInitialBuyLabel} BNB`
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyInitialBuySliderPct(100)}
                    className="chip-button shrink-0 px-2.5 py-1.5 text-caption"
                  >
                    Max
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-caption text-pump-muted">
                  <BnbAmountLabel amount={minInitialBuyBnb} />
                  <BnbAmountLabel amount={maxInitialBuyLabel} />
                </div>
              </div>
            ) : null}

            <p className="mt-2 field-hint">
              Minimum {minInitialBuyBnb} BNB. A larger initial buy launches your coin at a higher
              starting price.
              {!isConnected ? (
                <span className="mt-1 block">Connect wallet to use your BNB balance on the slider.</span>
              ) : bnbBalanceLoading ? (
                <span className="mt-1 block text-pump-muted">Loading wallet balance…</span>
              ) : null}
            </p>
            {bnbShortfallWei > 0n && isConnected && !bnbBalanceLoading ? (
              <p className="mt-2 rounded-md border border-pump-warning/30 bg-pump-warning/10 px-2.5 py-2 text-caption leading-snug text-pump-warning">
                Need{" "}
                <BnbAmountDisplay
                  amount={formatCampaignAmount(bnbShortfallWei)}
                  logoSize={14}
                  amountClassName="financial-value font-semibold tabular-nums text-pump-warning"
                  symbolClassName="text-caption font-medium text-pump-warning/90"
                />{" "}
                more for create fee, initial buy, and gas.
              </p>
            ) : null}
          </div>
        </section>

        <section className="panel-surface p-3 md:hidden">
          <p className="section-label">Issuance summary</p>
          <IssuanceSummaryRows
            variant="mobile"
            feeWei={feeWei}
            initialBuyWei={initialBuyWei}
            showReceivePreview={showReceivePreview}
            estimatedTokens={estimatedTokens}
            displaySymbol={displaySymbol}
            logoPreview={logoPreview}
            totalValue={totalValue}
          />
          {error ? <p className="notice-error mt-3 text-caption leading-snug">{error}</p> : null}
          {txHash ? (
            <p className="mt-3 field-hint break-all">
              Tx: {txHash}
              {isConfirming
                ? " — confirming…"
                : uploadStatus
                  ? ` — ${uploadStatus}`
                  : launchSuccess
                    ? " — confirmed"
                    : null}
            </p>
          ) : null}
        </section>

        <section className="panel-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setSocialOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-pump-surface/40"
            aria-expanded={socialOpen}
          >
            <span className="section-label">Social links (optional)</span>
            <span className="text-caption text-pump-muted">{socialOpen ? "−" : "+"}</span>
          </button>
          {socialOpen ? (
            <div className="space-y-4 border-t border-pump-border/15 px-4 pb-4 pt-4">
              <div>
                <label className="field-label" htmlFor="twitter">X (Twitter)</label>
                <input
                  id="twitter"
                  type="url"
                  maxLength={256}
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="https://x.com/yourcoin"
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="website">Website</label>
                <input
                  id="website"
                  type="url"
                  maxLength={256}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourcoin.com"
                  className="field-input"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="telegram">Telegram</label>
                  <input
                    id="telegram"
                    type="url"
                    maxLength={256}
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="https://t.me/yourcoin"
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="discord">Discord</label>
                  <input
                    id="discord"
                    type="url"
                    maxLength={256}
                    value={discord}
                    onChange={(e) => setDiscord(e.target.value)}
                    placeholder="https://discord.gg/yourcoin"
                    className="field-input"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <aside className="hidden space-y-4 md:block xl:sticky xl:top-[4.75rem]">
        <section className="panel-surface overflow-hidden p-4 md:p-5">
          <p className="section-label">Live preview</p>
          <div className="mt-4 flex items-center gap-3">
            <TokenAvatar
              address="0x0000000000000000000000000000000000000000"
              symbol={displaySymbol}
              previewUrl={logoPreview}
              size={56}
            />
            <div className="min-w-0">
              <p className="card-title truncate">{displayName}</p>
              <p className="financial-value text-caption text-pump-muted">${displaySymbol}</p>
            </div>
          </div>
          {description.trim() ? (
            <p className="mt-3 text-body-sm leading-relaxed text-pump-muted line-clamp-4">
              {description.trim()}
            </p>
          ) : (
            <p className="mt-3 field-hint">Description will appear on the token page.</p>
          )}
        </section>

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Issuance summary</p>
          <IssuanceSummaryRows
            feeWei={feeWei}
            initialBuyWei={initialBuyWei}
            showReceivePreview={showReceivePreview}
            estimatedTokens={estimatedTokens}
            displaySymbol={displaySymbol}
            logoPreview={logoPreview}
            totalValue={totalValue}
          />

          {error ? <p className="notice-error mt-4">{error}</p> : null}

          {txHash ? (
            <p className="mt-4 field-hint break-all">
              Tx: {txHash}
              {isConfirming
                ? " — confirming…"
                : uploadStatus
                  ? ` — ${uploadStatus}`
                  : launchSuccess
                    ? " — confirmed"
                    : null}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitDisabled}
            className="primary-button mt-4 w-full"
          >
            {submitLabel}
          </button>

          {wrongChain ? (
            <p className="mt-3 field-hint text-pump-warning">Switch to BSC Testnet to launch.</p>
          ) : null}
        </section>
      </aside>
      <TokenLaunchSuccessModal
        open={launchSuccess !== null}
        tokenAddress={launchSuccess?.tokenAddress ?? ""}
        tokenName={launchSuccess?.tokenName ?? ""}
        tokenSymbol={launchSuccess?.tokenSymbol ?? ""}
        logoPreviewUrl={launchSuccess?.logoPreviewUrl}
        onCreateAirdrop={goToAirdropCreate}
        onViewToken={goToTokenPage}
        onDismiss={() => setLaunchSuccess(null)}
      />

      <div className="create-mobile-dock md:hidden">
        {error ? <p className="notice-error mb-2 text-caption leading-snug">{error}</p> : null}
        <div className="flex items-center gap-3">
          <TokenAvatar
            address="0x0000000000000000000000000000000000000000"
            symbol={displaySymbol}
            previewUrl={logoPreview}
            size={36}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-caption font-semibold text-pump-text">{displayName}</p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="text-caption text-pump-muted">Total</span>
              <BnbAmountDisplay
                amount={formatCampaignAmount(totalValue)}
                logoSize={14}
                amountClassName="financial-value text-caption font-semibold tabular-nums text-pump-text"
                symbolClassName="text-caption text-pump-muted"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitDisabled}
            className="primary-button min-h-11 shrink-0 px-4 text-caption"
          >
            {isBusy ? "Creating…" : !isConnected ? "Connect" : wrongChain ? "Switch net" : "Launch"}
          </button>
        </div>
      </div>
    </form>
  );
}
