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

function waitForServiceWorkerActive(
  registration: ServiceWorkerRegistration,
  timeoutMs: number
): Promise<ServiceWorkerRegistration> {
  if (registration.active) {
    return Promise.resolve(registration);
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          "Service worker is still starting. Refresh the page, wait a few seconds, then try again."
        )
      );
    }, timeoutMs);

    const worker = registration.installing ?? registration.waiting;
    if (!worker) {
      void navigator.serviceWorker.ready
        .then((readyRegistration) => {
          window.clearTimeout(timeout);
          resolve(readyRegistration);
        })
        .catch((error) => {
          window.clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error("Service worker failed to start"));
        });
      return;
    }

    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        resolve(registration);
      }
    });
  });
}

async function ensurePushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  let registration =
    registrations.find((entry) => entry.active?.scriptURL.includes(SERVICE_WORKER_URL)) ??
    registrations[0];

  if (!registration) {
    registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      updateViaCache: "none",
    });
  }

  return waitForServiceWorkerActive(registration, SERVICE_WORKER_TIMEOUT_MS);
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

export async function subscribeToPushNotifications(): Promise<PushStatus> {
  if (!isPushApiSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  const platform = getClientPushPlatform();
  const displayMode = getClientPushDisplayMode();
  if (iosPushNeedsInstall(platform, displayMode)) {
    throw new Error("Add Pump to your Home Screen in Safari before enabling notifications on iPhone");
  }

  if (Notification.permission === "denied") {
    throw new Error(
      "Notifications are blocked in your browser. Open site settings (lock icon in the address bar) → Notifications → Allow, then refresh and tap On again."
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked in your browser. Open site settings (lock icon in the address bar) → Notifications → Allow, then refresh and tap On again."
        : "Notification permission was not granted"
    );
  }

  const registration = await ensurePushServiceWorkerRegistration();
  const applicationServerKey = urlBase64ToUint8Array(getVapidPublicKey());
  const existing = await registration.pushManager.getSubscription();

  if (existing && !applicationServerKeysMatch(existing.options.applicationServerKey ?? null, applicationServerKey)) {
    await existing.unsubscribe();
  }

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));

  const payload = serializeSubscription(subscription);
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: payload,
      platform,
      displayMode,
    }),
  });

  const body = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Could not save push subscription");
  }

  storePushEndpoint(payload.endpoint);
  return fetchPushStatus();
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  const endpoint = readStoredPushEndpoint();
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await subscription.unsubscribe();
  }

  if (endpoint) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  }

  clearStoredPushEndpoint();
}
