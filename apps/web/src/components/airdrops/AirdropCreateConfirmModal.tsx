"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import {
  BnbAmountDisplay,
  RewardAmountDisplay,
  TokenAssetChip,
} from "@/components/token/AssetAmountDisplay";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { FormExecutionStatus } from "@/components/ui/FormExecutionStatus";
import { NATIVE_SYMBOL } from "@/config/chain";
import type { TokenListItem } from "@/lib/db/launchpad";
import {
  useMobileModalClose,
  useMobileModalScrollLock,
} from "@/hooks/useMobileModalScrollLock";
import { useMobileSheetDragDismiss } from "@/hooks/useMobileSheetDragDismiss";
import { AirdropQualifyRulesPreview } from "@/components/airdrops/AirdropQualifyRules";
import { AirdropSocialTasksPreview } from "@/components/airdrops/AirdropSocialTasks";
import type { AirdropSocialTaskInput } from "@/lib/airdrop-rules";

type AirdropCreateConfirmModalProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  title: string;
  description: string;
  linkedToken: TokenListItem | null;
  rewardAmountLabel: string;
  /** When set, shown as primary USD; rewardAmountLabel may still be asset for fallback. */
  rewardUsdSecondary?: string | null;
  isBnbReward: boolean;
  rewardToken: TokenListItem | null;
  qualifyLabel: string;
  minHoldTokens: string;
  minBuyBnb: string;
  minBuyUsdLabel?: string | null;
  holdUsdLabel?: string | null;
  socialTasks: AirdropSocialTaskInput[];
  createFeeLabel: string;
  feeExempt: boolean;
  totalBnbLabel: string;
  submitPhase: "submitting" | "confirming" | null;
  submitDetail: string | null;
  submitLabel: string;
  onClose: () => void;
  onConfirm: () => void;
};

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="airdrop-create-confirm-row">
      <dt className="airdrop-create-confirm-row__label text-caption text-pump-muted">{label}</dt>
      <dd className="airdrop-create-confirm-row__value min-w-0 text-right text-body-sm text-pump-text">
        {children}
      </dd>
    </div>
  );
}

export function AirdropCreateConfirmModal({
  open,
  loading,
  error,
  title,
  description,
  linkedToken,
  rewardAmountLabel,
  rewardUsdSecondary = null,
  isBnbReward,
  rewardToken,
  qualifyLabel,
  minHoldTokens,
  minBuyBnb,
  minBuyUsdLabel = null,
  holdUsdLabel = null,
  socialTasks,
  createFeeLabel,
  feeExempt,
  totalBnbLabel,
  submitPhase,
  submitDetail,
  submitLabel,
  onClose,
  onConfirm,
}: AirdropCreateConfirmModalProps) {
  const handleClose = useMobileModalClose(onClose);
  const { panelRef, sheetDragProps, resetDrag } = useMobileSheetDragDismiss(handleClose);

  useMobileModalScrollLock(open);

  useEffect(() => {
    if (open) return;
    resetDrag();
  }, [open, resetDrag]);

  if (!open) return null;

  const busy = loading || submitPhase !== null;

  return (
    <ModalPortal open={open}>
      <>
        <button
          type="button"
          className="modal-backdrop modal-backdrop-dismiss z-[120] cursor-default"
          aria-label="Close"
          onClick={handleClose}
        />
        <div className="modal-sheet-host z-[121]" role="presentation">
          <div
            ref={panelRef}
            className="airdrop-create-confirm-modal modal-panel modal-sheet-panel max-w-md select-none rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:border-x sm:border-b sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="airdrop-create-confirm-title"
            {...sheetDragProps}
          >
            <div
              className="trade-confirm-modal__grip mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-pump-border/45 sm:hidden"
              aria-hidden
            />

            <h2 id="airdrop-create-confirm-title" className="text-h3 font-semibold text-pump-text">
              Create airdrop?
            </h2>
            <p className="mt-1 text-caption text-pump-muted">
              Funds lock on-chain until qualify ends. TOP 100 wallets split the pool.
            </p>

            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-pump-border/20 bg-pump-surface/40 p-3">
              {linkedToken ? (
                <TokenAvatar
                  address={linkedToken.address}
                  symbol={linkedToken.symbol}
                  logoUrl={linkedToken.logoUrl}
                  size={40}
                  shape="rounded"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-pump-border/30 bg-pump-surface/40 text-caption text-pump-muted">
                  ?
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-body-sm font-semibold text-pump-text">{title}</p>
                {linkedToken ? (
                  <p className="mt-0.5 inline-flex flex-wrap items-center gap-1 text-caption text-pump-muted">
                    Pool
                    <TokenAssetChip
                      address={linkedToken.address}
                      symbol={linkedToken.symbol}
                      logoUrl={linkedToken.logoUrl}
                      size={14}
                    />
                  </p>
                ) : null}
              </div>
            </div>

            {description.trim() ? (
              <p className="mt-2 text-caption leading-snug text-pump-muted line-clamp-3">
                {description.trim()}
              </p>
            ) : null}

            <dl className="mt-4 space-y-2.5 border-t border-pump-border/15 pt-4">
              <SummaryRow label="Reward pool">
                {rewardUsdSecondary ? (
                  <div className="text-right">
                    <p className="financial-value text-body-sm font-medium tabular-nums text-pump-text">
                      {rewardAmountLabel}
                    </p>
                    <p className="text-caption text-pump-muted">{rewardUsdSecondary}</p>
                  </div>
                ) : (
                  <RewardAmountDisplay
                    amount={rewardAmountLabel}
                    isBnb={isBnbReward}
                    token={rewardToken}
                    amountClassName="financial-value text-body-sm font-medium tabular-nums text-pump-text"
                    logoSize={16}
                  />
                )}
              </SummaryRow>
              <SummaryRow label="Qualify window">
                <span className="financial-value">{qualifyLabel}</span>
              </SummaryRow>
              <SummaryRow label="Rules">
                <AirdropQualifyRulesPreview
                  linkedToken={linkedToken}
                  minHoldTokens={minHoldTokens}
                  minBuyBnb={minBuyBnb}
                  minBuyUsdLabel={minBuyUsdLabel}
                  holdUsdLabel={holdUsdLabel}
                />
              </SummaryRow>
              <SummaryRow label="Create fee">
                {feeExempt ? (
                  <span className="text-caption font-medium text-pump-accent">Free (exempt)</span>
                ) : (
                  <BnbAmountDisplay amount={createFeeLabel} logoSize={16} />
                )}
              </SummaryRow>
              <SummaryRow label={`Total ${NATIVE_SYMBOL}`}>
                <BnbAmountDisplay
                  amount={totalBnbLabel}
                  logoSize={18}
                  amountClassName="financial-value font-semibold tabular-nums text-pump-text"
                />
              </SummaryRow>
            </dl>

            <AirdropSocialTasksPreview tasks={socialTasks} />

            {error ? (
              <div className="notice-error mt-3 px-3 py-2 text-caption" role="alert">
                {error}
              </div>
            ) : null}

            {submitPhase && submitDetail ? (
              <div className="mt-3">
                <FormExecutionStatus phase={submitPhase} detail={submitDetail} />
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2" data-sheet-drag-lock>
              <button
                type="button"
                onClick={handleClose}
                className="secondary-button w-full"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`primary-button flex w-full items-center justify-center gap-2${busy ? " form-submit-button--loading" : ""}`}
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? (
                  <>
                    <span className="trade-submit-spinner" aria-hidden />
                    <span>{submitLabel}</span>
                  </>
                ) : (
                  "Confirm & create"
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}
