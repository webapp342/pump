"use client";

import { useEffect, useRef, useState } from "react";
import { NativeLogo } from "@/components/token/NativeLogo";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { PumpIcon, faChevronDown } from "@/lib/icons";
import type { WithdrawAsset } from "@/lib/withdraw-assets";

type WithdrawAssetPickerProps = {
  assets: WithdrawAsset[];
  selectedId: string | null;
  onSelect: (asset: WithdrawAsset) => void;
  disabled?: boolean;
};

function AssetIcon({ asset, size = 22 }: { asset: WithdrawAsset; size?: number }) {
  if (asset.kind === "native") {
    return (
      <span className="wallet-withdraw-asset-select__icon">
        <NativeLogo size={size} />
      </span>
    );
  }
  return (
    <TokenAvatar
      address={asset.tokenAddress!}
      symbol={asset.symbol}
      logoUrl={asset.logoUrl}
      size={size}
      className="wallet-withdraw-asset-select__icon shrink-0"
    />
  );
}

function assetLabel(asset: WithdrawAsset): string {
  return asset.kind === "token" ? `$${asset.symbol}` : asset.symbol;
}

function assetSubline(asset: WithdrawAsset): string | null {
  const label = assetLabel(asset);
  if (asset.name.trim().toUpperCase() === label.replace(/^\$/, "").trim().toUpperCase()) {
    return null;
  }
  return asset.name;
}

export function WithdrawAssetPicker({
  assets,
  selectedId,
  onSelect,
  disabled = false,
}: WithdrawAssetPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected =
    assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [selectedId]);

  if (!selected) {
    return (
      <div className="wallet-withdraw-asset-select wallet-withdraw-asset-select--empty">
        <p className="text-body-sm text-pump-muted">No withdrawable assets found.</p>
      </div>
    );
  }

  const canExpand = assets.length > 1;
  const subline = assetSubline(selected);

  return (
    <div ref={rootRef} className="wallet-withdraw-asset-select">
      <button
        type="button"
        className={`field-input wallet-withdraw-asset-select__trigger${canExpand ? "" : " wallet-withdraw-asset-select__trigger--static"}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (canExpand && !disabled) setOpen((value) => !value);
        }}
      >
        <AssetIcon asset={selected} />
        <span className="wallet-withdraw-asset-select__trigger-text min-w-0">
          <span className="wallet-withdraw-asset-select__symbol">{assetLabel(selected)}</span>
          {subline ? (
            <span className="wallet-withdraw-asset-select__name">{subline}</span>
          ) : null}
        </span>
        {canExpand ? (
          <PumpIcon
            icon={faChevronDown}
            className={`wallet-withdraw-asset-select__chevron h-4 w-4 shrink-0 ${open ? "is-open" : ""}`}
          />
        ) : null}
      </button>

      {open && canExpand ? (
        <ul className="wallet-withdraw-asset-select__menu" role="listbox">
          {assets.map((asset) => {
            const isSelected = asset.id === selected.id;
            const optionSubline = assetSubline(asset);
            return (
              <li key={asset.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`wallet-withdraw-asset-select__option${isSelected ? " is-selected" : ""}`}
                  onClick={() => {
                    onSelect(asset);
                    setOpen(false);
                  }}
                >
                  <AssetIcon asset={asset} size={24} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-body-sm font-semibold text-pump-text">
                      {assetLabel(asset)}
                    </span>
                    {optionSubline ? (
                      <span className="block truncate text-caption text-pump-muted">
                        {optionSubline}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
