"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPushActivityLog,
  fetchPushStatus,
  getPushActivityLog,
  isPushApiSupported,
  PushReloadPendingError,
  readPushSetupDiagnostics,
  subscribePushActivityLog,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  updatePushPreferencesClient,
  type PushActivityEntry,
  type PushSubscribeProgress,
} from "@/lib/push/client";
import type { PushStatus } from "@/lib/push/types";

type PushNotificationsPanelProps = {
  className?: string;
};

function PushSetupProgressBar({ label, percent }: { label: string; percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="min-w-0 text-caption text-pump-text">{label}</p>
        <span className="shrink-0 text-caption font-medium tabular-nums text-pump-muted">{clamped}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
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
      <ul className="max-h-40 space-y-1 overflow-y-auto overscroll-contain">
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
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [busyStep, setBusyStep] = useState<PushSubscribeProgress | null>(null);
  const [activityLog, setActivityLog] = useState<readonly PushActivityEntry[]>(getPushActivityLog);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const lastProgressRef = useRef<PushSubscribeProgress | null>(null);
  const supported = isPushApiSupported();

  const refreshDiagnostics = useCallback(async () => {
    try {
      setDiagnostics(await readPushSetupDiagnostics());
    } catch {
      setDiagnostics(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await fetchPushStatus());
      await refreshDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load push status");
    } finally {
      setLoading(false);
    }
  }, [refreshDiagnostics]);

  useEffect(() => {
    if (!supported) return;
    void refresh();
  }, [refresh, supported]);

  useEffect(() => subscribePushActivityLog(setActivityLog), []);

  async function onEnable() {
    setBusy(true);
    setError(null);
    lastProgressRef.current = { step: "permission", label: "Starting…", percent: 10 };
    setBusyStep(lastProgressRef.current);

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
      if (err instanceof PushReloadPendingError) return;
      const message = err instanceof Error ? err.message : "Could not enable notifications";
      setError(message);
      await refreshDiagnostics();
      await refresh();
    } finally {
      setBusy(false);
      setBusyStep(null);
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

  async function onToggleFollowerAnnouncements(next: boolean) {
    if (!status) return;
    setPrefsBusy(true);
    setError(null);
    const previous = status.preferences.followerAnnouncements;
    setStatus({
      ...status,
      preferences: { ...status.preferences, followerAnnouncements: next },
    });
    try {
      const preferences = await updatePushPreferencesClient({ followerAnnouncements: next });
      setStatus((current) =>
        current ? { ...current, preferences } : current
      );
    } catch (err) {
      setStatus((current) =>
        current
          ? {
              ...current,
              preferences: { ...current.preferences, followerAnnouncements: previous },
            }
          : current
      );
      setError(err instanceof Error ? err.message : "Could not update callout alerts");
    } finally {
      setPrefsBusy(false);
    }
  }

  if (!supported) {
    return null;
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
        <p className="text-caption text-pump-muted">Push notifications are not supported in this browser.</p>
      </div>
    );
  }

  const enabledOnThisDevice = status.subscribedOnThisDevice && status.permission === "granted";
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
              iPhone: Safari → Share → <strong>Add to Home Screen</strong>, open <strong>Pump</strong> from the icon,
              then tap Enable once.
            </p>
          ) : permissionBlocked ? (
            <p className="mt-1 text-caption text-pump-danger">
              Notifications blocked. Allow in system settings, then tap Enable again.
            </p>
          ) : enabledOnThisDevice ? (
            <p className="mt-1 text-caption text-pump-muted">Enabled on this device.</p>
          ) : status.subscribedOnOtherDevice ? (
            <p className="mt-1 text-caption text-pump-muted">
              Your PC has alerts. Tap Enable once to add this {isIos ? "iPhone" : "device"} — first time
              takes ~10 seconds on iPhone.
            </p>
          ) : isIos ? (
            <p className="mt-1 text-caption text-pump-muted">
              Tap Enable once. iPhone installs a lightweight alerts worker (one-time, ~10 sec).
            </p>
          ) : (
            <p className="mt-1 text-caption text-pump-muted">
              Tap Enable once per device. After that, alerts work without repeating setup.
            </p>
          )}

          {enabledOnThisDevice ? (
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0 text-caption text-pump-muted">
                Callouts from people you follow
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--pump-accent))]"
                checked={status.preferences.followerAnnouncements}
                disabled={busy || prefsBusy}
                onChange={(event) => {
                  void onToggleFollowerAnnouncements(event.target.checked);
                }}
              />
            </label>
          ) : null}

          {busy && busyStep ? <PushSetupProgressBar label={busyStep.label} percent={busyStep.percent} /> : null}

          {error ? (
            <div className="mt-2 rounded-lg bg-pump-danger/10 px-2.5 py-2 text-caption text-pump-danger">
              {error}
            </div>
          ) : null}

          {diagnostics ? (
            <p className="mt-2 text-caption text-pump-muted/80 break-words">{diagnostics}</p>
          ) : null}

          <PushActivityLog entries={activityLog} onClear={() => clearPushActivityLog()} />
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
