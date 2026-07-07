"use client";

import type { PushDisplayMode, PushPlatform, PushStatus, PushSubscriptionPayload } from "@/lib/push/types";
import { detectPushPlatform, iosPushNeedsInstall } from "@/lib/push/platform";

const PUSH_ENDPOINT_STORAGE_KEY = "pump_push_endpoint";

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

const SERVICE_WORKER_URL = "/serwist/sw.js";
const SERVICE_WORKER_TIMEOUT_MS = 20_000;
const SERVICE_WORKER_TIMEOUT_IOS_MS = 45_000;

function serviceWorkerTimeoutMs(): number {
  return getClientPushPlatform() === "ios" ? SERVICE_WORKER_TIMEOUT_IOS_MS : SERVICE_WORKER_TIMEOUT_MS;
}

function serviceWorkerStartError(): string {
  if (getClientPushPlatform() === "ios") {
    return "Background setup timed out on iPhone. Fully close Pump (swipe up), reopen from the Home Screen icon, wait 10 seconds on Arena, then tap Enable again.";
  }
  return "Background setup timed out. Refresh the page, wait a few seconds, then try Enable again.";
}

function withPushTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

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
};

export type PushSubscribeOptions = {
  onProgress?: (progress: PushSubscribeProgress) => void;
};

export async function readPushSetupDiagnostics(): Promise<string> {
  if (!isPushApiSupported()) {
    return "Push API: not supported in this browser";
  }

  const platform = getClientPushPlatform();
  const standalone = isStandaloneDisplayMode();
  const permission = Notification.permission;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const serwist = findSerwistRegistration(registrations);
  const worker = serwist?.active ?? serwist?.installing ?? serwist?.waiting;
  const workerState = worker?.state ?? (serwist ? "missing-worker" : "not-registered");
  const storedEndpoint = readStoredPushEndpoint();
  const endpointHint = storedEndpoint ? "yes" : "no";

  return [
    `Device: ${platform}`,
    `App: ${standalone ? "Home Screen" : "browser"}`,
    `Permission: ${permission}`,
    `Background worker: ${workerState}`,
    `Local key: ${endpointHint}`,
    `Registrations: ${registrations.length}`,
  ].join(" · ");
}

function isZombieServiceWorkerRegistration(registration: ServiceWorkerRegistration): boolean {
  return !registration.active && !registration.installing && !registration.waiting;
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

function waitForServiceWorkerActive(
  registration: ServiceWorkerRegistration,
  timeoutMs: number
): Promise<ServiceWorkerRegistration> {
  if (registration.active) {
    return Promise.resolve(registration);
  }

  return new Promise((resolve, reject) => {
    const started = Date.now();
    let settled = false;

    const finish = (value: ServiceWorkerRegistration) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      resolve(value);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      reject(error);
    };

    const timeout = window.setTimeout(() => {
      fail(new Error(serviceWorkerStartError()));
    }, timeoutMs);

    const trackWorker = (worker: ServiceWorker) => {
      if (worker.state === "activated" || registration.active) {
        finish(registration);
        return;
      }
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated" || registration.active) {
          finish(registration);
        }
      });
    };

    const poll = window.setInterval(() => {
      if (registration.active) {
        finish(registration);
        return;
      }

      const worker = registration.installing ?? registration.waiting;
      if (worker) {
        if (worker.state === "activated") {
          finish(registration);
        }
        return;
      }

      if (Date.now() - started > timeoutMs) {
        return;
      }

      void registration.update();
    }, 400);

    const existing = registration.active ?? registration.waiting ?? registration.installing;
    if (existing) {
      trackWorker(existing);
    } else {
      void registration.update();
      registration.addEventListener(
        "updatefound",
        () => {
          const worker = registration.installing;
          if (worker) {
            trackWorker(worker);
          }
        },
        { once: true }
      );
    }
  });
}

async function ensurePushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const isIos = getClientPushPlatform() === "ios";
  let registrations = await navigator.serviceWorker.getRegistrations();
  let registration: ServiceWorkerRegistration | undefined =
    findSerwistRegistration(registrations) ?? registrations[0];

  if (registration && isZombieServiceWorkerRegistration(registration)) {
    await registration.unregister();
    registration = undefined;
    registrations = await navigator.serviceWorker.getRegistrations();
  }

  if (!registration) {
    if (!isIos) {
      await Promise.all(registrations.map((entry) => entry.unregister()));
    }
    registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      updateViaCache: "none",
    });
  } else {
    await registration.update();
  }

  try {
    return await waitForServiceWorkerActive(registration, serviceWorkerTimeoutMs());
  } catch (error) {
    if (!isIos) {
      throw error;
    }

    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8_000)),
    ]);
    if (ready?.active) {
      return ready;
    }
    throw error;
  }
}

function applicationServerKeysMatch(
  existing: ArrayBuffer | null | undefined,
  next: Uint8Array<ArrayBuffer>
): boolean {
  if (!existing) return false;
  if (existing.byteLength !== next.byteLength) return false;
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
    keys: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
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
      platform,
      standalone,
      needsInstall,
      preferences: {
        airdropUpdates: true,
        tradeAlerts: true,
        favoriteMoves: true,
      },
    };
  }

  const response = await fetch("/api/push/status", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });

  const body = (await response.json()) as {
    error?: string;
    data?: Omit<PushStatus, "supported" | "permission" | "platform" | "standalone" | "needsInstall">;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Could not load push status");
  }

  const permission: NotificationPermission =
    typeof Notification !== "undefined" ? Notification.permission : "default";

  return {
    supported: true,
    permission,
    subscribed: body.data?.subscribed ?? false,
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

export async function subscribeToPushNotifications(
  options?: PushSubscribeOptions
): Promise<PushStatus> {
  const report = (step: PushSubscribeProgress["step"], label: string) => {
    options?.onProgress?.({ step, label });
  };

  if (!isPushApiSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  const platform = getClientPushPlatform();
  const displayMode = getClientPushDisplayMode();
  const isIos = platform === "ios";

  if (iosPushNeedsInstall(platform, displayMode)) {
    throw new Error("Add Pump to your Home Screen in Safari before enabling notifications on iPhone");
  }

  report("permission", "Checking notification permission…");

  if (Notification.permission === "denied") {
    throw new Error(
      isIos
        ? "Notifications are blocked on iPhone. Open Settings → Pump → Notifications → Allow, then reopen Pump from your Home Screen and tap Enable."
        : "Notifications are blocked in your browser. Open site settings → Notifications → Allow, then refresh and tap Enable."
    );
  }

  let permission = Notification.permission;
  if (permission !== "granted") {
    report("permission", "Waiting for Allow on the permission popup…");
    permission = await withPushTimeout(
      Notification.requestPermission(),
      isIos ? 120_000 : 60_000,
      isIos
        ? "Permission popup timed out. Reopen Pump from the Home Screen icon and tap Enable again."
        : "Permission request timed out. Refresh the page and tap Enable again."
    );
  }

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? isIos
          ? "Notifications are blocked on iPhone. Open Settings → Pump → Notifications → Allow, then reopen Pump from your Home Screen and tap Enable."
          : "Notifications are blocked in your browser. Open site settings → Notifications → Allow, then refresh and tap Enable."
        : "Notification permission was not granted"
    );
  }

  report("service-worker", isIos ? "Starting background worker (up to 45s)…" : "Starting background worker…");

  const registration = await withPushTimeout(
    ensurePushServiceWorkerRegistration(),
    serviceWorkerTimeoutMs() + (isIos ? 10_000 : 5_000),
    serviceWorkerStartError()
  );

  report("device-register", isIos ? "Registering this iPhone for alerts…" : "Registering this device for alerts…");

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
    isIos ? 45_000 : 30_000,
    isIos
      ? "iPhone alert registration timed out. Close Pump completely, reopen from Home Screen, wait on Arena, then try Enable again."
      : "Device registration timed out. Refresh the page and try Enable again."
  );

  const payload = serializeSubscription(subscription);
  report("server-save", "Saving registration to Pump server…");

  const response = await withPushTimeout(
    fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: payload,
        platform,
        displayMode,
      }),
    }),
    20_000,
    "Server save timed out. Check your connection and tap Enable again."
  );

  const body = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Could not save push subscription");
  }

  storePushEndpoint(payload.endpoint);
  report("done", "Notifications enabled on this device.");
  return fetchPushStatus();
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  const endpoint = readStoredPushEndpoint();
  let subscription: PushSubscription | null = null;

  try {
    const registration = await ensurePushServiceWorkerRegistration();
    subscription = await registration.pushManager.getSubscription();
  } catch {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        subscription = existing;
        break;
      }
    }
  }

  if (subscription) {
    await subscription.unsubscribe();
  }

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

/** Start Serwist early so iOS PWA has an active worker before Enable is tapped. */
export function warmPushServiceWorker(): void {
  if (!isPushApiSupported()) return;
  void (async () => {
    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
        updateViaCache: "none",
      });
      await registration.update();
    } catch {
      // Serwist may already own registration.
    }
  })();
}
