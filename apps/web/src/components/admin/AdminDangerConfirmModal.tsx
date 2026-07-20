"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PumpIcon, faAlertTriangle } from "@/lib/icons";
import { ADMIN_COPY } from "@/lib/admin/copy";
import { AdminBtn } from "@/components/admin/AdminChrome";
import { ModalPortal } from "@/components/ui/ModalPortal";

export type AdminDangerConfirmModalProps = {
  open: boolean;
  title: string;
  consequence: string;
  details?: ReactNode;
  /** Exact string the operator must type (case-sensitive). */
  phrase: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Two-step confirm for sweeps / irreversible ops:
 * 1) Review consequence → Continue
 * 2) Type phrase → Confirm enabled
 */
export function AdminDangerConfirmModal({
  open,
  title,
  consequence,
  details,
  phrase,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: AdminDangerConfirmModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setTyped("");
  }, [open, phrase, title]);

  if (!open) return null;

  const phraseOk = typed === phrase;

  return (
    <ModalPortal open={open}>
      <div
        className="modal-backdrop modal-backdrop-shell z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-danger-confirm-title"
        onClick={() => {
          if (!busy) onCancel();
        }}
      >
        <div
          className="admin-page admin-modal admin-danger-confirm-modal relative z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="admin-modal-head">
            <h2 id="admin-danger-confirm-title" className="admin-modal-title">
              {title}
            </h2>
            <AdminBtn size="sm" onClick={onCancel} disabled={busy}>
              {ADMIN_COPY.actions.close}
            </AdminBtn>
          </div>

          <div className="admin-modal-body">
            <div className="admin-danger-confirm-warning">
              <PumpIcon icon={faAlertTriangle} className="h-4 w-4 shrink-0" />
              <p>{consequence}</p>
            </div>

            {details ? <div className="admin-danger-confirm-details">{details}</div> : null}

            <p className="admin-meta admin-danger-confirm-step">
              {ADMIN_COPY.dangerConfirm.stepLabel.replace("{step}", String(step)).replace("{total}", "2")}
            </p>

            {step === 1 ? (
              <div className="admin-danger-confirm-actions">
                <AdminBtn onClick={onCancel} disabled={busy}>
                  {ADMIN_COPY.dangerConfirm.cancel}
                </AdminBtn>
                <AdminBtn
                  primary
                  onClick={() => {
                    setStep(2);
                    setTyped("");
                  }}
                  disabled={busy}
                >
                  {ADMIN_COPY.dangerConfirm.continue}
                </AdminBtn>
              </div>
            ) : (
              <>
                <label className="admin-field admin-danger-confirm-field">
                  <span className="admin-field-label">
                    {ADMIN_COPY.dangerConfirm.typeLabel.replace("{phrase}", phrase)}
                  </span>
                  <input
                    className="admin-input admin-num"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={phrase}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    disabled={busy}
                  />
                </label>
                <div className="admin-danger-confirm-actions">
                  <AdminBtn
                    onClick={() => {
                      setStep(1);
                      setTyped("");
                    }}
                    disabled={busy}
                  >
                    {ADMIN_COPY.dangerConfirm.back}
                  </AdminBtn>
                  <AdminBtn
                    danger
                    disabled={!phraseOk || busy}
                    onClick={onConfirm}
                  >
                    {busy ? ADMIN_COPY.dangerConfirm.working : confirmLabel}
                  </AdminBtn>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
