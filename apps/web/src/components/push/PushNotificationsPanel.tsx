"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchPushStatus,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push/client";
import type { PushStatus } from "@/lib/push/types";

type PushNotificationsPanelProps = {
  className?: string;
};

export function PushNotificationsPanel({ className = "" }: PushNotificationsPanelProps) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPushStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load push status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onEnable() {
    setBusy(true);
    setError(null);
    try {
      const next = await subscribeToPushNotifications();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPushNotifications();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable notifications");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !status) {
    return (
      <div className={className}>
        <p className="text-caption text-pump-muted">Loading notifications…</p>
      </div>
    );
  }

  if (!status?.supported) {
    return (
      <div className={className}>
        <p className="text-caption text-pump-muted">
          Push notifications are not supported in this browser.
        </p>
      </div>
    );
  }

  const enabled = status.subscribed && status.permission === "granted";

  return (
    <div className={className}>
      <div className="wallet-account-panel__menu-item wallet-account-panel__menu-item--static !items-start">
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium text-pump-text">Push notifications</p>
          {status.needsInstall ? (
            <p className="mt-1 text-caption text-pump-muted">
              On iPhone, add Pump to your Home Screen in Safari, then open the app from the icon
              before enabling notifications.
            </p>
          ) : (
            <p className="mt-1 text-caption text-pump-muted">
              {enabled
                ? "Enabled for this device."
                : "Get airdrop, trade, and favorite alerts on this device."}
            </p>
          )}
          {error ? <p className="mt-1 text-caption text-pump-danger">{error}</p> : null}
        </div>
        {!status.needsInstall ? (
          <button
            type="button"
            className={enabled ? "secondary-button px-3 py-1.5 text-caption" : "primary-button px-3 py-1.5 text-caption"}
            disabled={busy}
            onClick={() => void (enabled ? onDisable() : onEnable())}
          >
            {busy ? "…" : enabled ? "Off" : "On"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
