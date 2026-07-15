import { NextResponse, type NextRequest } from "next/server";
import {
  clearAuthReturnCookie,
  readAuthReturnCookie,
} from "@/lib/auth/auth-return-cookie";
import {
  authCookieOptions,
  AUTH_COOKIE_NAME,
} from "@/lib/auth/session-cookie";
import {
  createSessionTokenForSubject,
  type WalletSessionPayload,
} from "@/lib/auth/wallet-session";
import type { SessionSubject } from "@/lib/auth/session-subject";
import { resolveAuthRedirectOrigin } from "@/lib/telegram/public-app-origin";

export function walletSessionJsonResponse(
  wallet: WalletSessionPayload,
  setCookie: boolean,
  request: NextRequest,
  subject: SessionSubject
) {
  const response = NextResponse.json(
    {
      data: {
        authProvider: wallet.authProvider,
        accountId: wallet.accountId,
        displayName: wallet.displayName,
        email: wallet.email,
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
      createSessionTokenForSubject(subject),
      authCookieOptions(request)
    );
  }

  return response;
}

export function redirectAfterOAuthLogin(
  request: NextRequest,
  provider: "google" | "apple",
  status: "ok" | "error",
  message?: string
) {
  const origin = resolveAuthRedirectOrigin(request);
  const url = new URL("/auth/oauth/complete", origin);
  url.searchParams.set("provider", provider);
  url.searchParams.set("status", status);
  if (message) url.searchParams.set("message", message);
  const returnPath = readAuthReturnCookie(request);
  if (returnPath) url.searchParams.set("next", returnPath);
  const redirect = NextResponse.redirect(url);
  clearAuthReturnCookie(redirect, request);
  return redirect;
}
