import type { NextRequest } from "next/server";
import { isAdminTelegramUser } from "@/config/admin";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session-cookie";

/** Server: admin Telegram session from pump_auth cookie. */
export function requireAdminSession(request: NextRequest): string | null {
  const telegramId = verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (!telegramId || !isAdminTelegramUser(telegramId)) return null;
  return telegramId;
}
