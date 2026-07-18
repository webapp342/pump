"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { UserAvatarForAddress } from "@/components/user/UserAvatarForAddress";
import { UserDisplayName } from "@/components/user/UserDisplayName";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { KolSponsorTokenSelect } from "@/components/kol-market/KolSponsorTokenSelect";
import { contracts, NATIVE_SYMBOL } from "@/config/chain";
import { formatUsdReadable } from "@/lib/format-usd";
import { kolMarketEscrowAbi } from "@/lib/abis/kol-market-escrow";
import { kolRequestIdToBytes32 } from "@/lib/kol-market-escrow";
import {
  KOL_MARKET_COPY,
  type KolMarketTab,
} from "@/lib/kol-market-copy";
import type {
  KolCalloutRequestRow,
  KolExploreRow,
  KolProfileDetail,
} from "@/lib/db/kol-market";
import { PumpIcon, faCheck } from "@/lib/icons";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { HubDiscoveryScrollLock } from "@/components/layout/HubDiscoveryScrollLock";

function formatPct(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatMultiplierX(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 100) return `${value.toFixed(0)}x`;
  if (value >= 10) return `${value.toFixed(1)}x`;
  return `${value.toFixed(2)}x`;
}

function formatHold(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds >= 86400) return `${Math.round(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 60)}m`;
}

type SponsorTarget = Pick<KolExploreRow, "address" | "displayUsername" | "minPriceUsd">;

export function KolMarketPanel() {
  const { address, isConnected } = useAccount();
  const { login } = usePumpWallet();
  const [tab, setTab] = useState<KolMarketTab>("explore");
  const [kols, setKols] = useState<KolExploreRow[]>([]);
  const [inbox, setInbox] = useState<KolCalloutRequestRow[]>([]);
  const [profile, setProfile] = useState<KolProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sponsorTarget, setSponsorTarget] = useState<SponsorTarget | null>(null);
  const [tokenAddress, setTokenAddress] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [settingsMinPrice, setSettingsMinPrice] = useState("10");
  const [settingsBio, setSettingsBio] = useState("");
  const [settingsActive, setSettingsActive] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending: txPending, reset: resetTx } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const escrowConfigured = Boolean(contracts.kolMarketEscrow);

  const loadExplore = useCallback(async () => {
    const res = await fetch("/api/kol-market/explore", { cache: "no-store" });
    const body = (await res.json()) as { data?: { kols?: KolExploreRow[] }; error?: string };
    if (!res.ok) throw new Error(body.error ?? KOL_MARKET_COPY.loadError);
    setKols(body.data?.kols ?? []);
  }, []);

  const loadInbox = useCallback(async (wallet: string) => {
    const res = await fetch(
      `/api/kol-market/requests?address=${encodeURIComponent(wallet)}&status=pending`,
      { cache: "no-store" }
    );
    const body = (await res.json()) as { data?: { requests?: KolCalloutRequestRow[] } };
    setInbox(body.data?.requests ?? []);
  }, []);

  const loadProfile = useCallback(async (wallet: string) => {
    const res = await fetch(`/api/kol-market/profile?address=${encodeURIComponent(wallet)}`, {
      cache: "no-store",
    });
    const body = (await res.json()) as {
      data?: { profile?: KolProfileDetail | null };
    };
    const next = body.data?.profile ?? null;
    setProfile(next);
    if (next) {
      setSettingsMinPrice(String(next.minPriceUsd));
      setSettingsBio(next.bio ?? "");
      setSettingsActive(next.isActive);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadExplore();
      if (address) {
        await Promise.all([loadInbox(address), loadProfile(address)]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : KOL_MARKET_COPY.loadError);
    } finally {
      setLoading(false);
    }
  }, [address, loadExplore, loadInbox, loadProfile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!txConfirmed || !pendingRequestId || !address || !txHash) return;

    void (async () => {
      try {
        await fetch("/api/kol-market/requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: pendingRequestId,
            sponsorAddress: address,
            escrowTxHash: txHash,
          }),
        });
        setSponsorTarget(null);
        setTokenAddress("");
        setPendingRequestId(null);
        resetTx();
        await refresh();
      } catch {
        setRequestError("Escrow confirmed on-chain but backend sync failed.");
      }
    })();
  }, [txConfirmed, pendingRequestId, address, txHash, refresh, resetTx]);

  const onSaveSettings = useCallback(async () => {
    if (!address) return;
    setSettingsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/kol-market/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          minPriceUsd: Number(settingsMinPrice),
          isActive: settingsActive,
          bio: settingsBio.trim() || null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSettingsSaving(false);
    }
  }, [address, refresh, settingsActive, settingsBio, settingsMinPrice]);

  const onAccept = useCallback(
    async (requestId: string) => {
      if (!address) return;
      const res = await fetch(`/api/kol-market/requests/${requestId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kolAddress: address }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Accept failed");
      await refresh();
    },
    [address, refresh]
  );

  const onReject = useCallback(
    async (requestId: string) => {
      if (!address) return;
      const res = await fetch(`/api/kol-market/requests/${requestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kolAddress: address }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Decline failed");
      await refresh();
    },
    [address, refresh]
  );

  const onPayAndRequest = useCallback(async () => {
    if (!address || !sponsorTarget || !tokenAddress.trim()) return;
    setRequestBusy(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/kol-market/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsorAddress: address,
          kolAddress: sponsorTarget.address,
          tokenAddress: tokenAddress.trim(),
          priceUsd: sponsorTarget.minPriceUsd,
          draft: true,
        }),
      });
      const body = (await res.json()) as {
        data?: { request?: KolCalloutRequestRow; escrowAmountZug?: number };
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Request failed");

      const request = body.data?.request;
      const escrowAmountZug = body.data?.escrowAmountZug ?? 0;
      if (!request) throw new Error("Request failed");

      if (!escrowConfigured || !contracts.kolMarketEscrow) {
        throw new Error("Escrow contract not configured");
      }

      setPendingRequestId(request.id);
      writeContract({
        address: contracts.kolMarketEscrow,
        abi: kolMarketEscrowAbi,
        functionName: "lock",
        args: [kolRequestIdToBytes32(request.id), sponsorTarget.address as `0x${string}`],
        value: parseEther(String(escrowAmountZug)),
      });
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Request failed");
      setPendingRequestId(null);
    } finally {
      setRequestBusy(false);
    }
  }, [address, escrowConfigured, sponsorTarget, tokenAddress, writeContract]);

  const inboxCount = inbox.length;

  const valueProps = useMemo(
    () => (
      <div className="kol-market-value-props">
        <article className="panel-surface kol-market-value-props__card">
          <h3 className="section-heading">{KOL_MARKET_COPY.whyFollowTitle}</h3>
          <p className="text-body-sm text-pump-muted">{KOL_MARKET_COPY.whyFollowBody}</p>
        </article>
        <article className="panel-surface kol-market-value-props__card">
          <h3 className="section-heading">{KOL_MARKET_COPY.whySponsorTitle}</h3>
          <p className="text-body-sm text-pump-muted">{KOL_MARKET_COPY.whySponsorBody}</p>
        </article>
      </div>
    ),
    []
  );

  if (!isConnected || !address) {
    return (
      <div className="kol-market-page">
        <HubDiscoveryScrollLock />
        <header className="kol-market-page__header">
          <p className="page-kicker">{KOL_MARKET_COPY.pageKicker}</p>
          <h1 className="page-title">{KOL_MARKET_COPY.pageTitle}</h1>
          <p className="text-body-sm text-pump-muted">{KOL_MARKET_COPY.pageDescription}</p>
        </header>
        {valueProps}
        <div className="empty-state kol-market-empty">
          <p className="empty-state-copy">{KOL_MARKET_COPY.connectWallet}</p>
          <button type="button" className="primary-button" onClick={() => login()}>
            Connect wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kol-market-page">
      <HubDiscoveryScrollLock />
      <header className="kol-market-page__header">
        <p className="page-kicker">{KOL_MARKET_COPY.pageKicker}</p>
        <h1 className="page-title">{KOL_MARKET_COPY.pageTitle}</h1>
        <p className="text-body-sm text-pump-muted">{KOL_MARKET_COPY.pageDescription}</p>
      </header>

      <div className="kol-market-hub">
      {valueProps}

      <div className="kol-market-tabs">
        <nav className="kol-market-tabs__nav" aria-label="KOL market sections">
          <div className="kol-market-tabs__track" role="tablist">
            {(
              [
                { id: "explore" as const, label: KOL_MARKET_COPY.exploreTab },
                {
                  id: "inbox" as const,
                  label: KOL_MARKET_COPY.inboxTab,
                  count: inboxCount,
                },
                { id: "settings" as const, label: KOL_MARKET_COPY.settingsTab },
              ] as const
            ).map(({ id, label, ...rest }) => {
              const isActive = tab === id;
              const count = "count" in rest ? rest.count : undefined;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={
                    isActive
                      ? "kol-market-tabs__item kol-market-tabs__item--active"
                      : "kol-market-tabs__item"
                  }
                  onClick={() => setTab(id)}
                >
                  {label}
                  {typeof count === "number" && count > 0 ? (
                    <span className="kol-market-tabs__count">{count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {error ? <div className="notice-error">{error}</div> : null}

      {loading ? (
        <p className="text-caption text-pump-muted">Loading…</p>
      ) : tab === "explore" ? (
        kols.length === 0 ? (
          <div className="empty-state kol-market-empty">
            <p className="empty-state-copy">{KOL_MARKET_COPY.emptyExplore}</p>
          </div>
        ) : (
          <ul className="kol-market-grid">
            {kols.map((kol) => (
              <li key={kol.address} className="panel-surface kol-market-card">
                <div className="kol-market-card__head">
                  <div className="kol-market-card__identity-row">
                    <UserAvatarForAddress address={kol.address} size="lg" />
                    <div className="kol-market-card__identity">
                      <UserDisplayName address={kol.address} />
                      <span
                        className={`kol-market-card__tier${
                          kol.kolTier === "verified" ? " kol-market-card__tier--verified" : ""
                        }`}
                      >
                        {kol.kolTier === "verified"
                          ? KOL_MARKET_COPY.verifiedBadge
                          : KOL_MARKET_COPY.standardBadge}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary-button kol-market-card__cta"
                    onClick={() => {
                      setTokenAddress("");
                      setRequestError(null);
                      setSponsorTarget({
                        address: kol.address,
                        displayUsername: kol.displayUsername,
                        minPriceUsd: kol.minPriceUsd,
                      });
                    }}
                  >
                    {KOL_MARKET_COPY.requestCta}
                  </button>
                </div>
                <dl className="kol-market-card__stats">
                  <div className="kol-market-card__stat">
                    <dt>{KOL_MARKET_COPY.minPriceLabel}</dt>
                    <dd className="financial-value">
                      {formatUsdReadable(kol.minPriceUsd, { compact: true })}
                    </dd>
                  </div>
                  <div className="kol-market-card__stat">
                    <dt>{KOL_MARKET_COPY.followersLabel}</dt>
                    <dd className="financial-value">{kol.followerCount.toLocaleString()}</dd>
                  </div>
                  <div className="kol-market-card__stat">
                    <dt>{KOL_MARKET_COPY.medianXLabel}</dt>
                    <dd className="financial-value">
                      {formatMultiplierX(kol.medianCalloutMultiplier)}
                    </dd>
                  </div>
                  <div className="kol-market-card__stat">
                    <dt>{KOL_MARKET_COPY.hitRateLabel}</dt>
                    <dd className="financial-value">{formatPct(kol.calloutHitRate)}</dd>
                  </div>
                  <div className="kol-market-card__stat">
                    <dt>{KOL_MARKET_COPY.networkVolLabel}</dt>
                    <dd className="financial-value">
                      {kol.networkVolumeBnb.toFixed(2)} {NATIVE_SYMBOL}
                    </dd>
                  </div>
                  <div className="kol-market-card__stat">
                    <dt>{KOL_MARKET_COPY.repeatRateLabel}</dt>
                    <dd className="financial-value">{formatPct(kol.repeatTraderRate)}</dd>
                  </div>
                  <div className="kol-market-card__stat">
                    <dt>{KOL_MARKET_COPY.avgHoldLabel}</dt>
                    <dd className="financial-value">{formatHold(kol.avgHoldSeconds)}</dd>
                  </div>
                  <div className="kol-market-card__stat">
                    <dt>{KOL_MARKET_COPY.acceptRateLabel}</dt>
                    <dd className="financial-value">{formatPct(kol.acceptRate)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )
      ) : tab === "inbox" ? (
        inbox.length === 0 ? (
          <div className="empty-state kol-market-empty">
            <p className="empty-state-copy">{KOL_MARKET_COPY.emptyInbox}</p>
          </div>
        ) : (
          <ul className="kol-market-inbox">
            {inbox.map((req) => (
              <li key={req.id} className="panel-surface kol-market-inbox__row">
                <div className="kol-market-inbox__main">
                  <p className="card-title">
                    {req.tokenSymbol ?? "Token"}{" "}
                    <span className="text-pump-muted text-body-sm">
                      from {req.sponsorAddress.slice(0, 6)}…
                    </span>
                  </p>
                  <p className="text-body-sm text-pump-muted financial-value">
                    {formatUsdReadable(req.priceUsd, { compact: true })} ·{" "}
                    {req.escrowAmountZug.toFixed(4)} {NATIVE_SYMBOL}
                  </p>
                </div>
                <div className="kol-market-inbox__actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void onAccept(req.id).catch((e) => setError(String(e)))}
                  >
                    {KOL_MARKET_COPY.acceptCta}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void onReject(req.id).catch((e) => setError(String(e)))}
                  >
                    {KOL_MARKET_COPY.rejectCta}
                  </button>
                  <Link
                    href={`/token/${req.tokenAddress}`}
                    className="chip-button kol-market-inbox__view"
                  >
                    View token
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <section className="panel-surface kol-market-settings">
          <p className="section-label">{KOL_MARKET_COPY.settingsTab}</p>
          {profile?.kolTier === "verified" ? (
            <p className="kol-market-settings__verified">
              <PumpIcon icon={faCheck} size="sm" /> {KOL_MARKET_COPY.verifiedBadge}
            </p>
          ) : null}
          <label className="field-label" htmlFor="kol-min-price">
            {KOL_MARKET_COPY.minPriceLabel}
          </label>
          <input
            id="kol-min-price"
            className="field-input"
            inputMode="decimal"
            value={settingsMinPrice}
            onChange={(e) => setSettingsMinPrice(e.target.value)}
          />
          <p className="field-hint">{KOL_MARKET_COPY.minPriceHint}</p>
          <label className="field-label" htmlFor="kol-bio">
            {KOL_MARKET_COPY.bioLabel}
          </label>
          <textarea
            id="kol-bio"
            className="field-textarea"
            rows={3}
            value={settingsBio}
            onChange={(e) => setSettingsBio(e.target.value)}
          />
          <label className="kol-market-settings__toggle">
            <input
              type="checkbox"
              checked={settingsActive}
              onChange={(e) => setSettingsActive(e.target.checked)}
            />
            <span>
              {settingsActive ? KOL_MARKET_COPY.listingActive : KOL_MARKET_COPY.listingPaused}
            </span>
          </label>
          <button
            type="button"
            className="primary-button kol-market-settings__save"
            disabled={settingsSaving}
            onClick={() => void onSaveSettings()}
          >
            {settingsSaving ? "Saving…" : KOL_MARKET_COPY.saveListingCta}
          </button>
        </section>
      )}

      {sponsorTarget ? (
        <ModalPortal open>
          <div
            className="modal-backdrop modal-backdrop-shell z-50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kol-sponsor-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close"
              disabled={txPending}
              onClick={() => {
                if (!txPending) {
                  setSponsorTarget(null);
                  setRequestError(null);
                }
              }}
            />
            <div className="modal-panel kol-market-modal panel-surface relative w-full max-w-md p-5 shadow-panel">
              <h2 id="kol-sponsor-title" className="section-heading">
                Request callout
              </h2>
            <p className="text-body-sm text-pump-muted">
              Pay{" "}
              <span className="financial-value">
                {formatUsdReadable(sponsorTarget.minPriceUsd, { compact: true })}
              </span>{" "}
              to <UserDisplayName address={sponsorTarget.address} compact /> — escrowed until they
              accept.
            </p>
            <KolSponsorTokenSelect
              walletAddress={address}
              value={tokenAddress}
              onChange={setTokenAddress}
              disabled={txPending || requestBusy}
            />
            {requestError ? <p className="notice-error">{requestError}</p> : null}
            {!escrowConfigured ? (
              <p className="field-hint">Escrow contract not deployed yet on this environment.</p>
            ) : null}
            <div className="kol-market-modal__actions">
              <button
                type="button"
                className="secondary-button"
                disabled={txPending || requestBusy}
                onClick={() => setSponsorTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={
                  !tokenAddress.trim() || requestBusy || txPending || !escrowConfigured
                }
                onClick={() => void onPayAndRequest()}
              >
                {txPending || requestBusy
                  ? "Confirm in wallet…"
                  : KOL_MARKET_COPY.payAndSendCta}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
      </div>
    </div>
  );
}
