"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPushStatus,
  readPushSetupDiagnostics,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  type PushSubscribeProgress,
} from "@/lib/push/client";
import type { PushStatus } from "@/lib/push/types";

type PushNotificationsPanelProps = {
  className?: string;
};

export function PushNotificationsPanel({ className = "" }: PushNotificationsPanelProps) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState<PushSubscribeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const lastProgressRef = useRef<PushSubscribeProgress | null>(null);

  const refreshDiagnostics = useCallback(async () => {
    try {
      const next = await readPushSetupDiagnostics();
      setDiagnostics(next);
    } catch {
      setDiagnostics("Could not read device diagnostics");
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPushStatus();
      setStatus(next);
      await refreshDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load push status");
    } finally {
      setLoading(false);
    }
  }, [refreshDiagnostics]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!busy) return;

    void refreshDiagnostics();
    const interval = window.setInterval(() => {
      void refreshDiagnostics();
    }, 2_000);

    return () => window.clearInterval(interval);
  }, [busy, refreshDiagnostics]);

  async function onEnable() {
    setBusy(true);
    lastProgressRef.current = { step: "permission", label: "Starting…" };
    setBusyStep(lastProgressRef.current);
    setError(null);
    try {
      const next = await subscribeToPushNotifications({
        onProgress: (progress) => {
          lastProgressRef.current = progress;
          setBusyStep(progress);
        },
      });
      setStatus(next);
      await refreshDiagnostics();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not enable notifications";
      const step = lastProgressRef.current?.label ?? "Enable";
      setError(`Failed during: ${step} ${message}`);
      await refreshDiagnostics();
    } finally {
      setBusy(false);
      setBusyStep(null);
      lastProgressRef.current = null;
    }
  }

  async function onDisable() {
    setBusy(true);
    setBusyStep({ step: "server-save", label: "Disabling notifications…" });
    setError(null);
    try {
      await unsubscribeFromPushNotifications();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable notifications");
    } finally {
      setBusy(false);
      setBusyStep(null);
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
  const waitHint = isIos ? "up to 60 seconds" : "up to 30 seconds";

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
                  ? `Tap Enable and wait ${waitHint}. iPhone and PC each need their own setup.`
                  : status.standalone
                    ? "Enable on each device you use — phone and PC have separate alerts."
                    : "Get airdrop, trade, and favorite alerts on this device."}
            </p>
          )}
          <p className="mt-1 text-caption text-pump-muted/80">
            Server: {status.subscribed ? "registered" : "not registered"}
            {diagnostics ? (
              <>
                <br />
                <span className="break-words">{diagnostics}</span>
              </>
            ) : null}
          </p>
          {enabled && isIos ? (
            <p className="mt-1 text-caption text-pump-muted">
              iPhone only shows alerts when Pump is in the background. Close Pump or lock the
              screen, then trigger a trade.
            </p>
          ) : null}
          {busy && busyStep ? (
            <p className="mt-2 rounded-lg bg-pump-border/10 px-2.5 py-2 text-caption text-pump-text">
              <span className="font-medium">Working:</span> {busyStep.label}
              <br />
              <span className="text-pump-muted">Please wait ({waitHint}). Do not close Pump.</span>
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 rounded-lg bg-pump-danger/10 px-2.5 py-2 text-caption text-pump-danger">
              {error}
            </p>
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
