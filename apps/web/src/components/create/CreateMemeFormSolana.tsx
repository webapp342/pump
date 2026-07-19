"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { isSolanaChainFamily } from "@/config/chain-family";
import { NATIVE_SYMBOL, PUMP_FEEL_DEFAULTS } from "@/config/solana";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { NativeLogo } from "@/components/token/NativeLogo";
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
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { useWalletFunding } from "@/components/wallet/WalletFundingProvider";
import { formatCampaignAmount } from "@/lib/airdrop-board-format";
import {
  lamportsToWei,
  tokenRawToWei,
  weiToTokenRaw,
} from "@/lib/solana/amount-scale";
import {
  minOutWithSlippage,
  quoteFreshBuy,
  SLIPPAGE_BPS,
} from "@/lib/bonding-curve";
import { MISSION_KEYS, pushOptimisticActivity } from "@/lib/optimistic-activity";
import { readStoredReferrer } from "@/lib/referral-storage";
import { saveTokenMetadata } from "@/lib/save-token-metadata";
import { normalizeSocialLinks } from "@/lib/token-social";
import { formatTradeError } from "@/lib/trade-errors";
import {
  LOGO_ACCEPT,
  uploadTokenLogo,
  validateLogoFileClient,
} from "@/lib/upload-token-logo";
import {
  getSolanaConnection,
  solToLamports,
} from "@/lib/solana/transfer";
import {
  silentCreateMeme,
  estimateSolanaCreateCostLamports,
} from "@/lib/solana/silent-create";
import { decodeGlobalConfig, pdaGlobal } from "@/lib/solana/launchpad-pdas";

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

function parseInitialBuySol(raw: string): bigint {
  const trimmed = raw.replace(/,/g, ".").replace(/[^\d.]/g, "").trim();
  if (!trimmed) return 0n;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return solToLamports(n);
}

function SolAmountDisplay({
  lamports,
  logoSize = 16,
  amountClassName = "financial-value text-body-sm font-semibold tabular-nums text-pump-text",
  symbolClassName = "text-caption text-pump-muted",
}: {
  lamports: bigint;
  logoSize?: number;
  amountClassName?: string;
  symbolClassName?: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center justify-end gap-1.5">
      <span className={`shrink-0 ${amountClassName}`}>
        {formatCampaignAmount(lamportsToWei(lamports))}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1">
        <NativeLogo size={logoSize} />
        <span className={symbolClassName}>{NATIVE_SYMBOL}</span>
      </span>
    </span>
  );
}

export function CreateMemeFormSolana() {
  const router = useRouter();
  const logoFileRef = useRef<File | null>(null);
  const logoPreviewRef = useRef<string | null>(null);
  const descriptionRef = useRef("");
  const socialLinksRef = useRef<ReturnType<typeof tokenSocialLinksToPayload>>({});

  const {
    ready,
    authenticated,
    solanaAddress,
    solanaSessionReady,
    login,
    ensureSolanaSession,
  } = usePumpWallet();
  const { openFundChoice } = useWalletFunding();

  const isConnected = Boolean(authenticated && solanaAddress && solanaSessionReady);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [initialBuySol, setInitialBuySol] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchFinalizing, setLaunchFinalizing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<LaunchSuccess | null>(null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialLinks, setSocialLinks] = useState<TokenSocialLinksState>(
    createEmptyTokenSocialLinksState
  );
  const [submitting, setSubmitting] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [solBalanceLamports, setSolBalanceLamports] = useState<bigint | undefined>();
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [createCostLamports, setCreateCostLamports] = useState<bigint | undefined>();
  const [protocolFeeBps, setProtocolFeeBps] = useState<bigint>(
    BigInt(PUMP_FEEL_DEFAULTS.protocolFeeBps)
  );

  logoFileRef.current = logoFile;
  logoPreviewRef.current = logoPreview;
  descriptionRef.current = description;
  socialLinksRef.current = tokenSocialLinksToPayload(socialLinks);

  const refreshBalance = useCallback(async () => {
    if (!solanaAddress) {
      setSolBalanceLamports(undefined);
      return;
    }
    setBalanceLoading(true);
    try {
      const conn = getSolanaConnection();
      const lamports = await conn.getBalance(new PublicKey(solanaAddress), "confirmed");
      setSolBalanceLamports(BigInt(lamports));
    } catch {
      setSolBalanceLamports(undefined);
    } finally {
      setBalanceLoading(false);
    }
  }, [solanaAddress]);

  const initialBuyLamports = useMemo(() => parseInitialBuySol(initialBuySol), [initialBuySol]);

  useEffect(() => {
    if (!ready || !solanaAddress) return;
    void refreshBalance();
    const id = window.setInterval(() => void refreshBalance(), 8_000);
    return () => window.clearInterval(id);
  }, [ready, solanaAddress, refreshBalance]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const conn = getSolanaConnection();
        const [globalPda] = pdaGlobal();
        const globalInfo = await conn.getAccountInfo(globalPda, "confirmed");
        if (globalInfo?.data && !cancelled) {
          const global = decodeGlobalConfig(globalInfo.data);
          setProtocolFeeBps(global.protocolFeeBps);
        }
        const cost = await estimateSolanaCreateCostLamports({
          connection: conn,
          initialBuyLamports,
          feePayer: solanaAddress ?? undefined,
          name: name.trim() || undefined,
          symbol: symbol.trim() || undefined,
        });
        if (!cancelled) setCreateCostLamports(cost);
      } catch {
        if (!cancelled) setCreateCostLamports(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialBuyLamports, solanaAddress, name, symbol]);

  const estimatedTokensWei = useMemo(() => {
    if (initialBuyLamports <= 0n) return 0n;
    return quoteFreshBuy({
      zugIn: lamportsToWei(initialBuyLamports),
      virtualZugReserve: lamportsToWei(PUMP_FEEL_DEFAULTS.virtualSolLamports),
      virtualTokenReserve: tokenRawToWei(PUMP_FEEL_DEFAULTS.totalSupply),
      protocolFeeBps,
    });
  }, [initialBuyLamports, protocolFeeBps]);

  const minTokenOut = useMemo(() => {
    if (initialBuyLamports <= 0n) return 0n;
    return weiToTokenRaw(minOutWithSlippage(estimatedTokensWei, SLIPPAGE_BPS));
  }, [initialBuyLamports, estimatedTokensWei]);

  const launchRequiredLamports = useMemo(
    () => createCostLamports ?? 0n,
    [createCostLamports]
  );

  const solShortfallLamports = useMemo(() => {
    if (!isConnected || balanceLoading || solBalanceLamports === undefined) return 0n;
    if (solBalanceLamports >= launchRequiredLamports) return 0n;
    return launchRequiredLamports - solBalanceLamports;
  }, [isConnected, balanceLoading, solBalanceLamports, launchRequiredLamports]);

  const needsSolFunding =
    isConnected && !balanceLoading && solShortfallLamports > 0n;

  function openLaunchFundingModal() {
    openFundChoice({
      title: `Add ${NATIVE_SYMBOL} to launch`,
      message: `You need ${formatCampaignAmount(lamportsToWei(solShortfallLamports))} more ${NATIVE_SYMBOL} for launch${initialBuyLamports > 0n ? " and initial buy" : ""}.`,
      initialView: "deposit",
    });
  }

  function onInitialBuyChange(raw: string) {
    const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    setInitialBuySol(cleaned);
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
    setTxSignature(null);

    if (!authenticated) {
      login();
      return;
    }

    if (!isConnected) {
      try {
        await ensureSolanaSession();
      } catch (err) {
        setError(formatTradeError(err));
        return;
      }
    }

    const trimmedName = name.trim();
    const trimmedSymbol = symbol.trim().toUpperCase();
    if (!trimmedName || !trimmedSymbol) {
      setError("Name and symbol are required.");
      return;
    }
    if (!logoFile) {
      setError("Token logo is required.");
      return;
    }
    if (initialBuyLamports > 0n && minTokenOut === 0n) {
      setError("Initial buy is too small for the bonding curve.");
      return;
    }
    if (needsSolFunding) {
      openLaunchFundingModal();
      return;
    }

    const file = logoFile;
    const savedDescription = descriptionRef.current.trim();
    const savedSocial = normalizeSocialLinks(socialLinksRef.current);
    const referrerAddress = readStoredReferrer();

    setSubmitting(true);
    try {
      const { signature, mintAddress, traderAddress } = await silentCreateMeme({
        name: trimmedName,
        symbol: trimmedSymbol,
        initialBuyLamports,
        minTokenOut: initialBuyLamports > 0n ? minTokenOut : undefined,
        referrerAddress,
      });
      setTxSignature(signature);

      setLaunchFinalizing(true);
      setUploadStatus("Saving profile…");
      try {
        await saveTokenMetadata({
          tokenAddress: mintAddress,
          txHash: signature,
          name: trimmedName,
          symbol: trimmedSymbol,
          description: savedDescription || undefined,
          socialLinks: savedSocial,
        });
      } catch (metaErr) {
        console.warn("[create] metadata save failed:", metaErr);
      }

      setUploadStatus("Uploading logo…");
      try {
        await uploadTokenLogo({
          tokenAddress: mintAddress,
          txHash: signature,
          file,
        });
        setUploadStatus("Logo uploaded");
      } catch (uploadErr) {
        console.warn("[create] logo upload failed:", uploadErr);
        setUploadStatus("Logo upload failed — you can retry from token page later");
      }

      let logoPreviewUrl: string | undefined;
      try {
        const preview = logoPreviewRef.current;
        logoPreviewUrl = preview?.startsWith("data:") ? preview : await fileToDataUrl(file);
      } catch {
        logoPreviewUrl = logoPreviewRef.current ?? undefined;
      }

      pushOptimisticActivity({
        txHash: signature,
        type: "create",
        at: new Date().toISOString(),
        tokenAddress: mintAddress,
        tokenName: trimmedName,
        tokenSymbol: trimmedSymbol,
        tokenDescription: savedDescription || undefined,
        socialLinks: savedSocial,
        creatorAddress: traderAddress,
        logoPreviewUrl,
        missionKeys: [MISSION_KEYS.deployMeme, MISSION_KEYS.dailySwap],
      });

      setLaunchSuccess({
        tokenAddress: mintAddress,
        tokenName: trimmedName,
        tokenSymbol: trimmedSymbol,
        logoPreviewUrl,
      });
      void refreshBalance();
    } catch (err) {
      setError(formatTradeError(err));
    } finally {
      setSubmitting(false);
      setLaunchFinalizing(false);
      setUploadStatus(null);
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

    if (initialBuyLamports > 0n && minTokenOut === 0n) {
      next.initialBuy = "Initial buy is too small for the bonding curve.";
    }

    return next;
  }, [showFieldErrors, name, symbol, logoFile, initialBuyLamports, minTokenOut]);

  const isBusy = submitting || launchFinalizing;

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
    submitting && !launchFinalizing ? "submitting" : launchFinalizing ? "confirming" : null;
  const formSubmitPending = formSubmitPhase !== null;
  const formStatusDetail =
    formSubmitPhase === "submitting"
      ? "Submitting your launch transaction"
      : formSubmitPhase === "confirming"
        ? "Saving token profile and logo"
        : null;

  const submitLabel = !authenticated
    ? "Sign in to launch"
    : !isConnected
      ? "Preparing wallet"
      : needsSolFunding
        ? `Add ${NATIVE_SYMBOL} to launch`
        : formSubmitPending
          ? formSubmitPhase === "submitting"
            ? "Processing"
            : "Confirming"
          : "Create token";

  const displaySymbol = symbol.trim() || "TICKER";
  const submitDisabled = isBusy || (authenticated && !ready);

  function handleLaunch() {
    if (!authenticated) {
      login();
      return;
    }

    const hasRequiredFieldError = !name.trim() || !symbol.trim() || !logoFile;
    const hasBuyFieldError = initialBuyLamports > 0n && minTokenOut === 0n;

    if (hasRequiredFieldError || hasBuyFieldError || hasSocialFieldError()) {
      setShowFieldErrors(true);
      if (hasSocialFieldError()) setSocialOpen(true);
      return;
    }

    setShowFieldErrors(false);

    if (needsSolFunding) {
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
      className={`primary-button flex min-w-0 flex-1 items-center justify-center gap-2 sm:flex-none sm:min-w-[9.5rem] sm:px-8${formSubmitPending ? " form-submit-button--loading" : ""}`}
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
      {error ? (
        <div className="notice-error px-3 py-2 text-caption" role="alert">
          {error}
        </div>
      ) : null}
      {txSignature ? (
        <p className="field-hint break-all">
          Tx: {txSignature}
          {uploadStatus ? ` — ${uploadStatus}` : launchSuccess ? " — confirmed" : null}
        </p>
      ) : null}
      {needsSolFunding && isConnected && !balanceLoading ? (
        <div className="rounded-md border border-pump-warning/30 bg-pump-warning/10 px-2.5 py-2">
          <p className="text-caption leading-snug text-pump-warning">
            Need{" "}
            <SolAmountDisplay
              lamports={solShortfallLamports}
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

  if (!isSolanaChainFamily) return null;

  return (
    <>
      <div className="airdrops-page airdrop-create-page airdrop-create-page--token">
        <HubDiscoveryScrollLock />
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
                          address="11111111111111111111111111111111"
                          symbol={displaySymbol}
                          previewUrl={logoPreview}
                          size={64}
                        />
                        <label
                          htmlFor="logo-sol"
                          className="secondary-button cursor-pointer px-3 py-1.5 text-caption"
                        >
                          Upload <span className="text-pump-accent">*</span>
                        </label>
                        <input
                          id="logo-sol"
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
                          <label className="field-label" htmlFor="name-sol">
                            Coin name <span className="text-pump-accent">*</span>
                          </label>
                          <div className={`field-control${fieldErrors.name ? " field-control--error" : ""}`}>
                            <input
                              id="name-sol"
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
                          <label className="field-label" htmlFor="symbol-sol">
                            Ticker <span className="text-pump-accent">*</span>
                          </label>
                          <div
                            className={`field-control${fieldErrors.symbol ? " field-control--error" : ""}`}
                          >
                            <input
                              id="symbol-sol"
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
                          <label className="field-label" htmlFor="description-sol">
                            Description{" "}
                            <span className="font-normal text-pump-muted">(optional)</span>
                          </label>
                          <textarea
                            id="description-sol"
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
                          <label
                            className="field-label inline-flex items-center gap-1"
                            htmlFor="initialBuy-sol"
                          >
                            Initial buy{" "}
                            <span className="font-normal text-pump-muted">(optional)</span>
                            <InfoTip label="About initial buy">
                              Seed liquidity at launch. Leave blank to pay only Solana network rent
                              (~0.011 SOL). No platform create fee — same as pump.fun.
                            </InfoTip>
                          </label>
                          <div
                            className={`relative field-control${fieldErrors.initialBuy ? " field-control--error" : ""}`}
                          >
                            <div className="pointer-events-none absolute inset-y-0 left-3 z-[1] flex items-center">
                              <NativeLogo size="sm" />
                            </div>
                            <input
                              id="initialBuy-sol"
                              inputMode="decimal"
                              value={initialBuySol}
                              onChange={(e) => onInitialBuyChange(e.target.value)}
                              placeholder="0"
                              className={`field-input financial-value w-full pl-11 pr-14${fieldErrors.initialBuy ? " field-input--error" : ""}`}
                              aria-invalid={fieldErrors.initialBuy ? true : undefined}
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                              <span className="text-caption font-medium text-pump-muted">
                                {NATIVE_SYMBOL}
                              </span>
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
                  <p className="text-caption text-pump-muted">Total due (network + optional buy)</p>
                  <SolAmountDisplay
                    lamports={launchRequiredLamports}
                    logoSize={16}
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
