import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateOAuthWallet } from "@/lib/aa/oauth-wallet-server";
import { isAppleServerConfigured } from "@/lib/auth-config";
import { redirectAfterOAuthLogin, walletSessionJsonResponse } from "@/lib/auth/wallet-auth-response";
import { loadWalletSessionForSubject } from "@/lib/auth/wallet-session";
import {
  APPLE_OIDC_COOKIE,
  exchangeAppleAuthCode,
  verifyAppleIdToken,
} from "@/lib/oauth/apple-oidc";
import { clearOidcFlowCookie, readOidcFlowCookie } from "@/lib/oauth/oidc-flow";
import {
  clearAuthReturnCookie,
  readAuthReturnCookie,
} from "@/lib/auth/auth-return-cookie";
import { resolvePublicAppOrigin } from "@/lib/telegram/public-app-origin";

export async function GET(request: NextRequest) {
  try {
    if (!isAppleServerConfigured()) {
      return redirectAfterOAuthLogin(request, "apple", "error", "Apple sign-in is not configured.");
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim();
    const state = url.searchParams.get("state")?.trim();
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

    if (error) {
      return redirectAfterOAuthLogin(request, "apple", "error", error);
    }

    if (!code || !state) {
      return redirectAfterOAuthLogin(request, "apple", "error", "Missing Apple authorization code.");
    }

    const cookiePayload = readOidcFlowCookie(request, APPLE_OIDC_COOKIE);
    if (!cookiePayload || cookiePayload.state !== state) {
      return redirectAfterOAuthLogin(request, "apple", "error", "Apple login session expired. Try again.");
    }

    const { idToken } = await exchangeAppleAuthCode({
      code,
      redirectUri: cookiePayload.redirectUri,
      codeVerifier: cookiePayload.codeVerifier,
    });

    const profile = await verifyAppleIdToken(idToken, cookiePayload.nonce);
    await getOrCreateOAuthWallet({
      provider: "apple",
      subject: profile.subject,
      email: profile.email,
      displayName: profile.displayName,
    });

    const sessionSubject = {
      kind: "oauth" as const,
      provider: "apple" as const,
      subject: profile.subject,
    };
    const wallet = await loadWalletSessionForSubject(sessionSubject);
    if (!wallet) {
      return redirectAfterOAuthLogin(request, "apple", "error", "Could not load Apple wallet.");
    }

    const sessionResponse = walletSessionJsonResponse(wallet, true, request, sessionSubject);
    clearOidcFlowCookie(sessionResponse, request, APPLE_OIDC_COOKIE);

    const completeUrl = new URL("/auth/oauth/complete", resolvePublicAppOrigin(request));
    completeUrl.searchParams.set("provider", "apple");
    completeUrl.searchParams.set("status", "ok");
    const returnPath = readAuthReturnCookie(request);
    if (returnPath) completeUrl.searchParams.set("next", returnPath);

    const redirect = NextResponse.redirect(completeUrl);
    for (const cookie of sessionResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    clearOidcFlowCookie(redirect, request, APPLE_OIDC_COOKIE);
    clearAuthReturnCookie(redirect, request);
    return redirect;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apple login failed.";
    return redirectAfterOAuthLogin(request, "apple", "error", message);
  }
}
