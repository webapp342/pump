import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateTelegramWallet } from "@/lib/aa/telegram-wallet-server";
import {
  exchangeTelegramAuthCode,
  TELEGRAM_OIDC_COOKIE,
  type TelegramOidcCookiePayload,
} from "@/lib/telegram/oidc-config";
import { verifyTelegramIdToken } from "@/lib/telegram/verify-oidc-token";
import {
  redirectAfterTelegramLogin,
  walletAuthJsonResponse,
} from "@/lib/telegram/wallet-auth-response";
import { isTelegramServerConfigured } from "@/lib/telegram-config";
import { resolveAuthRedirectOrigin } from "@/lib/telegram/public-app-origin";
import { authCookieOptions } from "@/lib/auth/session-cookie";

function readOidcCookie(request: NextRequest): TelegramOidcCookiePayload | null {
  const raw = request.cookies.get(TELEGRAM_OIDC_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as TelegramOidcCookiePayload;
    if (!parsed.state || !parsed.nonce || !parsed.codeVerifier || !parsed.redirectUri) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearOidcCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(TELEGRAM_OIDC_COOKIE, "", {
    ...authCookieOptions(request),
    maxAge: 0,
  });
}

export async function GET(request: NextRequest) {
  try {
    if (!isTelegramServerConfigured()) {
      return redirectAfterTelegramLogin(request, "error", "Telegram auth is not configured.");
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim();
    const state = url.searchParams.get("state")?.trim();
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

    if (error) {
      return redirectAfterTelegramLogin(request, "error", error);
    }

    if (!code || !state) {
      return redirectAfterTelegramLogin(request, "error", "Missing Telegram authorization code.");
    }

    const cookiePayload = readOidcCookie(request);
    if (!cookiePayload || cookiePayload.state !== state) {
      return redirectAfterTelegramLogin(request, "error", "Telegram login session expired. Try again.");
    }

    const redirectUri = cookiePayload.redirectUri;
    const { idToken } = await exchangeTelegramAuthCode({
      code,
      redirectUri,
      codeVerifier: cookiePayload.codeVerifier,
    });

    const profile = await verifyTelegramIdToken(idToken, cookiePayload.nonce);
    const wallet = await getOrCreateTelegramWallet({
      telegramId: profile.telegramId,
      telegramUsername: profile.telegramUsername,
      firstName: profile.firstName,
    });

    const sessionResponse = walletAuthJsonResponse(wallet, true, request);
    clearOidcCookie(sessionResponse, request);

    const completeUrl = new URL("/auth/telegram/complete", resolveAuthRedirectOrigin(request));
    completeUrl.searchParams.set("status", "ok");
    const redirect = NextResponse.redirect(completeUrl);
    for (const cookie of sessionResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    clearOidcCookie(redirect, request);
    return redirect;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram login failed.";
    return redirectAfterTelegramLogin(request, "error", message);
  }
}
