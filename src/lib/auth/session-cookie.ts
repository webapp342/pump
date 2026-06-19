import { createHmac, timingSafeEqual } from "crypto";

export const AUTH_COOKIE_NAME = "pump_auth";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (secret && secret !== "CHANGE_ME") return secret;
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (botToken && botToken !== "CHANGE_ME") return botToken;
  throw new Error("AUTH_SESSION_SECRET or TELEGRAM_BOT_TOKEN is required");
}

export function createSessionToken(telegramId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${telegramId}:${expiresAt}`;
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}:${signature}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const lastColon = token.lastIndexOf(":");
  if (lastColon <= 0) return null;

  const payload = token.slice(0, lastColon);
  const signature = token.slice(lastColon + 1);
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  const [telegramId, expiresAtRaw] = payload.split(":");
  const expiresAt = Number(expiresAtRaw);
  if (!telegramId || !Number.isFinite(expiresAt)) return null;
  if (Math.floor(Date.now() / 1000) > expiresAt) return null;
  return telegramId;
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
