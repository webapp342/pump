import { NextResponse, type NextRequest } from "next/server";
import type { getOrCreateTelegramWallet } from "@/lib/aa/telegram-wallet-server";
import { resolveAuthRedirectOrigin } from "@/lib/telegram/public-app-origin";
import {
  authCookieOptions,
  AUTH_COOKIE_NAME,
  createSessionToken,
} from "@/lib/auth/session-cookie";

export function walletAuthJsonResponse(
  wallet: Awaited<ReturnType<typeof getOrCreateTelegramWallet>>,
  setCookie: boolean,
  request: NextRequest
) {
  const response = NextResponse.json(
    {
      data: {
        telegramId: wallet.telegramId,
        telegramUsername: wallet.telegramUsername,
        firstName: wallet.firstName,
        eoaAddress: wallet.eoaAddress,
        scwAddress: wallet.scwAddress,
        privateKey: wallet.privateKey,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );

  if (setCookie) {
    response.cookies.set(
      AUTH_COOKIE_NAME,
      createSessionToken(wallet.telegramId),
      authCookieOptions(request)
    );
  }

  return response;
}

export function redirectAfterTelegramLogin(request: NextRequest, status: "ok" | "error", message?: string) {
  const origin = resolveAuthRedirectOrigin(request);
  const url = new URL("/auth/telegram/complete", origin);
  url.searchParams.set("status", status);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}
