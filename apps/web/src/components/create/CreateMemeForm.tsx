"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther, parseEventLogs } from "viem";
import { useOpenConnectModal } from "@/hooks/useOpenConnectModal";
import { usePumpSession } from "@/hooks/usePumpSession";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import {
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useKernelWriteContract } from "@/hooks/useKernelWriteContract";
import { formatTradeError } from "@/lib/trade-errors";
import { contracts, NATIVE_SYMBOL, pumpChain } from "@/config/chain";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import {
  bondingCurveManagerAbi,
  DEFAULT_VIRTUAL_BNB_RESERVE,
  DEFAULT_VIRTUAL_TOKEN_RESERVE,
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
import { BnbAmountDisplay } from "@/components/token/AssetAmountDisplay";
import { TokenLaunchSuccessModal } from "@/components/create/TokenLaunchSuccessModal";
import {
  createEmptyTokenSocialLinksState,
  TokenSocialLinksEditor,
  tokenSocialLinksToPayload,
  TOKEN_SOCIAL_LINK_FIELDS,
  type TokenSocialLinkKey,
  type TokenSocialLinksState,
} from "@/components/create/TokenSocialLinksEditor";
import { FieldErrorIcon, FieldErrorMessage } from "@/components/ui/FieldError";
import { FormExecutionStatus } from "@/components/ui/FormExecutionStatus";
import { InfoTip } from "@/components/ui/InfoTip";
import { formatCampaignAmount } from "@/lib/airdrop-board-format";
import { useCreateGasReserve } from "@/hooks/useCreateGasReserve";

type LaunchSuccess = {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  logoPreviewUrl?: string;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read logo file"));
    reader.readAsDataURL(file);
  });
}

export function CreateMemeForm() {
  const router = useRouter();
  const handledReceiptRef = useRef<string | null>(null);
  const logoFileRef = useRef<File | null>(null);
  const logoPreviewRef = useRef<string | null>(null);
  const descriptionRef = useRef("");
  const socialLinksRef = useRef<ReturnType<typeof tokenSocialLinksToPayload>>({});
  const { openConnectModal } = useOpenConnectModal();
  const { openFundChoice } = useWalletFunding();
  const { signedIn, scwAddress, chain } = usePumpSession();
  const address = scwAddress;
  const isConnected = signedIn;
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [initialBuyBnb, setInitialBuyBnb] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchFinalizing, setLaunchFinalizing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<LaunchSuccess | null>(null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialLinks, setSocialLinks] = useState<TokenSocialLinksState>(createEmptyTokenSocialLinksState);

  logoFileRef.current = logoFile;
  logoPreviewRef.current = logoPreview;
  descriptionRef.current = description;
  socialLinksRef.current = tokenSocialLinksToPayload(socialLinks);

  const { data: minInitialBuyWeiOnChain, isFetched: minInitialBuyFetched } = useReadContract({
    address: contracts.memeFactory,
    abi: memeFactoryAbi,
    functionName: "minInitialBuyWei",
    chainId: pumpChain.id,
  });

  const minInitialBuyWei = minInitialBuyWeiOnChain ?? 0n;

  const minInitialBuyBnb = useMemo(
    () => (minInitialBuyWei > 0n ? formatCampaignAmount(minInitialBuyWei) : "0"),
    [minInitialBuyWei]
  );

  const contractsReady = Boolean(contracts.memeFactory && contracts.bondingCurveManager);

  const { data: createFee } = useReadContract({
    address: contracts.memeFactory,
    abi: memeFactoryAbi,
    functionName: "createFee",
    chainId: pumpChain.id,
  });

  const { data: factoryOwner } = useReadContract({
    address: contracts.memeFactory,
    abi: memeFactoryAbi,
    functionName: "owner",
    chainId: pumpChain.id,
  });

  const { data: isCreateFeeExempt } = useReadContract({
    address: contracts.memeFactory,
    abi: memeFactoryAbi,
    functionName: "feeExempt",
    args: address ? [address] : undefined,
    chainId: pumpChain.id,
    query: { enabled: Boolean(address) },
  });

  const { data: virtualBnbReserveOnChain } = useReadContract({
    address: contracts.memeFactory,
    abi: memeFactoryAbi,
    functionName: "defaultVirtualEthReserve",
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

  const { writeContract, data: txHash, isPending, reset, error: writeError } =
    useKernelWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (!writeError) return;
    setError(formatTradeError(writeError));
  }, [writeError]);

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
  const feeWei = useMemo(() => {
    const base = createFee ?? 0n;
    if (!address) return base;
    const lower = address.toLowerCase();
    if (factoryOwner && lower === factoryOwner.toLowerCase()) return 0n;
    if (isCreateFeeExempt) return 0n;
    return base;
  }, [createFee, address, factoryOwner, isCreateFeeExempt]);

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

  const minInitialBuyTokens =
    initialBuyWei > 0n ? minOutWithSlippage(estimatedTokens, SLIPPAGE_BPS) : 0n;
  const totalValue = feeWei + initialBuyWei;

  const { gasReserveWei, isLoading: gasReserveLoading } = useCreateGasReserve({
    kind: "meme",
    enabled: isConnected && Boolean(address) && contractsReady,
    address,
    name,
    symbol,
    minTokenOut: minInitialBuyTokens,
    valueWei: totalValue,
  });
  const gasWei = gasReserveWei ?? 0n;

  const launchRequiredWei = useMemo(
    () => feeWei + initialBuyWei + gasWei,
    [feeWei, initialBuyWei, gasWei]
  );

  const bnbShortfallWei = useMemo(() => {
    if (!isConnected || bnbBalanceLoading || gasReserveLoading || bnbBalance === undefined) {
      return 0n;
    }
    if (bnbBalance.value >= launchRequiredWei) return 0n;
    return launchRequiredWei - bnbBalance.value;
  }, [isConnected, bnbBalanceLoading, gasReserveLoading, bnbBalance, launchRequiredWei]);

  const needsBnbFunding =
    isConnected && !bnbBalanceLoading && !gasReserveLoading && bnbShortfallWei > 0n;

  function openLaunchFundingModal() {
    openFundChoice({
      title: `Add ${NATIVE_SYMBOL} to launch`,
      message: `You need ${formatCampaignAmount(bnbShortfallWei)} more ${NATIVE_SYMBOL} for the create fee${initialBuyWei > 0n ? ", initial buy," : ""} and gas.`,
    });
  }

  function onInitialBuyChange(raw: string) {
    const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    setInitialBuyBnb(cleaned);
  }

  function updateSocialLink(key: TokenSocialLinkKey, value: string) {
    setSocialLinks((prev) => ({
      ...prev,
      [key]: { enabled: value.trim().length > 0, value },
    }));
  }

  function hasSocialFieldError(): boolean {
    for (const field of TOKEN_SOCIAL_LINK_FIELDS) {
      const trimmed = socialLinks[field.key].value.trim();
      if (!trimmed) continue;
      if (!/^https?:\/\//i.test(trimmed)) return true;
    }
    return false;
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

  async function executeLaunch() {
    setError(null);
    reset();

    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }
    if (wrongChain) {
      setError("Switch to Base Sepolia.");
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
    if (minInitialBuyFetched && initialBuyWei === 0n && minInitialBuyWei > 0n) {
      setError(`Minimum initial buy is ${minInitialBuyBnb} ${NATIVE_SYMBOL}.`);
      return;
    }
    if (initialBuyWei > 0n) {
      if (minInitialBuyFetched && minInitialBuyWei > 0n && initialBuyWei < minInitialBuyWei) {
        setError(`Minimum initial buy is ${minInitialBuyBnb} ${NATIVE_SYMBOL}.`);
        return;
      }
      if (minInitialBuyTokens === 0n) {
        setError("Initial buy is too small for the bonding curve.");
        return;
      }
    }
    if (needsBnbFunding) {
      openLaunchFundingModal();
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleLaunch();
  }

  const fieldErrors = useMemo(() => {
    if (!showFieldErrors) {
      return {
        name: null as string | null,
        symbol: null as string | null,
        logo: null as string | null,
        initialBuy: null as string | null,
      };
    }

    const next = {
      name: null as string | null,
      symbol: null as string | null,
      logo: null as string | null,
      initialBuy: null as string | null,
    };

    if (!name.trim()) next.name = "Enter a coin name.";
    if (!symbol.trim()) next.symbol = "Enter a ticker.";
    if (!logoFile) next.logo = "Upload a token logo.";

    if (minInitialBuyFetched && initialBuyWei === 0n && minInitialBuyWei > 0n) {
      next.initialBuy = `Minimum initial buy is ${minInitialBuyBnb} ${NATIVE_SYMBOL}.`;
    } else if (initialBuyWei > 0n) {
      if (minInitialBuyFetched && minInitialBuyWei > 0n && initialBuyWei < minInitialBuyWei) {
        next.initialBuy = `Minimum initial buy is ${minInitialBuyBnb} ${NATIVE_SYMBOL}.`;
      } else if (minInitialBuyTokens === 0n) {
        next.initialBuy = "Initial buy is too small for the bonding curve.";
      }
    }

    return next;
  }, [
    showFieldErrors,
    name,
    symbol,
    logoFile,
    initialBuyWei,
    minInitialBuyFetched,
    minInitialBuyWei,
    minInitialBuyBnb,
    minInitialBuyTokens,
  ]);

  const displayError = error ?? (writeError ? formatTradeError(writeError) : null);

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

  const formSubmitPhase =
    isPending && !isConfirming && !launchFinalizing
      ? "submitting"
      : isConfirming || launchFinalizing
        ? "confirming"
        : null;
  const formSubmitPending = formSubmitPhase !== null;
  const formStatusDetail =
    formSubmitPhase === "submitting"
      ? "Signing and submitting your launch transaction"
      : formSubmitPhase === "confirming"
        ? launchFinalizing
          ? "Finalizing token metadata on-chain"
          : "Awaiting on-chain confirmation"
        : null;

  const submitLabel = !isConnected
    ? "Connect wallet"
    : wrongChain
      ? "Switch to Base Sepolia"
      : needsBnbFunding
        ? `Add ${NATIVE_SYMBOL} to launch`
        : formSubmitPending
          ? formSubmitPhase === "submitting"
            ? "Processing"
            : "Confirming"
          : "Create token";

  const displaySymbol = symbol.trim() || "TICKER";
  const submitDisabled =
    isBusy || (isConnected && (wrongChain || !contractsReady || !minInitialBuyFetched));

  function handleLaunch() {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (wrongChain || !contractsReady) return;

    const hasRequiredFieldError = !name.trim() || !symbol.trim() || !logoFile;
    const hasBuyFieldError =
      minInitialBuyFetched &&
      ((initialBuyWei === 0n && minInitialBuyWei > 0n) ||
        (initialBuyWei > 0n &&
          ((minInitialBuyWei > 0n && initialBuyWei < minInitialBuyWei) || minInitialBuyTokens === 0n)));

    if (hasRequiredFieldError || hasBuyFieldError || hasSocialFieldError()) {
      setShowFieldErrors(true);
      if (hasSocialFieldError()) setSocialOpen(true);
      return;
    }

    setShowFieldErrors(false);

    if (needsBnbFunding) {
      openLaunchFundingModal();
      return;
    }

    void executeLaunch();
  }

  const submitButton = (
    <button
      type="submit"
      disabled={submitDisabled}
      aria-busy={formSubmitPending}
      className={`primary-button min-w-0 flex-1 sm:flex-none sm:min-w-[9.5rem] sm:px-8${formSubmitPending ? " form-submit-button--loading" : ""}`}
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
  );

  const statusBlock = (
    <>
      {formSubmitPending && formStatusDetail ? (
        <FormExecutionStatus phase={formSubmitPhase} detail={formStatusDetail} />
      ) : null}
      {displayError ? (
        <div className="notice-error px-3 py-2 text-caption" role="alert">
          {displayError}
        </div>
      ) : null}
      {txHash ? (
        <p className="field-hint break-all">
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
      {wrongChain ? (
        <p className="field-hint text-pump-warning">Switch to Base Sepolia to launch.</p>
      ) : null}
      {needsBnbFunding && isConnected && !bnbBalanceLoading ? (
        <div className="rounded-md border border-pump-warning/30 bg-pump-warning/10 px-2.5 py-2">
          <p className="text-caption leading-snug text-pump-warning">
            Need{" "}
            <BnbAmountDisplay
              amount={formatCampaignAmount(bnbShortfallWei)}
              logoSize={14}
              amountClassName="financial-value font-semibold tabular-nums text-pump-warning"
              symbolClassName="text-caption font-medium text-pump-warning/90"
            />{" "}
            more for launch.
          </p>
          <button
            type="button"
            onClick={openLaunchFundingModal}
            className="secondary-button mt-2 w-full py-2 text-caption"
          >
            Add funds
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <div className="airdrops-page airdrop-create-page airdrop-create-page--token">
        <div className="airdrop-create-hub">
          <div className="airdrop-create-body">
            <form onSubmit={onSubmit} className="airdrop-create-form">
              <section className="airdrop-create-step-panel">
                <div className="airdrop-create-step-panel__body">
                  <div className="token-create-sheet">
                    <div className="token-create-stack">
                        <div
                          className={`token-create-identity__logo${fieldErrors.logo ? " field-group--error" : ""}`}
                        >
                          <TokenAvatar
                            address="0x0000000000000000000000000000000000000000"
                            symbol={displaySymbol}
                            previewUrl={logoPreview}
                            size={64}
                          />
                          <label
                            htmlFor="logo"
                            className="secondary-button cursor-pointer px-3 py-1.5 text-caption"
                          >
                            Upload <span className="text-pump-accent">*</span>
                          </label>
                          <input
                            id="logo"
                            type="file"
                            accept={LOGO_ACCEPT}
                            onChange={onLogoChange}
                            className="hidden"
                            aria-invalid={fieldErrors.logo ? true : undefined}
                          />
                          <p className="field-hint text-center">Max 2 MB</p>
                          <FieldErrorMessage>{fieldErrors.logo}</FieldErrorMessage>
                        </div>

                        <div className="token-create-field-grid min-w-0">
                          <div
                            className={`token-create-field-cell${fieldErrors.name ? " field-group--error" : ""}`}
                          >
                            <label className="field-label" htmlFor="name">
                              Coin name <span className="text-pump-accent">*</span>
                            </label>
                            <div className={`field-control${fieldErrors.name ? " field-control--error" : ""}`}>
                              <input
                                id="name"
                                maxLength={64}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Moon Pepe"
                                className={`field-input${fieldErrors.name ? " field-input--error" : ""}`}
                                aria-invalid={fieldErrors.name ? true : undefined}
                              />
                              {fieldErrors.name ? <FieldErrorIcon /> : null}
                            </div>
                            <FieldErrorMessage>{fieldErrors.name}</FieldErrorMessage>
                          </div>

                          <div
                            className={`token-create-field-cell${fieldErrors.symbol ? " field-group--error" : ""}`}
                          >
                            <label className="field-label" htmlFor="symbol">
                              Ticker <span className="text-pump-accent">*</span>
                            </label>
                            <div className={`field-control${fieldErrors.symbol ? " field-control--error" : ""}`}>
                              <input
                                id="symbol"
                                maxLength={16}
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                placeholder="MPEPE"
                                className={`field-input${fieldErrors.symbol ? " field-input--error" : ""}`}
                                aria-invalid={fieldErrors.symbol ? true : undefined}
                              />
                              {fieldErrors.symbol ? <FieldErrorIcon /> : null}
                            </div>
                            <FieldErrorMessage>{fieldErrors.symbol}</FieldErrorMessage>
                          </div>
                        </div>

                        <div className="token-create-field-grid min-w-0">
                          <div className="token-create-field-cell">
                            <label className="field-label" htmlFor="description">
                              Description{" "}
                              <span className="font-normal text-pump-muted">(optional)</span>
                            </label>
                            <textarea
                              id="description"
                              maxLength={2000}
                              rows={3}
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="What is this coin about?"
                              className="field-textarea min-h-[4.5rem]"
                            />
                            <p className="field-hint">{description.length}/2000</p>
                          </div>

                          <div
                            className={`token-create-field-cell${fieldErrors.initialBuy ? " field-group--error" : ""}`}
                          >
                            <label className="field-label inline-flex items-center gap-1" htmlFor="initialBuy">
                              Initial buy{" "}
                              {minInitialBuyFetched && minInitialBuyWei > 0n ? (
                                <span className="text-pump-accent">*</span>
                              ) : (
                                <span className="font-normal text-pump-muted">(optional)</span>
                              )}
                              <InfoTip label="About initial buy">
                                {minInitialBuyFetched && minInitialBuyWei > 0n ? (
                                  <>
                                    On-chain minimum is {minInitialBuyBnb} {NATIVE_SYMBOL}. You must buy at least
                                    this much at launch (in addition to the create fee).
                                  </>
                                ) : (
                                  <>Seed liquidity at launch. Leave blank to pay only the create fee.</>
                                )}
                              </InfoTip>
                            </label>
                            <div
                              className={`relative field-control${fieldErrors.initialBuy ? " field-control--error" : ""}`}
                            >
                              <div className="pointer-events-none absolute inset-y-0 left-3 z-[1] flex items-center">
                                <BnbLogo size={20} />
                              </div>
                              <input
                                id="initialBuy"
                                inputMode="decimal"
                                value={initialBuyBnb}
                                onChange={(e) => onInitialBuyChange(e.target.value)}
                                placeholder="0"
                                className={`field-input financial-value w-full pl-11 pr-14${fieldErrors.initialBuy ? " field-input--error" : ""}`}
                                aria-invalid={fieldErrors.initialBuy ? true : undefined}
                              />
                              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                                <span className="text-caption font-medium text-pump-muted">{NATIVE_SYMBOL}</span>
                              </div>
                              {fieldErrors.initialBuy ? <FieldErrorIcon /> : null}
                            </div>
                            <FieldErrorMessage>{fieldErrors.initialBuy}</FieldErrorMessage>
                          </div>
                        </div>

                        <TokenSocialLinksEditor
                          links={socialLinks}
                          open={socialOpen}
                          onOpenChange={setSocialOpen}
                          onChange={updateSocialLink}
                          showFieldErrors={showFieldErrors}
                        />
                      </div>

                    {statusBlock}
                  </div>
                </div>
              </section>

              <div className="airdrop-create-form__actions">
                <div className="token-create-actions__total min-w-0 flex-1">
                  <p className="text-caption text-pump-muted">Total due</p>
                  <BnbAmountDisplay
                    amount={formatCampaignAmount(launchRequiredWei)}
                    logoSize={16}
                    amountClassName="financial-value text-body-sm font-semibold tabular-nums text-pump-text"
                    symbolClassName="text-caption text-pump-muted"
                  />
                </div>
                {submitButton}
              </div>
            </form>
          </div>
        </div>
      </div>

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
    </>
  );
}
