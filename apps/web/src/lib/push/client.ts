"use client";

import type { PushDisplayMode, PushPlatform, PushStatus, PushSubscriptionPayload } from "@/lib/push/types";
import { detectPushPlatform, iosPushNeedsInstall } from "@/lib/push/platform";

const PUSH_ENDPOINT_STORAGE_KEY = "pump_push_endpoint";
const SERVICE_WORKER_URL = "/serwist/sw.js";

const SW_WAIT_MS = {
  desktop: 12_000,
  android: 20_000,
  ios: 30_000,
  unknown: 15_000,
} as const;

export function isPushApiSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function getClientPushPlatform(): PushPlatform {
  if (typeof navigator === "undefined") return "unknown";
  return detectPushPlatform(navigator.userAgent);
}

export function getClientPushDisplayMode(): PushDisplayMode {
  return isStandaloneDisplayMode() ? "standalone" : "browser";
}

export function readStoredPushEndpoint(): string | null {
  try {
    return localStorage.getItem(PUSH_ENDPOINT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storePushEndpoint(endpoint: string): void {
  try {
    localStorage.setItem(PUSH_ENDPOINT_STORAGE_KEY, endpoint);
  } catch {
    // ignore
  }
}

function clearStoredPushEndpoint(): void {
  try {
    localStorage.removeItem(PUSH_ENDPOINT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function getVapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!key) {
    throw new Error("Push is not configured on this environment");
  }
  return key;
}

function swWaitMs(): number {
  const platform = getClientPushPlatform();
  if (platform === "ios") return SW_WAIT_MS.ios;
  if (platform === "android") return SW_WAIT_MS.android;
  if (platform === "desktop") return SW_WAIT_MS.desktop;
  return SW_WAIT_MS.unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withPushTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    void promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(message));
      }
    );
  });
}

export type PushSubscribeProgress = {
  step: "permission" | "service-worker" | "device-register" | "server-save" | "done";
  label: string;
  percent: number;
};

const SUBSCRIBE_STEP_PERCENT: Record<PushSubscribeProgress["step"], number> = {
  permission: 20,
  "service-worker": 50,
  "device-register": 78,
  "server-save": 92,
  done: 100,
};

export type PushSubscribeOptions = {
  onProgress?: (progress: PushSubscribeProgress) => void;
};

export type PushActivityLevel = "info" | "success" | "warn" | "error";

export type PushActivityEntry = {
  id: string;
  time: string;
  level: PushActivityLevel;
  message: string;
};

const PUSH_ACTIVITY_MAX = 40;
let pushActivitySeq = 0;
let pushActivityEntries: PushActivityEntry[] = [];
const pushActivityListeners = new Set<(entries: readonly PushActivityEntry[]) => void>();

function formatActivityTime(date = new Date()): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function emitPushActivity(): void {
  for (const listener of pushActivityListeners) {
    listener(pushActivityEntries);
  }
}

export function getPushActivityLog(): readonly PushActivityEntry[] {
  return pushActivityEntries;
}

export function subscribePushActivityLog(
  listener: (entries: readonly PushActivityEntry[]) => void
): () => void {
  pushActivityListeners.add(listener);
  listener(pushActivityEntries);
  return () => pushActivityListeners.delete(listener);
}

export function clearPushActivityLog(): void {
  pushActivityEntries = [];
  emitPushActivity();
}

export function pushActivity(level: PushActivityLevel, message: string): void {
  pushActivityEntries = [
    {
      id: `${Date.now()}-${pushActivitySeq++}`,
      time: formatActivityTime(),
      level,
      message,
    },
    ...pushActivityEntries,
  ].slice(0, PUSH_ACTIVITY_MAX);
  emitPushActivity();
}

function pushActivityFromError(context: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  pushActivity("error", `${context}: ${message}`);
  return error instanceof Error ? error : new Error(message);
}

export type PushInfrastructureState = "idle" | "waiting" | "ready" | "error";

export type PushInfrastructureProgress = {
  phase: "idle" | "waiting" | "ready" | "error";
  label: string;
  percent: number;
};

let infrastructureState: PushInfrastructureState = "idle";
let infrastructureError: string | null = null;
let infrastructureProgress: PushInfrastructureProgress = { phase: "idle", label: "", percent: 0 };
let cachedRegistration: ServiceWorkerRegistration | null = null;
const infrastructureProgressListeners = new Set<(progress: PushInfrastructureProgress) => void>();

function emitInfrastructureProgress(progress: PushInfrastructureProgress): void {
  infrastructureProgress = progress;
  for (const listener of infrastructureProgressListeners) {
    listener(progress);
  }
}

export function getPushInfrastructureState(): PushInfrastructureState {
  return infrastructureState;
}

export function getPushInfrastructureError(): string | null {
  return infrastructureError;
}

export function getPushInfrastructureProgress(): PushInfrastructureProgress {
  return infrastructureProgress;
}

export function subscribePushInfrastructureProgress(
  listener: (progress: PushInfrastructureProgress) => void
): () => void {
  infrastructureProgressListeners.add(listener);
  listener(infrastructureProgress);
  return () => infrastructureProgressListeners.delete(listener);
}

function findSerwistRegistration(
  registrations: readonly ServiceWorkerRegistration[]
): ServiceWorkerRegistration | undefined {
  return registrations.find((entry) => {
    const script =
      entry.active?.scriptURL ??
      entry.installing?.scriptURL ??
      entry.waiting?.scriptURL ??
      "";
    return script.includes(SERVICE_WORKER_URL);
  });
}

function workerStateLabel(registration: ServiceWorkerRegistration | undefined): string {
  if (!registration) return "not registered";
  const worker = registration.active ?? registration.installing ?? registration.waiting;
  return worker?.state ?? "missing-worker";
}

function formatSwDiagnostics(registration?: ServiceWorkerRegistration): string {
  const platform = getClientPushPlatform();
  const standalone = isStandaloneDisplayMode();
  const hasController = !!navigator.serviceWorker?.controller;
  return [
    `Device: ${platform}`,
    `App: ${standalone ? "Home Screen" : "browser"}`,
    `Permission: ${Notification.permission}`,
    `Worker: ${workerStateLabel(registration)}`,
    `Controller: ${hasController}`,
  ].join(" · ");
}

export async function readPushSetupDiagnostics(): Promise<string> {
  if (!isPushApiSupported()) return "Push API: not supported";
  const registrations = await navigator.serviceWorker.getRegistrations();
  const serwist = findSerwistRegistration(registrations);
  const stored = readStoredPushEndpoint();
  return `${formatSwDiagnostics(serwist)} · Local key: ${stored ? "yes" : "no"} · Setup: ${infrastructureState}`;
}

async function waitForWorkerActive(
  registration: ServiceWorkerRegistration,
  deadlineMs: number,
  onTick?: (percent: number, label: string) => void
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;

  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (reg: ServiceWorkerRegistration) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      resolve(reg);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      reject(new Error(message));
    };

    const track = (worker: ServiceWorker) => {
      worker.addEventListener("statechange", () => {
        if (registration.active || worker.state === "activated") {
          finish(registration);
        }
      });
    };

    const poll = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const percent = Math.min(90, 40 + Math.round((elapsed / deadlineMs) * 50));
      const state = workerStateLabel(registration);
      onTick?.(percent, `Background worker: ${state}…`);

      if (registration.active) {
        finish(registration);
        return;
      }

      const worker = registration.installing ?? registration.waiting;
      if (worker?.state === "activated") {
        finish(registration);
        return;
      }

      if (elapsed >= deadlineMs) {
        fail(
          `Background worker did not activate in time (${formatSwDiagnostics(registration)}). ` +
            (getClientPushPlatform() === "ios"
              ? "Close Pump, reopen from Home Screen, then tap Enable once."
              : "Refresh the page, then tap Enable once.")
        );
      }
    }, 400);

    const existing = registration.active ?? registration.installing ?? registration.waiting;
    if (existing) track(existing);

    registration.addEventListener(
      "updatefound",
      () => {
        const worker = registration.installing;
        if (worker) track(worker);
      },
      { once: true }
    );
  });
}

/**
 * Wait for SerwistProvider's registration — NEVER register/unregister ourselves.
 * Double registration breaks mobile (Serwist docs + production reports).
 */
async function waitForSerwistRegistration(options?: {
  onProgress?: (percent: number, label: string) => void;
}): Promise<ServiceWorkerRegistration> {
  if (cachedRegistration?.active) {
    options?.onProgress?.(100, "Background worker ready");
    return cachedRegistration;
  }

  const deadline = Date.now() + swWaitMs();
  pushActivity("info", "Waiting for Serwist service worker (registered by the app, not manually)…");

  while (Date.now() < deadline) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const serwist = findSerwistRegistration(registrations);

    if (serwist?.active) {
      cachedRegistration = serwist;
      options?.onProgress?.(100, "Background worker ready");
      pushActivity("success", "Serwist worker active");
      return serwist;
    }

    if (serwist) {
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        return waitForWorkerActive(serwist, remaining, options?.onProgress);
      }
    }

    const elapsed = swWaitMs() - (deadline - Date.now());
    const percent = Math.min(35, 10 + Math.round((elapsed / swWaitMs()) * 25));
    options?.onProgress?.(percent, "Waiting for app to register background worker…");
    await sleep(400);
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  const serwist = findSerwistRegistration(registrations);
  throw new Error(
    `Background worker not ready (${formatSwDiagnostics(serwist)}). ` +
      (getClientPushPlatform() === "ios"
        ? "If this is your first open after Add to Home Screen: close Pump completely, reopen from the icon, wait 5 seconds, then tap Enable."
        : "Refresh the page, wait a few seconds, then tap Enable.")
  );
}

export function preparePushInfrastructure(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushApiSupported()) return Promise.resolve(null);

  if (cachedRegistration?.active) {
    infrastructureState = "ready";
    emitInfrastructureProgress({ phase: "ready", label: "Ready", percent: 100 });
    return Promise.resolve(cachedRegistration);
  }

  infrastructureState = "waiting";
  infrastructureError = null;
  emitInfrastructureProgress({ phase: "waiting", label: "Waiting for background worker…", percent: 15 });

  return waitForSerwistRegistration({
    onProgress: (percent, label) => {
      emitInfrastructureProgress({ phase: "waiting", label, percent });
    },
  })
    .then((registration) => {
      cachedRegistration = registration;
      infrastructureState = "ready";
      emitInfrastructureProgress({ phase: "ready", label: "Ready", percent: 100 });
      return registration;
    })
    .catch((error) => {
      infrastructureState = "error";
      infrastructureError = error instanceof Error ? error.message : String(error);
      emitInfrastructureProgress({ phase: "error", label: infrastructureError, percent: 0 });
      pushActivity("error", infrastructureError);
      return null;
    });
}

export function retryPreparePushInfrastructure(): Promise<ServiceWorkerRegistration | null> {
  cachedRegistration = null;
  infrastructureState = "idle";
  infrastructureError = null;
  return preparePushInfrastructure();
}

function iosNeedsReloadForControl(): boolean {
  return getClientPushPlatform() === "ios" && isStandaloneDisplayMode() && !navigator.serviceWorker?.controller;
}

function applicationServerKeysMatch(
  existing: ArrayBuffer | null | undefined,
  next: Uint8Array<ArrayBuffer>
): boolean {
  if (!existing || existing.byteLength !== next.byteLength) return false;
  const existingView = new Uint8Array(existing);
  for (let i = 0; i < next.byteLength; i += 1) {
    if (existingView[i] !== next[i]) return false;
  }
  return true;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function serializeSubscription(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error("Invalid push subscription");
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    expirationTime: json.expirationTime ?? null,
  };
}

export async function fetchPushStatus(): Promise<PushStatus> {
  const supported = isPushApiSupported();
  const platform = getClientPushPlatform();
  const standalone = isStandaloneDisplayMode();
  const needsInstall = iosPushNeedsInstall(platform, getClientPushDisplayMode());

  if (!supported) {
    return {
      supported: false,
      permission: "unsupported",
      subscribed: false,
      subscribedOnThisDevice: false,
      subscribedOnOtherDevice: false,
      platform,
      standalone,
      needsInstall,
      preferences: { airdropUpdates: true, tradeAlerts: true, favoriteMoves: true },
    };
  }

  const localEndpoint = await readLocalPushSubscriptionEndpoint();
  const statusUrl = localEndpoint
    ? `/api/push/status?endpoint=${encodeURIComponent(localEndpoint)}`
    : "/api/push/status";

  const response = await fetch(statusUrl, { method: "GET", credentials: "same-origin", cache: "no-store" });
  const body = (await response.json()) as {
    error?: string;
    data?: Omit<PushStatus, "supported" | "permission" | "platform" | "standalone" | "needsInstall">;
  };

  if (!response.ok) throw new Error(body.error ?? "Could not load push status");

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: body.data?.subscribed ?? false,
    subscribedOnThisDevice: body.data?.subscribedOnThisDevice ?? false,
    subscribedOnOtherDevice: body.data?.subscribedOnOtherDevice ?? false,
    platform,
    standalone,
    needsInstall,
    preferences: body.data?.preferences ?? {
      airdropUpdates: true,
      tradeAlerts: true,
      favoriteMoves: true,
    },
  };
}

export async function readLocalPushSubscriptionEndpoint(): Promise<string | null> {
  if (!isPushApiSupported()) return null;
  const stored = readStoredPushEndpoint();
  try {
    const registration =
      cachedRegistration?.active ??
      findSerwistRegistration(await navigator.serviceWorker.getRegistrations());
    if (!registration?.active) return stored;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? stored;
  } catch {
    return stored;
  }
}

export async function subscribeToPushNotifications(
  options?: PushSubscribeOptions
): Promise<PushStatus> {
  const report = (step: PushSubscribeProgress["step"], label: string) => {
    pushActivity("info", label);
    options?.onProgress?.({ step, label, percent: SUBSCRIBE_STEP_PERCENT[step] });
  };

  pushActivity("info", "Enable tapped");

  if (!isPushApiSupported()) {
    throw pushActivityFromError("Not supported", new Error("Push notifications are not supported in this browser"));
  }

  const platform = getClientPushPlatform();
  const displayMode = getClientPushDisplayMode();
  const isIos = platform === "ios";

  if (iosPushNeedsInstall(platform, displayMode)) {
    throw pushActivityFromError(
      "Install required",
      new Error("Add Pump to Home Screen in Safari, then open from the icon and tap Enable.")
    );
  }

  if (iosNeedsReloadForControl()) {
    throw pushActivityFromError(
      "One-time reload needed",
      new Error(
        "First launch on iPhone: close Pump, reopen from Home Screen, wait 5 seconds, then tap Enable again. This is a one-time iOS step — not every time."
      )
    );
  }

  if (Notification.permission === "denied") {
    throw pushActivityFromError(
      "Permission blocked",
      new Error(
        isIos
          ? "Open Settings → Pump → Notifications → Allow, then reopen Pump and tap Enable."
          : "Open site settings → Notifications → Allow, refresh, then tap Enable."
      )
    );
  }

  let permission = Notification.permission;
  if (permission !== "granted") {
    report("permission", "Allow notifications when prompted…");
    permission = await Notification.requestPermission();
    pushActivity("info", `Permission result: ${permission}`);
  }

  if (permission !== "granted") {
    throw pushActivityFromError("Permission denied", new Error("Notification permission was not granted"));
  }

  report("service-worker", "Waiting for background worker…");

  const registration = await withPushTimeout(
    waitForSerwistRegistration({
      onProgress: (percent, label) => report("service-worker", `${label} (${percent}%)`),
    }),
    swWaitMs() + 3_000,
    "Background worker timeout — refresh and try Enable again"
  ).catch((error) => {
    throw pushActivityFromError("Background worker", error);
  });

  report("device-register", "Registering this device for alerts…");

  const applicationServerKey = urlBase64ToUint8Array(getVapidPublicKey());
  const existing = await registration.pushManager.getSubscription();
  if (existing && !applicationServerKeysMatch(existing.options.applicationServerKey ?? null, applicationServerKey)) {
    await existing.unsubscribe();
  }

  const subscription = await withPushTimeout(
    (async () => {
      const current = await registration.pushManager.getSubscription();
      if (current) return current;
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    })(),
    isIos ? 15_000 : 12_000,
    "Could not create push subscription on this device"
  ).catch((error) => {
    throw pushActivityFromError("Device subscription", error);
  });

  const payload = serializeSubscription(subscription);
  const endpointHost = new URL(payload.endpoint).host;
  pushActivity("success", `Push endpoint: ${endpointHost}`);

  if (isIos && !payload.endpoint.includes("push.apple.com")) {
    throw pushActivityFromError(
      "Wrong endpoint",
      new Error(`Expected push.apple.com, got ${endpointHost}. You may be in Safari — use Home Screen app.`)
    );
  }

  report("server-save", "Saving to server…");

  const response = await withPushTimeout(
    fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: payload, platform, displayMode }),
    }),
    12_000,
    "Could not reach server"
  ).catch((error) => {
    throw pushActivityFromError("Server request", error);
  });

  const body = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw pushActivityFromError("Server rejected", new Error(body.error ?? "Could not save subscription"));
  }

  storePushEndpoint(payload.endpoint);
  cachedRegistration = registration;
  infrastructureState = "ready";

  const status = await fetchPushStatus();
  if (!status.subscribedOnThisDevice) {
    throw pushActivityFromError(
      "Verification failed",
      new Error("Server does not show this device as registered yet.")
    );
  }

  report("done", "Notifications enabled on this device.");
  pushActivity("success", "Done — this device is registered. You will not need setup again unless you disable or reinstall.");
  return status;
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  const endpoint = readStoredPushEndpoint();
  let subscription: PushSubscription | null = null;

  try {
    const registration = await waitForSerwistRegistration();
    subscription = await registration.pushManager.getSubscription();
  } catch {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const entry of registrations) {
      const existing = await entry.pushManager.getSubscription();
      if (existing) {
        subscription = existing;
        break;
      }
    }
  }

  if (subscription) await subscription.unsubscribe();

  const resolvedEndpoint = endpoint ?? subscription?.endpoint ?? null;
  if (resolvedEndpoint) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: resolvedEndpoint }),
    });
  }

  clearStoredPushEndpoint();
}

export async function syncPushSubscriptionIfGranted(): Promise<void> {
  if (!isPushApiSupported()) return;
  if (Notification.permission !== "granted") return;
  if (iosPushNeedsInstall(getClientPushPlatform(), getClientPushDisplayMode())) return;

  try {
    const registration = await waitForSerwistRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const payload = serializeSubscription(subscription);
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: payload,
        platform: getClientPushPlatform(),
        displayMode: getClientPushDisplayMode(),
      }),
    });

    if (response.ok) {
      storePushEndpoint(payload.endpoint);
    }
  } catch {
    // passive sync — Enable shows errors
  }
}
