"use client";

import { PumpIcon, faAlertTriangle } from "@/lib/icons";
import { useState } from "react";
import { adminFetch, readAdminJson } from "@/lib/admin-api-client";
import { ADMIN_COPY } from "@/lib/admin/copy";
import {
  WIPE_DATA_CONFIRMATION_PHRASE,
  WIPE_PRESERVED_TABLES,
  WIPE_TRUNCATED_TABLES,
} from "@/lib/admin/wipe-data.constants";
import { AdminAlert, AdminBlock, AdminBtn } from "@/components/admin/AdminChrome";

type AdminDataWipeCardProps = {
  onWiped?: () => void;
};

export function AdminDataWipeCard({ onWiped }: AdminDataWipeCardProps) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const phraseOk = confirmation === WIPE_DATA_CONFIRMATION_PHRASE;

  async function onWipe() {
    if (!phraseOk) return;
    if (!window.confirm(ADMIN_COPY.wipe.finalConfirm)) return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await adminFetch("/api/admin/wipe-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const json = await readAdminJson<{
        data?: {
          wipedAt: string;
          indexerSeed?: {
            ok: boolean;
            stateKey?: string;
            resyncFromBlock?: string;
            reason?: string;
          };
          indexerRestart?: { scheduled?: boolean };
          warnings?: string[];
        };
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(json.error ?? "Wipe failed");

      setConfirmation("");
      let message = ADMIN_COPY.wipe.success;
      const seed = json.data?.indexerSeed;
      if (seed?.ok && seed.resyncFromBlock) {
        message += ` Indexer \`${seed.stateKey ?? "?"}\` from block ${seed.resyncFromBlock}.`;
      } else if (seed && !seed.ok && seed.reason) {
        message += ` ${seed.reason}`;
      }
      const extraWarnings = json.data?.warnings?.filter(Boolean) ?? [];
      if (extraWarnings.length > 0) {
        message += ` ${extraWarnings.join(" ")}`;
      }
      setSuccess(message);
      onWiped?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wipe failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminBlock title={ADMIN_COPY.wipe.title} description={ADMIN_COPY.wipe.description} padded>
      <div className="admin-wipe-zone">
        <div className="admin-wipe-warning">
          <PumpIcon icon={faAlertTriangle} className="h-4 w-4" />
          <p>{ADMIN_COPY.wipe.warning}</p>
        </div>

        <div className="admin-wipe-columns">
          <div>
            <p className="admin-wipe-list-title">{ADMIN_COPY.wipe.preservedTitle}</p>
            <ul className="admin-wipe-list admin-wipe-list--ok">
              {WIPE_PRESERVED_TABLES.map((table) => (
                <li key={table}>{table}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="admin-wipe-list-title">{ADMIN_COPY.wipe.wipedTitle}</p>
            <ul className="admin-wipe-list admin-wipe-list--danger">
              {WIPE_TRUNCATED_TABLES.map((table) => (
                <li key={table}>{table}</li>
              ))}
            </ul>
          </div>
        </div>

        <label className="admin-wipe-confirm">
          <span className="admin-field-label">{ADMIN_COPY.wipe.confirmLabel}</span>
          <input
            className="admin-input admin-wipe-input"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={WIPE_DATA_CONFIRMATION_PHRASE}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {error ? <AdminAlert>{error}</AdminAlert> : null}
        {success ? <p className="admin-wipe-success">{success}</p> : null}

        <AdminBtn danger disabled={!phraseOk || busy} onClick={() => void onWipe()}>
          {busy ? ADMIN_COPY.wipe.running : ADMIN_COPY.wipe.button}
        </AdminBtn>
      </div>
    </AdminBlock>
  );
}
