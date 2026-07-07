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
  const permissionBlocked = status.permission === "denied";
  const isIos = status.platform === "ios";

  return (
    <div className={className}>
      <div className="wallet-account-panel__menu-item wallet-account-panel__menu-item--static !items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-body-sm font-medium text-pump-text">Push notifications</p>
            {!status.needsInstall && !permissionBlocked ? (
              <span
                className={`rounded-full px-2 py-0.5 text-caption ${
                  enabled
                    ? "bg-pump-accent/15 text-pump-accent"
                    : "bg-pump-border/20 text-pump-muted"
                }`}
              >
                {enabled ? "On" : "Off"}
              </span>
            ) : null}
          </div>
          {status.needsInstall ? (
            <p className="mt-1 text-caption text-pump-muted">
              On iPhone: Safari → Share → <strong>Add to Home Screen</strong>, then open{" "}
              <strong>Pump</strong> from the icon (not Safari) and tap Enable.
            </p>
          ) : permissionBlocked ? (
            <p className="mt-1 text-caption text-pump-danger">
              {isIos
                ? "Blocked on iPhone. Open iOS Settings → Pump → Notifications → Allow Notifications. Then reopen Pump from your Home Screen icon and tap Enable."
                : "Blocked in your browser. Open site settings → Notifications → Allow, then refresh and tap Enable."}
            </p>
          ) : (
            <p className="mt-1 text-caption text-pump-muted">
              {enabled
                ? "Enabled on this device."
                : isIos
                  ? "Tap Enable — wait up to 20 seconds. iPhone and PC each need their own setup."
                  : status.standalone
                    ? "Enable on each device you use — phone and PC have separate alerts."
                    : "Get airdrop, trade, and favorite alerts on this device."}
            </p>
          )}
          {!enabled && !status.needsInstall ? (
            <p className="mt-1 text-caption text-pump-muted/80">
              {isIos ? "Home Screen app" : "App mode"}: {status.standalone ? "Yes" : "No"}
              {" · "}
              Permission: {status.permission}
              {" · "}
              Server: {status.subscribed ? "registered" : "not registered"}
            </p>
          ) : null}
          {error ? <p className="mt-1 text-caption text-pump-danger">{error}</p> : null}
          {busy ? (
            <p className="mt-1 text-caption text-pump-muted">Setting up… may take up to 20 seconds.</p>
          ) : null}
        </div>
        {!status.needsInstall && !permissionBlocked ? (
          <button
            type="button"
            className={enabled ? "secondary-button px-3 py-1.5 text-caption" : "primary-button px-3 py-1.5 text-caption"}
            disabled={busy}
            onClick={() => void (enabled ? onDisable() : onEnable())}
          >
            {busy ? "…" : enabled ? "Disable" : "Enable"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
