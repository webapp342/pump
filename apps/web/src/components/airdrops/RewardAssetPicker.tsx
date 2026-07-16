"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { TokenListItem } from "@/lib/db/launchpad";
import { NATIVE_SYMBOL } from "@/config/chain";
import { BnbLogo } from "@/components/token/BnbLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { FieldErrorIcon, FieldErrorMessage } from "@/components/ui/FieldError";
import { AppBottomSheet } from "@/components/ui/AppBottomSheet";

export const BNB_REWARD_ASSET = "__BNB__";

function formatBalance(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
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

type RewardAssetPickerProps = {
  id?: string;
  label?: ReactNode;
  modalTitle?: string;
  value: string;
  onChange: (value: string) => void;
  tokens: TokenListItem[];
  priorityTokens?: TokenListItem[];
  tokenBalances?: Record<string, string>;
  bnbBalance?: string | null;
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
  showQuickPick?: boolean;
  error?: string | null;
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
  const showBalance = balance != null && Number.isFinite(balanceNum);

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
        size="2xl"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-pump-text">{token.name}</p>
        <p className="truncate text-caption font-medium text-pump-muted">${token.symbol}</p>
      </div>
      {showBalance ? (
        <div className="shrink-0 text-right">
          <p className="financial-value text-body-sm font-semibold text-pump-text">
            {formatBalance(balanceNum)}
          </p>
          <p className="text-caption text-pump-muted">Balance</p>
        </div>
      ) : null}
    </button>
  );
}

function BnbPickerRow({
  selected,
  balance,
  onSelect,
}: {
  selected: boolean;
  balance?: string | null;
  onSelect: () => void;
}) {
  const balanceNum = balance != null ? Number(balance) : NaN;
  const showBalance = balance != null && Number.isFinite(balanceNum);

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
      <BnbLogo size="2xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-pump-text">{NATIVE_SYMBOL}</p>
        <p className="truncate text-caption text-pump-muted">Native {NATIVE_SYMBOL}</p>
      </div>
      {showBalance ? (
        <div className="shrink-0 text-right">
          <p className="financial-value text-body-sm font-semibold text-pump-text">
            {formatBalance(balanceNum)}
          </p>
          <p className="text-caption text-pump-muted">Balance</p>
        </div>
      ) : null}
    </button>
  );
}

export function RewardAssetPicker({
  id,
  label,
  modalTitle = "Select reward asset",
  value,
  onChange,
  tokens,
  priorityTokens = [],
  tokenBalances = {},
  bnbBalance = null,
  loading = false,
  placeholder = "Select reward asset",
  disabled = false,
  hint,
  showQuickPick = false,
  error = null,
}: RewardAssetPickerProps) {
  const hasError = Boolean(error);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isBnbSelected = !value || value === BNB_REWARD_ASSET;

  const tokenCatalog = useMemo(() => {
    const map = new Map<string, TokenListItem>();
    for (const token of tokens) map.set(token.address.toLowerCase(), token);
    for (const token of priorityTokens) map.set(token.address.toLowerCase(), token);
    return map;
  }, [tokens, priorityTokens]);

  const selectedToken = useMemo(() => {
    if (isBnbSelected || !value) return null;
    return tokenCatalog.get(value.toLowerCase()) ?? null;
  }, [tokenCatalog, value, isBnbSelected]);

  const priorityAddressSet = useMemo(
    () => new Set(priorityTokens.map((token) => token.address.toLowerCase())),
    [priorityTokens]
  );

  const { priorityList, otherList, otherListCapped } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const bnbMatches = !term || "bnb native binance".includes(term);

    const sortedPriority = [...priorityTokens]
      .filter((token) => tokenMatchesSearch(token, term))
      .sort((a, b) => {
        const balA = Number(tokenBalances[a.address.toLowerCase()] ?? 0);
        const balB = Number(tokenBalances[b.address.toLowerCase()] ?? 0);
        if (balB !== balA) return balB - balA;
        return a.symbol.localeCompare(b.symbol);
      });

    const recentPool = sortByNewest(
      tokens.filter((token) => !priorityAddressSet.has(token.address.toLowerCase()))
    ).slice(0, ALL_TOKENS_LIMIT);

    const others = recentPool.filter((token) => tokenMatchesSearch(token, term));

    return {
      bnbMatches,
      priorityList: sortedPriority,
      otherList: others,
      otherListCapped: recentPool.length >= ALL_TOKENS_LIMIT,
    };
  }, [priorityTokens, tokens, priorityAddressSet, search, tokenBalances]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const empty =
    !loading &&
    !(!search.trim() || "bnb native binance".includes(search.trim().toLowerCase())) &&
    priorityList.length === 0 &&
    otherList.length === 0;

  function closeModal() {
    setOpen(false);
  }

  function selectAsset(next: string) {
    onChange(next);
    closeModal();
  }

  const displayBnbBalance = bnbBalance != null ? formatBalance(bnbBalance) : null;

  const quickPickTokens = useMemo(() => {
    if (!showQuickPick) return [];
    return [...priorityTokens]
      .filter((token) => {
        const bal = Number(tokenBalances[token.address.toLowerCase()] ?? 0);
        return Number.isFinite(bal) && bal > 0;
      })
      .sort((a, b) => {
        const balA = Number(tokenBalances[a.address.toLowerCase()] ?? 0);
        const balB = Number(tokenBalances[b.address.toLowerCase()] ?? 0);
        return balB - balA;
      })
      .slice(0, 3);
  }, [showQuickPick, priorityTokens, tokenBalances]);

  return (
    <div className={`min-w-0 max-w-full${hasError ? " field-group--error" : ""}`}>
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : null}

      <div className={`field-control min-w-0${hasError ? " field-control--error" : ""}`}>
        <button
          id={id}
          type="button"
          disabled={disabled || loading}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={hasError || undefined}
          onClick={() => setOpen(true)}
          className={`field-input flex min-w-0 items-center gap-2.5 py-2 text-left ${
            hasError ? "field-input--error pr-10" : ""
          } ${disabled || loading ? "cursor-not-allowed opacity-60" : ""}`}
        >
          {loading ? (
            <span className="text-body-sm text-pump-muted">Loading assets…</span>
          ) : isBnbSelected ? (
            <>
              <BnbLogo size="md" />
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-pump-text">
                {NATIVE_SYMBOL}
              </span>
              {displayBnbBalance ? (
                <span className="financial-value shrink-0 text-caption tabular-nums text-pump-muted">
                  {displayBnbBalance}
                </span>
              ) : null}
            </>
          ) : selectedToken ? (
            <>
              <TokenAvatar
                address={selectedToken.address}
                symbol={selectedToken.symbol}
                logoUrl={selectedToken.logoUrl}
                size="md"
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-pump-text">
                {selectedToken.symbol}
              </span>
              {tokenBalances[selectedToken.address.toLowerCase()] != null ? (
                <span className="financial-value shrink-0 text-caption tabular-nums text-pump-muted">
                  {formatBalance(tokenBalances[selectedToken.address.toLowerCase()]!)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-body-sm text-pump-muted">{placeholder}</span>
          )}
          {!hasError ? (
            <span className="ml-auto shrink-0 text-caption font-medium text-pump-accent">Browse</span>
          ) : null}
        </button>
        {hasError ? <FieldErrorIcon /> : null}
      </div>

      {showQuickPick && (displayBnbBalance != null || quickPickTokens.length > 0) ? (
        <div className="mt-2 flex max-w-full min-w-0 flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {displayBnbBalance != null ? (
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => onChange(BNB_REWARD_ASSET)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left transition ${
                isBnbSelected
                  ? "border-pump-accent/40 bg-pump-accent/10 text-pump-text"
                  : "border-pump-border/20 bg-pump-surface/30 text-pump-muted hover:border-pump-border/40 hover:text-pump-text"
              }`}
            >
              <BnbLogo size="xs" />
              <span className="text-caption font-medium">{NATIVE_SYMBOL}</span>
              <span className="financial-value shrink-0 text-[10px] tabular-nums opacity-80">
                {displayBnbBalance}
              </span>
            </button>
          ) : null}
          {quickPickTokens.map((token) => {
            const selected = token.address.toLowerCase() === value.toLowerCase();
            const bal = tokenBalances[token.address.toLowerCase()];
            return (
              <button
                key={token.address}
                type="button"
                disabled={disabled || loading}
                onClick={() => onChange(token.address)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left transition ${
                  selected
                    ? "border-pump-accent/40 bg-pump-accent/10 text-pump-text"
                    : "border-pump-border/20 bg-pump-surface/30 text-pump-muted hover:border-pump-border/40 hover:text-pump-text"
                }`}
              >
                <TokenAvatar
                  address={token.address}
                  symbol={token.symbol}
                  logoUrl={token.logoUrl}
                  size="xs"
                  className="shrink-0"
                />
                <span className="max-w-[4.5rem] truncate text-caption font-medium">
                  {token.symbol}
                </span>
                {bal != null ? (
                  <span className="financial-value shrink-0 text-[10px] tabular-nums opacity-80">
                    {formatBalance(bal)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <FieldErrorMessage>{error}</FieldErrorMessage>
      {hint ? <div className="mt-1.5">{hint}</div> : null}

      {open ? (
        <AppBottomSheet
          open={open}
          onClose={closeModal}
          ariaLabel={modalTitle}
          title={modalTitle}
          subtitle={`${NATIVE_SYMBOL} or a platform token from your wallet.`}
          zIndex={70}
          panelClassName="max-w-lg max-h-[92dvh] sm:max-h-[min(85vh,720px)]"
          bodyClassName="!p-0"
          dragEntirePanel={false}
        >
          <div className="shrink-0 border-b border-pump-border/10 px-4 pb-4 sm:px-5">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${NATIVE_SYMBOL} or tokens`}
                className="field-input mt-4 h-10 bg-pump-surface/75"
                autoFocus
              />
          </div>

          <div id={listboxId} role="listbox" className="px-2 py-2 sm:px-3">
              {loading ? (
                <p className="px-3 py-8 text-center text-body-sm text-pump-muted">Loading…</p>
              ) : empty ? (
                <p className="px-3 py-8 text-center text-body-sm text-pump-muted">
                  No assets match your search.
                </p>
              ) : (
                <div className="space-y-3">
                  {(!search.trim() ||
                    "bnb native binance".includes(search.trim().toLowerCase())) && (
                    <section>
                      <p className="section-label px-2 pb-1.5 text-[10px]">Native</p>
                      <BnbPickerRow
                        selected={isBnbSelected}
                        balance={bnbBalance}
                        onSelect={() => selectAsset(BNB_REWARD_ASSET)}
                      />
                    </section>
                  )}

                  {priorityList.length > 0 ? (
                    <section>
                      <p className="section-label px-2 pb-1.5 text-[10px]">Your tokens</p>
                      <div className="space-y-1">
                        {priorityList.map((token) => (
                          <TokenPickerRow
                            key={token.address}
                            token={token}
                            selected={token.address.toLowerCase() === value.toLowerCase()}
                            balance={tokenBalances[token.address.toLowerCase()] ?? "0"}
                            onSelect={() => selectAsset(token.address)}
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
                            balance={tokenBalances[token.address.toLowerCase()]}
                            onSelect={() => selectAsset(token.address)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
          </div>
        </AppBottomSheet>
      ) : null}
    </div>
  );
}

export function isBnbRewardAsset(value: string): boolean {
  return !value || value === BNB_REWARD_ASSET;
}
