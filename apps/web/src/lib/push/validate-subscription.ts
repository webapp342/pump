import { createHash } from "node:crypto";
import type { PushSubscriptionKeys, PushSubscriptionPayload } from "@/lib/push/types";

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

const ALLOWED_PUSH_HOST_SUFFIXES = [
  ".push.apple.com",
  ".googleapis.com",
  ".mozilla.com",
  ".notify.windows.com",
  ".push.services.mozilla.com",
];

export class PushSubscriptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushSubscriptionValidationError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hashUserAgent(userAgent: string | null | undefined): string | null {
  const trimmed = userAgent?.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (endpoint.length > 2048) return false;

  const host = parsed.hostname.toLowerCase();
  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
  );
}

function assertBase64UrlKey(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") {
    throw new PushSubscriptionValidationError(`${label} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max || !BASE64URL_RE.test(trimmed)) {
    throw new PushSubscriptionValidationError(`${label} is invalid`);
  }
  return trimmed;
}

export function parsePushSubscriptionBody(body: unknown): PushSubscriptionPayload {
  if (!isObject(body)) {
    throw new PushSubscriptionValidationError("Invalid subscription body");
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint || !isAllowedPushEndpoint(endpoint)) {
    throw new PushSubscriptionValidationError("Push endpoint is invalid");
  }

  if (!isObject(body.keys)) {
    throw new PushSubscriptionValidationError("Subscription keys are required");
  }

  const keys: PushSubscriptionKeys = {
    p256dh: assertBase64UrlKey(body.keys.p256dh, "p256dh key", 80, 256),
    auth: assertBase64UrlKey(body.keys.auth, "auth key", 20, 64),
  };

  const expirationTime =
    body.expirationTime === null || body.expirationTime === undefined
      ? null
      : Number(body.expirationTime);

  if (expirationTime != null && !Number.isFinite(expirationTime)) {
    throw new PushSubscriptionValidationError("expirationTime is invalid");
  }

  return {
    endpoint,
    keys,
    expirationTime,
  };
}
