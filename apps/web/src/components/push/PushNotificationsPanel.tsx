"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPushStatus,
  isPushApiSupported,
  PushReloadPendingError,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  updatePushPreferencesClient,
  type PushSubscribeProgress,
} from "@/lib/push/client";
import type { PushStatus } from "@/lib/push/types";
import { PumpIcon, faBell } from "@/lib/icons";

type PushNotificationsPanelProps = {
  className?: string;
  /** settings = single On/Off toggle row (mobile Settings sheet). */
  variant?: "default" | "settings";
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

export function PushNotificationsPanel({
  className = "",
  variant = "default",
}: PushNotificationsPanelProps) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [busyStep, setBusyStep] = useState<PushSubscribeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastProgressRef = useRef<PushSubscribeProgress | null>(null);
  const supported = isPushApiSupported();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await fetchPushStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load push status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supported) return;
    void refresh();
  }, [refresh, supported]);

  async function onEnable() {
    setBusy(true);
    setError(null);
    lastProgressRef.current = { step: "permission", label: "Starting…", percent: 10 };
    setBusyStep(lastProgressRef.current);
    try {
      await subscribeToPushNotifications({
        onProgress: (progress) => {
          lastProgressRef.current = progress;
          setBusyStep(progress);
        },
      });
      await refresh();
    } catch (err) {
      if (err instanceof PushReloadPendingError) return;
      setError(err instanceof Error ? err.message : "Could not enable notifications");
      setBusyStep(null);
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
      setStatus((current) => (current ? { ...current, preferences } : current));
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

  async function onTogglePush(next: boolean) {
    if (next) await onEnable();
    else await onDisable();
  }

  if (!supported) {
    return null;
  }

  if (loading && !status) {
    return (
      <div className={`wallet-account-panel__nav-row wallet-account-panel__nav-row--static ${className}`.trim()}>
        <span className="wallet-account-panel__nav-label">
          <PumpIcon icon={faBell} className="wallet-account-panel__nav-icon" aria-hidden />
          Push notifications
        </span>
        <span className="text-caption text-pump-muted">…</span>
      </div>
    );
  }

  if (!status?.supported) {
    return (
      <div className={`wallet-account-panel__nav-row wallet-account-panel__nav-row--static ${className}`.trim()}>
        <span className="wallet-account-panel__nav-label">
          <PumpIcon icon={faBell} className="wallet-account-panel__nav-icon" aria-hidden />
          Push notifications
        </span>
        <span className="text-caption text-pump-muted">Unsupported</span>
      </div>
    );
  }

  const enabledOnThisDevice = status.subscribedOnThisDevice && status.permission === "granted";
  const permissionBlocked = status.permission === "denied";
  const toggleDisabled = busy || permissionBlocked || status.needsInstall;

  if (variant === "settings") {
    return (
      <div className={`wallet-account-panel__push ${className}`.trim()}>
        <label className="wallet-account-panel__nav-row wallet-account-panel__nav-row--static">
          <span className="wallet-account-panel__nav-label">
            <PumpIcon icon={faBell} active={enabledOnThisDevice} className="wallet-account-panel__nav-icon" aria-hidden />
            Push notifications
          </span>
          <span className="wallet-account-panel__switch">
            <input
              type="checkbox"
              className="wallet-account-panel__switch-input"
              checked={enabledOnThisDevice}
              disabled={toggleDisabled}
              onChange={(event) => {
                void onTogglePush(event.target.checked);
              }}
              aria-label={
                enabledOnThisDevice ? "Disable push notifications" : "Enable push notifications"
              }
            />
            <span className="wallet-account-panel__switch-track" aria-hidden />
          </span>
        </label>
        {status.needsInstall ? (
          <p className="wallet-account-panel__settings-hint">Add to Home Screen, then turn on.</p>
        ) : permissionBlocked ? (
          <p className="wallet-account-panel__settings-hint wallet-account-panel__settings-hint--danger">
            Blocked in system settings.
          </p>
        ) : null}
        {busy && busyStep ? (
          <div className="wallet-account-panel__settings-inset pb-2">
            <PushSetupProgressBar label={busyStep.label} percent={busyStep.percent} />
          </div>
        ) : null}
        {error ? (
          <p className="wallet-account-panel__push-error wallet-account-panel__settings-inset pb-2">{error}</p>
        ) : null}
        {enabledOnThisDevice ? (
          <label className="wallet-account-panel__nav-row wallet-account-panel__nav-row--static wallet-account-panel__push-pref">
            <span className="min-w-0 flex-1 text-body-sm text-pump-text">Callouts from people you follow</span>
            <span className="wallet-account-panel__switch">
              <input
                type="checkbox"
                className="wallet-account-panel__switch-input"
                checked={status.preferences.followerAnnouncements}
                disabled={busy || prefsBusy}
                onChange={(event) => {
                  void onToggleFollowerAnnouncements(event.target.checked);
                }}
              />
              <span className="wallet-account-panel__switch-track" aria-hidden />
            </span>
          </label>
        ) : null}
      </div>
    );
  }

  const isIos = status.platform === "ios";
  const hint = status.needsInstall
    ? "Add to Home Screen, then Enable once."
    : permissionBlocked
      ? "Blocked in system settings."
      : enabledOnThisDevice
        ? "Enabled on this device."
        : status.subscribedOnOtherDevice
          ? `Enable to add this ${isIos ? "iPhone" : "device"}.`
          : "Enable once per device.";

  return (
    <div className={`wallet-account-panel__push ${className}`.trim()}>
      <div className="wallet-account-panel__nav-row wallet-account-panel__nav-row--static wallet-account-panel__nav-row--push">
        <div className="wallet-account-panel__push-copy min-w-0 flex-1">
          <div className="wallet-account-panel__push-title">
            <span className="wallet-account-panel__nav-label">
              <PumpIcon icon={faBell} active={enabledOnThisDevice} className="wallet-account-panel__nav-icon" aria-hidden />
              Push notifications
            </span>
          </div>
          <p
            className={`wallet-account-panel__push-hint${
              permissionBlocked ? " wallet-account-panel__push-hint--danger" : ""
            }`}
          >
            {hint}
          </p>
          {busy && busyStep ? <PushSetupProgressBar label={busyStep.label} percent={busyStep.percent} /> : null}
          {error ? <p className="wallet-account-panel__push-error">{error}</p> : null}
        </div>

        {!status.needsInstall && !permissionBlocked ? (
          <label className="wallet-account-panel__switch">
            <span className="sr-only">
              {enabledOnThisDevice ? "Disable push notifications" : "Enable push notifications"}
            </span>
            <input
              type="checkbox"
              className="wallet-account-panel__switch-input"
              checked={enabledOnThisDevice}
              disabled={busy}
              onChange={(event) => {
                void onTogglePush(event.target.checked);
              }}
            />
            <span className="wallet-account-panel__switch-track" aria-hidden />
          </label>
        ) : null}
      </div>

      {enabledOnThisDevice ? (
        <label className="wallet-account-panel__nav-row wallet-account-panel__nav-row--static wallet-account-panel__push-pref">
          <span className="min-w-0 flex-1 text-body-sm text-pump-text">Callouts from people you follow</span>
          <input
            type="checkbox"
            className="wallet-account-panel__push-switch"
            checked={status.preferences.followerAnnouncements}
            disabled={busy || prefsBusy}
            onChange={(event) => {
              void onToggleFollowerAnnouncements(event.target.checked);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
