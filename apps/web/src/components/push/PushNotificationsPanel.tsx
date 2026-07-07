"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPushActivityLog,
  fetchPushStatus,
  getPushActivityLog,
  getPushInfrastructureError,
  getPushInfrastructureProgress,
  getPushInfrastructureState,
  preparePushInfrastructure,
  readPushSetupDiagnostics,
  retryPreparePushInfrastructure,
  subscribePushActivityLog,
  subscribePushInfrastructureProgress,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  type PushActivityEntry,
  type PushInfrastructureProgress,
  type PushSubscribeProgress,
} from "@/lib/push/client";
import type { PushStatus } from "@/lib/push/types";

type PushNotificationsPanelProps = {
  className?: string;
};

function PushSetupProgressBar({
  label,
  percent,
  tone = "default",
}: {
  label: string;
  percent: number;
  tone?: "default" | "danger";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="min-w-0 text-caption text-pump-text">{label}</p>
        <span className="shrink-0 text-caption font-medium tabular-nums text-pump-muted">{clamped}%</span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill ${tone === "danger" ? "!bg-pump-danger" : ""}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function activityToneClass(level: PushActivityEntry["level"]): string {
  switch (level) {
    case "error":
      return "text-pump-danger";
    case "warn":
      return "text-amber-400";
    case "success":
      return "text-pump-accent";
    default:
      return "text-pump-muted";
  }
}

function PushActivityLog({
  entries,
  onClear,
}: {
  entries: readonly PushActivityEntry[];
  onClear: () => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-pump-border/25 bg-pump-border/5 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-caption font-medium text-pump-text">Activity log</p>
        <button type="button" className="text-caption text-pump-muted underline" onClick={onClear}>
          Clear
        </button>
      </div>
      <ul className="max-h-36 space-y-1 overflow-y-auto overscroll-contain">
        {entries.map((entry) => (
          <li key={entry.id} className={`text-caption leading-snug ${activityToneClass(entry.level)}`}>
            <span className="tabular-nums text-pump-muted/80">{entry.time}</span> {entry.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PushNotificationsPanel({ className = "" }: PushNotificationsPanelProps) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState<PushSubscribeProgress | null>(null);
  const [prepareProgress, setPrepareProgress] = useState<PushInfrastructureProgress>(
    getPushInfrastructureProgress
  );
  const [activityLog, setActivityLog] = useState<readonly PushActivityEntry[]>(getPushActivityLog);
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
    try {
      const next = await fetchPushStatus();
      setStatus(next);
      await refreshDiagnostics();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load push status";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [refreshDiagnostics]);

  useEffect(() => {
    void refresh();
    // Avoid re-triggering prepare on every Account modal open/close.
    // Background prepare runs from PwaProvider on app start.
    // Explicit Enable or Retry will drive the flow and surface errors.
  }, [refresh]);

  useEffect(() => subscribePushInfrastructureProgress(setPrepareProgress), []);
  useEffect(() => subscribePushActivityLog(setActivityLog), []);

  useEffect(() => {
    if (!busy) return;

    void refreshDiagnostics();
    const interval = window.setInterval(() => {
      void refreshDiagnostics();
    }, 1_500);

    return () => window.clearInterval(interval);
  }, [busy, refreshDiagnostics]);

  async function onRetrySetup() {
    setError(null);
    setBusy(true);
    try {
      await retryPreparePushInfrastructure();
      await refreshDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup retry failed");
    } finally {
      setBusy(false);
    }
  }

  async function onEnable() {
    setBusy(true);
    lastProgressRef.current = {
      step: "permission",
      label: "Enabling notifications…",
      percent: 20,
    };
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
      setError(message);
      await refreshDiagnostics();
      await refresh();
    } finally {
      setBusy(false);
      setBusyStep(null);
      lastProgressRef.current = null;
    }
  }

  async function onDisable() {
    setBusy(true);
    setBusyStep({ step: "server-save", label: "Disabling…", percent: 50 });
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

  const enabledOnThisDevice = status.subscribedOnThisDevice && status.permission === "granted";
  const permissionBlocked = status.permission === "denied";
  const isIos = status.platform === "ios";
  const setupState = getPushInfrastructureState();
  const setupError = getPushInfrastructureError();
  const preparingDevice =
    !enabledOnThisDevice &&
    !status.needsInstall &&
    !permissionBlocked &&
    !busy &&
    setupState === "preparing" &&
    prepareProgress.percent < 100;
  const prepareFailed = !enabledOnThisDevice && !busy && setupState === "error";

  return (
    <div className={className}>
      <div className="wallet-account-panel__menu-item wallet-account-panel__menu-item--static !items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-body-sm font-medium text-pump-text">Push notifications</p>
            {!status.needsInstall && !permissionBlocked ? (
              <span
                className={`rounded-full px-2 py-0.5 text-caption ${
                  enabledOnThisDevice
                    ? "bg-pump-accent/15 text-pump-accent"
                    : "bg-pump-border/20 text-pump-muted"
                }`}
              >
                {enabledOnThisDevice ? "On" : "Off"}
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
          ) : enabledOnThisDevice ? (
            <p className="mt-1 text-caption text-pump-muted">Enabled on this device.</p>
          ) : status.subscribedOnOtherDevice ? (
            <p className="mt-1 text-caption text-pump-muted">
              Alerts are active on another device (for example your PC). Tap Enable to add this{" "}
              {isIos ? "iPhone" : "device"}.
            </p>
          ) : (
            <p className="mt-1 text-caption text-pump-muted">
              {isIos
                ? "Each iPhone needs its own setup. Tap Enable once on this device."
                : status.standalone
                  ? "Enable on each device you use — phone and PC have separate alerts."
                  : "Get airdrop, trade, and favorite alerts on this device."}
            </p>
          )}
          {preparingDevice ? (
            <PushSetupProgressBar
              label={prepareProgress.label || "Preparing this device…"}
              percent={prepareProgress.percent}
            />
          ) : null}
          {prepareFailed ? (
            <>
              <PushSetupProgressBar
                label={setupError ?? "Device setup failed"}
                percent={0}
                tone="danger"
              />
              <div className="mt-2 flex flex-wrap gap-2 text-caption">
                <button
                  type="button"
                  className="text-pump-accent underline"
                  disabled={busy}
                  onClick={() => void onRetrySetup()}
                >
                  Retry background setup
                </button>
                <button
                  type="button"
                  className="text-pump-muted underline"
                  onClick={() => {
                    // One-time reload can help iOS PWA give control to the newly activated SW.
                    window.location.reload();
                  }}
                >
                  Reload page (helps iOS PWA control)
                </button>
              </div>
            </>
          ) : null}
          {busy && busyStep ? (
            <PushSetupProgressBar label={busyStep.label} percent={busyStep.percent} />
          ) : null}
          {error ? (
            <p className="mt-2 rounded-lg bg-pump-danger/10 px-2.5 py-2 text-caption text-pump-danger">
              {error}
              {diagnostics ? (
                <>
                  <br />
                  <span className="mt-1 block break-words text-pump-muted">{diagnostics}</span>
                </>
              ) : null}
            </p>
          ) : enabledOnThisDevice ? (
            <p className="mt-1 text-caption text-pump-muted/80">Registered on this device.</p>
          ) : prepareProgress.percent === 100 && setupState === "ready" && !busy ? (
            <p className="mt-1 text-caption text-pump-muted/80">Ready — tap Enable.</p>
          ) : null}

          {/* Always surface the detailed activity log during setup so errors and states are visible */}
          {activityLog.length > 0 && (
            <PushActivityLog entries={activityLog} onClear={() => clearPushActivityLog()} />
          )}
        </div>
        {!status.needsInstall && !permissionBlocked ? (
          <button
            type="button"
            className={
              enabledOnThisDevice
                ? "secondary-button px-3 py-1.5 text-caption"
                : "primary-button px-3 py-1.5 text-caption"
            }
            disabled={busy}
            onClick={() => void (enabledOnThisDevice ? onDisable() : onEnable())}
          >
            {busy ? "…" : enabledOnThisDevice ? "Disable" : "Enable"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
