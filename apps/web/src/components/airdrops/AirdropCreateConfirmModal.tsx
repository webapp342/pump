"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import {
  BnbAmountDisplay,
  RewardAmountDisplay,
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

type AirdropCreateConfirmModalProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  title: string;
  linkedToken: TokenListItem | null;
  rewardAmountLabel: string;
  /** Asset amount line when rewardAmountLabel is USD-primary. */
  rewardUsdSecondary?: string | null;
  isBnbReward: boolean;
  rewardToken: TokenListItem | null;
  createFeeLabel: string;
  feeExempt: boolean;
  totalBnbLabel: string;
  submitPhase: "submitting" | "confirming" | null;
  submitDetail: string | null;
  submitLabel: string;
  onClose: () => void;
  onConfirm: () => void;
};

function ConfirmRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="trade-confirm-row">
      <dt className="trade-confirm-row__label text-caption text-pump-muted">{label}</dt>
      <dd className="trade-confirm-row__content">{children}</dd>
    </div>
  );
}

export function AirdropCreateConfirmModal({
  open,
  loading,
  error,
  title,
  linkedToken,
  rewardAmountLabel,
  rewardUsdSecondary = null,
  isBnbReward,
  rewardToken,
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
  const showCreateFee = !feeExempt;

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
            className="airdrop-create-confirm-modal trade-confirm-modal modal-panel modal-sheet-panel max-w-md select-none rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:border-x sm:border-b sm:p-5"
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

            <div className="mt-3 flex min-w-0 items-center gap-2.5">
              {linkedToken ? (
                <TokenAvatar
                  address={linkedToken.address}
                  symbol={linkedToken.symbol}
                  logoUrl={linkedToken.logoUrl}
                  size={28}
                  shape="rounded"
                  className="!ring-0"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-pump-border/30 bg-pump-surface/40 text-caption text-pump-muted">
                  ?
                </div>
              )}
              <p className="min-w-0 truncate text-body-sm font-medium text-pump-text">{title}</p>
            </div>

            <dl className="mt-4 space-y-3 border-t border-pump-border/15 pt-4">
              <ConfirmRow label="Reward pool">
                {rewardUsdSecondary ? (
                  <div className="trade-confirm-row__value">
                    <span className="financial-value text-body-sm font-semibold tabular-nums text-pump-text">
                      {rewardAmountLabel}
                    </span>
                    <span className="trade-confirm-row__usd financial-value text-caption text-pump-muted">
                      {rewardUsdSecondary}
                    </span>
                  </div>
                ) : (
                  <RewardAmountDisplay
                    amount={rewardAmountLabel}
                    isBnb={isBnbReward}
                    token={rewardToken}
                    amountClassName="financial-value text-body-sm font-semibold tabular-nums text-pump-text"
                    logoSize={18}
                  />
                )}
              </ConfirmRow>

              {showCreateFee ? (
                <ConfirmRow label="Create fee">
                  <BnbAmountDisplay
                    amount={createFeeLabel}
                    logoSize={18}
                    amountClassName="financial-value text-body-sm font-semibold tabular-nums text-pump-text"
                  />
                </ConfirmRow>
              ) : null}

              <ConfirmRow label={`Debit ${NATIVE_SYMBOL}`}>
                <BnbAmountDisplay
                  amount={totalBnbLabel}
                  logoSize={18}
                  amountClassName="financial-value text-body-sm font-semibold tabular-nums text-pump-text"
                />
              </ConfirmRow>
            </dl>

            <p className="mt-3 text-caption leading-snug text-pump-muted">
              {isBnbReward
                ? "Reward pool locks on-chain until the qualify window ends."
                : `Token pool is approved separately. Create fee and gas use ${NATIVE_SYMBOL}.`}
            </p>

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
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    </ModalPortal>
  );
}
