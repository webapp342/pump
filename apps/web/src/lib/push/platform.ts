import type { PushDisplayMode, PushPlatform } from "@/lib/push/types";

export function detectPushPlatform(userAgent: string): PushPlatform {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (userAgent) return "desktop";
  return "unknown";
}

export function parsePushDisplayMode(value: unknown): PushDisplayMode {
  return value === "standalone" ? "standalone" : "browser";
}

export function parsePushPlatform(value: unknown): PushPlatform {
  if (value === "desktop" || value === "android" || value === "ios" || value === "unknown") {
    return value;
  }
  return "unknown";
}

export function iosPushNeedsInstall(platform: PushPlatform, displayMode: PushDisplayMode): boolean {
  return platform === "ios" && displayMode !== "standalone";
}

/** PWA + push are mobile-only (iOS / Android). Desktop browsers use the normal web app. */
export function isMobilePwaClient(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const platform = detectPushPlatform(ua);
  return platform === "ios" || platform === "android";
}
