"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { ModalPortal } from "@/components/ui/ModalPortal";

function formatTokenBalance(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

const ALL_TOKENS_LIMIT = 50;

function tokenMatchesSearch(token: TokenListItem, term: string): boolean {
  if (!term) return true;
  const haystack = [token.symbol, token.name, token.address].join(" ").toLowerCase();
  return haystack.includes(term);
}

function sortByNewest(tokens: TokenListItem[]): TokenListItem[] {
  return [...tokens].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

type LaunchpadTokenPickerProps = {
  id?: string;
  label?: ReactNode;
  modalTitle?: string;
  value: string;
  onChange: (address: string) => void;
  tokens: TokenListItem[];
  /** Creator-owned tokens — pinned at top with balances when provided. */
  priorityTokens?: TokenListItem[];
  balances?: Record<string, string>;
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
};

function TokenPickerRow({
  token,
  selected,
  balance,
  onSelect,
}: {
  token: TokenListItem;
  selected: boolean;
  balance?: string;
  onSelect: () => void;
}) {
  const balanceNum = balance != null ? Number(balance) : NaN;
  const showBalance = Number.isFinite(balanceNum);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition ${
        selected
          ? "bg-pump-accent/10 ring-1 ring-pump-accent/30"
          : "text-pump-text hover:bg-pump-surface/50"
      }`}
    >
      <TokenAvatar
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
        size={36}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium">{token.name}</p>
        <p className="truncate text-caption text-pump-muted">${token.symbol}</p>
      </div>
      {showBalance ? (
        <div className="shrink-0 text-right">
          <p className="financial-value text-body-sm font-semibold text-pump-text">
            {formatTokenBalance(balanceNum)}
          </p>
          <p className="text-caption text-pump-muted">Balance</p>
        </div>
      ) : null}
    </button>
  );
}

export function LaunchpadTokenPicker({
  id,
  label,
  modalTitle = "Select token",
  value,
  onChange,
  tokens,
  priorityTokens = [],
  balances = {},
  loading = false,
  placeholder = "Select a token",
  disabled = false,
  hint,
}: LaunchpadTokenPickerProps) {
  const listboxId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tokenCatalog = useMemo(() => {
    const map = new Map<string, TokenListItem>();
    for (const token of tokens) map.set(token.address.toLowerCase(), token);
    for (const token of priorityTokens) map.set(token.address.toLowerCase(), token);
    return map;
  }, [tokens, priorityTokens]);

  const selectedToken = useMemo(() => {
    if (!value) return null;
    return tokenCatalog.get(value.toLowerCase()) ?? null;
  }, [tokenCatalog, value]);

  const priorityAddressSet = useMemo(
    () => new Set(priorityTokens.map((token) => token.address.toLowerCase())),
    [priorityTokens]
  );

  const { priorityList, otherList, otherListCapped } = useMemo(() => {
    const term = search.trim().toLowerCase();

    const sortedPriority = [...priorityTokens]
      .filter((token) => tokenMatchesSearch(token, term))
      .sort((a, b) => {
        const balA = Number(balances[a.address.toLowerCase()] ?? 0);
        const balB = Number(balances[b.address.toLowerCase()] ?? 0);
        if (balB !== balA) return balB - balA;
        return a.symbol.localeCompare(b.symbol);
      });

    const recentPool = sortByNewest(
      tokens.filter((token) => !priorityAddressSet.has(token.address.toLowerCase()))
    ).slice(0, ALL_TOKENS_LIMIT);

    const others = recentPool.filter((token) => tokenMatchesSearch(token, term));

    return {
      priorityList: sortedPriority,
      otherList: others,
      otherListCapped: recentPool.length >= ALL_TOKENS_LIMIT,
    };
  }, [priorityTokens, tokens, priorityAddressSet, search, balances]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const empty = !loading && priorityList.length === 0 && otherList.length === 0;

  function closeModal() {
    setOpen(false);
  }

  function selectToken(address: string) {
    onChange(address);
    closeModal();
  }

  return (
    <div>
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : null}

      <button
        id={id}
        type="button"
        disabled={disabled || loading}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`field-input flex items-center gap-2.5 py-2.5 text-left ${
          disabled || loading ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        {loading ? (
          <span className="text-body-sm text-pump-muted">Loading tokens…</span>
        ) : selectedToken ? (
          <>
            <TokenAvatar
              address={selectedToken.address}
              symbol={selectedToken.symbol}
              logoUrl={selectedToken.logoUrl}
              size={28}
              className="shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-body-sm">
              <span className="font-medium text-pump-text">{selectedToken.name}</span>
              <span className="text-pump-muted"> · ${selectedToken.symbol}</span>
            </span>
            {balances[selectedToken.address.toLowerCase()] ? (
              <span className="financial-value shrink-0 text-caption text-pump-muted">
                {formatTokenBalance(balances[selectedToken.address.toLowerCase()]!)}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-body-sm text-pump-muted">{placeholder}</span>
        )}
        <span className="ml-auto shrink-0 text-caption font-medium text-pump-accent">Browse</span>
      </button>

      {hint ? <div className="mt-1.5">{hint}</div> : null}

      {open ? (
        <ModalPortal open={open}>
        <div
          className="modal-backdrop modal-backdrop-shell z-[70]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={closeModal}
          />

          <div className="panel-surface relative flex w-full max-w-lg max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl shadow-panel sm:max-h-[min(85vh,720px)] sm:rounded-xl">
            <div className="shrink-0 border-b border-pump-border/10 px-4 pb-4 pt-3 sm:px-5 sm:pt-5">
              <div className="mb-3 flex justify-center sm:hidden">
                <div className="h-1 w-10 rounded-full bg-pump-border/50" aria-hidden />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={titleId} className="section-heading text-h3">
                    {modalTitle}
                  </h2>
                  <p className="mt-1 text-caption text-pump-muted">
                    Search by name, symbol, or contract address.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="chip-button-ghost shrink-0 px-2.5 py-1.5 text-caption"
                  aria-label="Close"
                >
                  Close
                </button>
              </div>

              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tokens"
                className="field-input mt-4 h-10 bg-pump-surface/75"
                autoFocus
              />
            </div>

            <div
              id={listboxId}
              role="listbox"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-3"
            >
              {loading ? (
                <p className="px-3 py-8 text-center text-body-sm text-pump-muted">Loading tokens…</p>
              ) : empty ? (
                <p className="px-3 py-8 text-center text-body-sm text-pump-muted">
                  No tokens match your search.
                </p>
              ) : (
                <div className="space-y-3">
                  {priorityList.length > 0 ? (
                    <section>
                      <p className="section-label px-2 pb-1.5 text-[10px]">Your tokens</p>
                      <div className="space-y-1">
                        {priorityList.map((token) => (
                          <TokenPickerRow
                            key={token.address}
                            token={token}
                            selected={token.address.toLowerCase() === value.toLowerCase()}
                            balance={balances[token.address.toLowerCase()]}
                            onSelect={() => selectToken(token.address)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {otherList.length > 0 ? (
                    <section>
                      <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
                        <p className="section-label">
                          {priorityList.length > 0 ? "All tokens" : "Recent tokens"}
                        </p>
                        {otherListCapped && !search.trim() ? (
                          <p className="text-[10px] text-pump-muted">Latest {ALL_TOKENS_LIMIT}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        {otherList.map((token) => (
                          <TokenPickerRow
                            key={token.address}
                            token={token}
                            selected={token.address.toLowerCase() === value.toLowerCase()}
                            onSelect={() => selectToken(token.address)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
