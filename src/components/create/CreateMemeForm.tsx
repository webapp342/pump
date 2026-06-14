"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEther, parseEther, parseEventLogs } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
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
import { DEFAULT_MIN_INITIAL_BUY_BNB } from "@/lib/platform-settings";

/** Redirect after logo upload attempt (or skip if no file). */
const REDIRECT_DELAY_MS = 400;

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
  const socialLinksRef = useRef({ twitter: "", website: "", telegram: "", discord: "" });
  const { openConnectModal } = useConnectModal();
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
  const [awaitingRedirect, setAwaitingRedirect] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

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

        setAwaitingRedirect(true);

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

      setTimeout(() => {
        router.push(`/token/${token}`);
      }, REDIRECT_DELAY_MS);
    })();
  }, [receipt, router, reset, address]);

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

  const isBusy = isPending || isConfirming || awaitingRedirect;

  const submitLabel = !isConnected
    ? "Connect wallet"
    : wrongChain
      ? "Switch to BSC Testnet"
      : isBusy
        ? "Creating…"
        : "Launch + buy";

  const submitDisabled = isConnected && (wrongChain || isBusy || !contractsReady);

  const displayName = name.trim() || "Your coin";
  const displaySymbol = symbol.trim() || "TICKER";

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] xl:items-start"
    >
      <div className="space-y-4">
        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Token profile</p>

          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <TokenAvatar
                address="0x0000000000000000000000000000000000000000"
                symbol={displaySymbol}
                previewUrl={logoPreview}
                size={72}
              />
              <label
                htmlFor="logo"
                className="secondary-button cursor-pointer px-3 py-1.5 text-caption"
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
              <p className="field-hint text-center">PNG, JPEG, WebP or GIF · max 2 MB</p>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
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
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this coin about?"
                  className="field-textarea"
                />
                <p className="mt-1 field-hint">{description.length}/2000</p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Initial issuance</p>

          <div className="mt-4">
            <label className="field-label" htmlFor="initialBuy">
              Initial buy (BNB) <span className="text-pump-accent">*</span>
            </label>
            <input
              id="initialBuy"
              inputMode="decimal"
              required
              value={initialBuyBnb}
              onChange={(e) => setInitialBuyBnb(e.target.value)}
              placeholder={minInitialBuyBnb}
              className="field-input financial-value max-w-xs"
            />
            <p className="mt-1.5 field-hint">
              Minimum {minInitialBuyBnb} BNB. A larger initial buy launches your coin at a higher
              starting price.
            </p>
          </div>
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

      <aside className="space-y-4 xl:sticky xl:top-20">
        <section className="panel-surface p-4 md:p-5">
          <p className="section-label">Preview</p>
          <div className="mt-4 flex items-center gap-3">
            <TokenAvatar
              address="0x0000000000000000000000000000000000000000"
              symbol={displaySymbol}
              previewUrl={logoPreview}
              size={52}
            />
            <div className="min-w-0">
              <p className="card-title truncate">{displayName}</p>
              <p className="text-caption text-pump-muted">${displaySymbol}</p>
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
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 text-body-sm">
              <dt className="text-pump-muted">Create fee</dt>
              <dd className="financial-value font-medium text-pump-text">
                {formatEther(feeWei)} BNB
              </dd>
            </div>
            {initialBuyWei > 0n ? (
              <div className="flex items-center justify-between gap-3 text-body-sm">
                <dt className="text-pump-muted">Initial buy</dt>
                <dd className="financial-value font-medium text-pump-text">
                  {formatEther(initialBuyWei)} BNB
                </dd>
              </div>
            ) : null}
            {showReceivePreview ? (
              <div className="flex items-center justify-between gap-3 text-body-sm">
                <dt className="text-pump-muted">You receive</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <TokenAvatar
                    address="0x0000000000000000000000000000000000000000"
                    symbol={displaySymbol}
                    previewUrl={logoPreview}
                    size={24}
                  />
                  <span className="financial-value truncate font-medium text-pump-text">
                    {formatTokenAmountCompact(estimatedTokens)} ${displaySymbol}
                  </span>
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-pump-border/15 pt-3 text-body-sm">
              <dt className="font-medium text-pump-text">Total</dt>
              <dd className="financial-value text-h3 font-semibold text-pump-text">
                {formatEther(totalValue)} BNB
              </dd>
            </div>
          </dl>

          {error ? <p className="notice-error mt-4">{error}</p> : null}

          {txHash ? (
            <p className="mt-4 field-hint break-all">
              Tx: {txHash}
              {isConfirming
                ? " — confirming…"
                : uploadStatus
                  ? ` — ${uploadStatus}`
                  : awaitingRedirect
                    ? " — confirmed, opening token…"
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
    </form>
  );
}
