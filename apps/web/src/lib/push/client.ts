"use client";

import type { PushDisplayMode, PushPlatform, PushStatus, PushSubscriptionPayload } from "@/lib/push/types";
import { detectPushPlatform, iosPushNeedsInstall, isMobilePwaClient } from "@/lib/push/platform";

const PUSH_ENDPOINT_STORAGE_KEY = "pump_push_endpoint";
const SERVICE_WORKER_URL = "/serwist/sw.js";
/** Minimal classic SW for mobile push — Serwist precache hangs in "installing" on Safari/Chrome mobile. */
const MINIMAL_PUSH_SW_URL = "/push-sw.js";
/** One-time iOS PWA reload so push SW controls the page (WebKit first-launch quirk). */
const IOS_SW_RELOAD_KEY = "pump_ios_sw_control_reload_v1";

const SW_WAIT_MS = {
  desktop: 12_000,
  android: 20_000,
  ios: 45_000,
  unknown: 15_000,
} as const;

/** iOS Home Screen + Android: Serwist install hangs; use lightweight push-sw.js instead. */
export function shouldUseMinimalPushWorker(): boolean {
  const platform = getClientPushPlatform();
  if (platform === "android") return true;
  if (platform === "ios") return isStandaloneDisplayMode();
  return false;
}

/** @deprecated use shouldUseMinimalPushWorker */
export function shouldUseIosMinimalPushWorker(): boolean {
  return shouldUseMinimalPushWorker();
}

export function isPushApiSupported(): boolean {
  if (!isMobilePwaClient()) return false;
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

function findPushRegistration(
  registrations: readonly ServiceWorkerRegistration[]
): ServiceWorkerRegistration | undefined {
  return registrations.find((entry) => {
    const script =
      entry.active?.scriptURL ??
      entry.installing?.scriptURL ??
      entry.waiting?.scriptURL ??
      "";
    return script.includes(SERVICE_WORKER_URL) || script.includes(MINIMAL_PUSH_SW_URL);
  });
}

function registrationScriptLabel(registration?: ServiceWorkerRegistration): string {
  if (!registration) return "none";
  const script =
    registration.active?.scriptURL ??
    registration.installing?.scriptURL ??
    registration.waiting?.scriptURL ??
    "";
  if (script.includes(MINIMAL_PUSH_SW_URL)) return "push-sw";
  if (script.includes(SERVICE_WORKER_URL)) return "serwist";
  try {
    return script ? new URL(script).pathname : "unknown";
  } catch {
    return "unknown";
  }
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
  const scope = registration?.scope ?? "none";
  return [
    `Device: ${platform}`,
    `App: ${standalone ? "Home Screen" : "browser"}`,
    `Permission: ${Notification.permission}`,
    `Worker: ${workerStateLabel(registration)}`,
    `Script: ${registrationScriptLabel(registration)}`,
    `Controller: ${hasController}`,
    `Scope: ${scope}`,
  ].join(" · ");
}

export async function readPushSetupDiagnostics(): Promise<string> {
  if (!isPushApiSupported()) return "Push API: not supported";
  const registrations = await navigator.serviceWorker.getRegistrations();
  const registration = findPushRegistration(registrations);
  const stored = readStoredPushEndpoint();
  return `${formatSwDiagnostics(registration)} · Local key: ${stored ? "yes" : "no"} · Setup: ${infrastructureState}`;
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
      if (worker?.state === "redundant") {
        fail("Background worker failed to install — retrying…");
        return;
      }

      if (worker?.state === "activated") {
        finish(registration);
        return;
      }

      if (elapsed >= deadlineMs) {
        fail(
          `Background worker did not activate in time (${formatSwDiagnostics(registration)}). ` +
            (shouldUseMinimalPushWorker()
              ? "Tap Enable again — the iPhone alerts worker should activate in a few seconds."
              : getClientPushPlatform() === "ios"
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

async function unregisterStuckSerwistWorkers(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    const script =
      registration.active?.scriptURL ??
      registration.installing?.scriptURL ??
      registration.waiting?.scriptURL ??
      "";
    if (!script.includes(SERVICE_WORKER_URL)) continue;

    if (registration.installing?.state === "installing") {
      pushActivity("warn", "Removing stuck cache worker (Serwist precache bug)…");
    }
    await registration.unregister();
  }
}

async function registerMinimalPushWorker(options?: {
  onProgress?: (percent: number, label: string) => void;
}): Promise<ServiceWorkerRegistration> {
  const platform = getClientPushPlatform();
  const readyLabel =
    platform === "ios" ? "iPhone alerts worker ready" : platform === "android" ? "Android alerts worker ready" : "Alerts worker ready";

  if (cachedRegistration?.active?.scriptURL.includes(MINIMAL_PUSH_SW_URL)) {
    options?.onProgress?.(100, readyLabel);
    return cachedRegistration;
  }

  await unregisterStuckSerwistWorkers();
  await sleep(400);

  let registration = findPushRegistration(await navigator.serviceWorker.getRegistrations());
  if (registration?.active?.scriptURL.includes(MINIMAL_PUSH_SW_URL)) {
    cachedRegistration = registration;
    options?.onProgress?.(100, readyLabel);
    pushActivity("success", readyLabel);
    return registration;
  }

  pushActivity("info", "Registering lightweight alerts worker (no heavy cache)…");
  options?.onProgress?.(25, "Registering alerts worker…");

  registration = await navigator.serviceWorker.register(MINIMAL_PUSH_SW_URL, {
    scope: "/",
    type: "classic",
    updateViaCache: "none",
  });

  const active = await waitForWorkerActive(registration, 45_000, options?.onProgress);
  cachedRegistration = active;
  pushActivity("success", readyLabel);
  return active;
}

function nudgeSerwistSkipWaiting(registration: ServiceWorkerRegistration): void {
  const waiting = registration.waiting;
  if (!waiting) return;
  pushActivity("info", "Activating updated background worker…");
  void waiting.postMessage({ type: "SKIP_WAITING" });
}

/** Wait for SerwistProvider's registration on desktop. Falls back to push-sw if stuck. */
async function waitForSerwistRegistration(options?: {
  onProgress?: (percent: number, label: string) => void;
}): Promise<ServiceWorkerRegistration> {
  if (cachedRegistration?.active?.scriptURL.includes(SERVICE_WORKER_URL)) {
    options?.onProgress?.(100, "Background worker ready");
    return cachedRegistration;
  }

  const deadline = Date.now() + swWaitMs();
  pushActivity("info", "Waiting for Serwist service worker…");
  let nudgedSkipWaiting = false;

  while (Date.now() < deadline) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const registration = findPushRegistration(registrations);

    if (registration?.active?.scriptURL.includes(SERVICE_WORKER_URL)) {
      cachedRegistration = registration;
      options?.onProgress?.(100, "Background worker ready");
      pushActivity("success", "Serwist worker active");
      return registration;
    }

    if (registration?.waiting && !nudgedSkipWaiting) {
      nudgedSkipWaiting = true;
      nudgeSerwistSkipWaiting(registration);
    }

    if (registration) {
      const script =
        registration.installing?.scriptURL ??
        registration.waiting?.scriptURL ??
        registration.active?.scriptURL ??
        "";
      if (script.includes(SERVICE_WORKER_URL)) {
        const remaining = deadline - Date.now();
        if (remaining > 0) {
          try {
            return await waitForWorkerActive(registration, remaining, options?.onProgress);
          } catch {
            break;
          }
        }
      }
    }

    const elapsed = swWaitMs() - (deadline - Date.now());
    const percent = Math.min(35, 10 + Math.round((elapsed / swWaitMs()) * 25));
    options?.onProgress?.(percent, "Waiting for app to register background worker…");
    await sleep(400);
  }

  pushActivity("warn", "Cache worker stuck — switching to lightweight alerts worker…");
  return registerMinimalPushWorker(options);
}

async function waitForPushRegistration(options?: {
  onProgress?: (percent: number, label: string) => void;
}): Promise<ServiceWorkerRegistration> {
  if (shouldUseMinimalPushWorker()) {
    return registerMinimalPushWorker(options);
  }
  return waitForSerwistRegistration(options);
}

export function preparePushInfrastructure(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushApiSupported()) return Promise.resolve(null);

  if (
    cachedRegistration?.active &&
    (!shouldUseMinimalPushWorker() || cachedRegistration.active.scriptURL.includes(MINIMAL_PUSH_SW_URL))
  ) {
    infrastructureState = "ready";
    emitInfrastructureProgress({ phase: "ready", label: "Ready", percent: 100 });
    return Promise.resolve(cachedRegistration);
  }

  if (shouldUseMinimalPushWorker()) {
    cachedRegistration = null;
  }

  infrastructureState = "waiting";
  infrastructureError = null;
  emitInfrastructureProgress({ phase: "waiting", label: "Waiting for background worker…", percent: 15 });

  return waitForPushRegistration({
    onProgress: (percent, label) => {
      emitInfrastructureProgress({ phase: "waiting", label, percent });
    },
  })
    .then(async (registration) => {
      cachedRegistration = registration;
      if (getClientPushPlatform() === "ios" && isStandaloneDisplayMode()) {
        try {
          await ensureIosServiceWorkerControl({ autoReload: true, quiet: true });
        } catch (error) {
          if (error instanceof PushReloadPendingError) throw error;
          // Non-fatal during passive prep — Enable flow shows errors.
        }
      }
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

async function waitForServiceWorkerController(timeoutMs: number): Promise<boolean> {
  if (navigator.serviceWorker.controller) return true;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(value);
    };

    const onChange = () => {
      if (navigator.serviceWorker.controller) finish(true);
    };

    const timer = window.setTimeout(() => finish(!!navigator.serviceWorker.controller), timeoutMs);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);

    void navigator.serviceWorker.ready.then(() => {
      if (navigator.serviceWorker.controller) finish(true);
    });
  });
}

function readIosSwReloadFlag(): boolean {
  try {
    return sessionStorage.getItem(IOS_SW_RELOAD_KEY) === "1";
  } catch {
    return false;
  }
}

function markIosSwReloadFlag(): void {
  try {
    sessionStorage.setItem(IOS_SW_RELOAD_KEY, "1");
  } catch {
    // ignore
  }
}

/** iOS Home Screen PWA: SW may activate without controlling the page until one navigation/reload. */
export class PushReloadPendingError extends Error {
  constructor(message = "Reloading to activate background worker…") {
    super(message);
    this.name = "PushReloadPendingError";
  }
}

export async function ensureIosServiceWorkerControl(options?: {
  autoReload?: boolean;
  quiet?: boolean;
}): Promise<void> {
  const autoReload = options?.autoReload ?? true;
  const quiet = options?.quiet ?? false;

  if (getClientPushPlatform() !== "ios" || !isStandaloneDisplayMode()) return;
  if (navigator.serviceWorker.controller) return;

  if (!quiet) {
    pushActivity("info", "Waiting for iPhone background worker to control the app…");
  }

  await waitForPushRegistration();

  const controlled = await waitForServiceWorkerController(8_000);
  if (controlled || navigator.serviceWorker.controller) {
    if (!quiet) pushActivity("success", "Background worker controls the app");
    return;
  }

  if (!autoReload) {
    throw new Error(
      "Background worker is active but does not control this page yet. Reload once, then tap Enable."
    );
  }

  if (!readIosSwReloadFlag()) {
    markIosSwReloadFlag();
    if (!quiet) pushActivity("info", "One-time reload for iPhone — activating alerts…");
    window.location.reload();
    throw new PushReloadPendingError();
  }

  throw new Error(
    "Close Pump completely (swipe away), reopen from Home Screen, wait 5 seconds, then tap Enable once."
  );
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
      cachedRegistration ??
      findPushRegistration(await navigator.serviceWorker.getRegistrations());
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

  let permission: NotificationPermission = Notification.permission;
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
    waitForPushRegistration({
      onProgress: (percent, label) => report("service-worker", `${label} (${percent}%)`),
    }),
    swWaitMs() + 3_000,
    "Background worker timeout — refresh and try Enable again"
  ).catch((error) => {
    throw pushActivityFromError("Background worker", error);
  });

  try {
    await ensureIosServiceWorkerControl({ autoReload: true });
  } catch (error) {
    if (error instanceof PushReloadPendingError) throw error;
    throw pushActivityFromError("iPhone setup", error);
  }

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
    const registration = await waitForPushRegistration();
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
    const registration = await waitForPushRegistration();
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
