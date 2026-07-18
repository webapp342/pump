"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { PumpIcon, faChevronDown, faCheck } from "@/lib/icons";
import { KOL_MARKET_COPY } from "@/lib/kol-market-copy";
import { shortAddress } from "@/config/chain";

export type SponsorLaunchedToken = {
  address: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
};

type KolSponsorTokenSelectProps = {
  walletAddress: string;
  value: string;
  onChange: (tokenAddress: string) => void;
  disabled?: boolean;
};

export function KolSponsorTokenSelect({
  walletAddress,
  value,
  onChange,
  disabled = false,
}: KolSponsorTokenSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<SponsorLaunchedToken[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/portfolio/created-tokens?address=${encodeURIComponent(walletAddress)}&limit=100`,
        { cache: "no-store" }
      );
      const body = (await res.json()) as {
        data?: { tokens?: Array<{ address: string; symbol: string; name: string; logoUrl: string | null }> };
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load tokens");
      setTokens(
        (body.data?.tokens ?? []).map((t) => ({
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          logoUrl: t.logoUrl,
        }))
      );
    } catch (err) {
      setTokens([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = tokens.find((t) => t.address.toLowerCase() === value.toLowerCase()) ?? null;

  return (
    <div className="kol-token-select" ref={rootRef}>
      <label className="field-label" htmlFor={listId}>
        {KOL_MARKET_COPY.yourTokenLabel}
      </label>
      <p className="field-hint">{KOL_MARKET_COPY.yourTokenHint}</p>

      {loading ? (
        <div className="kol-token-select__trigger kol-token-select__trigger--disabled" aria-busy>
          <span className="text-body-sm text-pump-muted">Loading your tokens…</span>
        </div>
      ) : loadError ? (
        <p className="notice-error">{loadError}</p>
      ) : tokens.length === 0 ? (
        <div className="kol-token-select__empty">
          <p className="text-body-sm text-pump-muted">{KOL_MARKET_COPY.noLaunchedTokens}</p>
          <Link href="/create" className="secondary-button kol-token-select__create">
            {KOL_MARKET_COPY.launchTokenCta}
          </Link>
        </div>
      ) : (
        <>
          <button
            id={listId}
            type="button"
            className={`kol-token-select__trigger${open ? " kol-token-select__trigger--open" : ""}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
          >
            {selected ? (
              <span className="kol-token-select__option-main">
                <TokenAvatar
                  address={selected.address}
                  symbol={selected.symbol}
                  logoUrl={selected.logoUrl}
                  size="md"
                />
                <span className="kol-token-select__copy">
                  <span className="kol-token-select__symbol">{selected.symbol}</span>
                  <span className="kol-token-select__name text-pump-muted">{selected.name}</span>
                </span>
              </span>
            ) : (
              <span className="text-body-sm text-pump-muted">{KOL_MARKET_COPY.selectTokenPlaceholder}</span>
            )}
            <PumpIcon icon={faChevronDown} size="sm" className="kol-token-select__caret" aria-hidden />
          </button>

          {open ? (
            <ul className="kol-token-select__menu" role="listbox" aria-label={KOL_MARKET_COPY.yourTokenLabel}>
              {tokens.map((token) => {
                const isSelected = selected?.address.toLowerCase() === token.address.toLowerCase();
                return (
                  <li key={token.address} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={`kol-token-select__option${
                        isSelected ? " kol-token-select__option--selected" : ""
                      }`}
                      onClick={() => {
                        onChange(token.address);
                        setOpen(false);
                      }}
                    >
                      <span className="kol-token-select__option-main">
                        <TokenAvatar
                          address={token.address}
                          symbol={token.symbol}
                          logoUrl={token.logoUrl}
                          size="md"
                        />
                        <span className="kol-token-select__copy">
                          <span className="kol-token-select__symbol">{token.symbol}</span>
                          <span className="kol-token-select__meta">
                            <span className="kol-token-select__name">{token.name}</span>
                            <span className="financial-value text-pump-muted">
                              {shortAddress(token.address, true)}
                            </span>
                          </span>
                        </span>
                      </span>
                      {isSelected ? (
                        <PumpIcon icon={faCheck} size="sm" className="kol-token-select__check" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
