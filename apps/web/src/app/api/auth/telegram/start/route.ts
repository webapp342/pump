import { NextResponse, type NextRequest } from "next/server";
import {
  buildTelegramOidcAuthUrl,
  getTelegramOidcClientId,
  getTelegramOidcRedirectUri,
  isTelegramOidcRedirectConfigured,
  TELEGRAM_OIDC_COOKIE,
  TELEGRAM_OIDC_COOKIE_MAX_AGE_SECONDS,
  type TelegramOidcCookiePayload,
} from "@/lib/telegram/oidc-config";
import {
  createOidcNonce,
  createOidcState,
  createPkceChallenge,
  createPkceVerifier,
} from "@/lib/telegram/oidc-pkce";
import { isTelegramServerConfigured } from "@/lib/telegram-config";
import { resolvePublicAppOrigin } from "@/lib/telegram/public-app-origin";
import { authCookieOptions } from "@/lib/auth/session-cookie";
import { setAuthReturnCookie } from "@/lib/auth/auth-return-cookie";
import { safeReturnPath } from "@/lib/safe-return-path";

export async function GET(request: NextRequest) {
  if (!isTelegramServerConfigured()) {
    return NextResponse.json({ error: "Telegram bot is not configured on the server" }, { status: 503 });
  }

  if (!isTelegramOidcRedirectConfigured()) {
    return NextResponse.json(
      { error: "Telegram OIDC redirect is not configured. Set TELEGRAM_OIDC_CLIENT_SECRET." },
      { status: 503 }
    );
  }

  const clientId = getTelegramOidcClientId();
  const origin = resolvePublicAppOrigin(request);
  const redirectUri = getTelegramOidcRedirectUri(origin);
  const state = createOidcState();
  const nonce = createOidcNonce();
  const codeVerifier = createPkceVerifier();
  const codeChallenge = createPkceChallenge(codeVerifier);

  const authUrl = buildTelegramOidcAuthUrl({
    clientId,
    redirectUri,
    state,
    nonce,
    codeChallenge,
  });

  const payload: TelegramOidcCookiePayload = { state, nonce, codeVerifier, redirectUri };
  const response = NextResponse.json(
    { data: { authUrl } },
    { headers: { "Cache-Control": "no-store" } }
  );

  response.cookies.set(TELEGRAM_OIDC_COOKIE, JSON.stringify(payload), {
    ...authCookieOptions(request),
    maxAge: TELEGRAM_OIDC_COOKIE_MAX_AGE_SECONDS,
  });

  setAuthReturnCookie(response, request, safeReturnPath(request.nextUrl.searchParams.get("next")));

  return response;
}
