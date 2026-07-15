import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateOAuthWallet } from "@/lib/aa/oauth-wallet-server";
import { isGoogleServerConfigured } from "@/lib/auth-config";
import { redirectAfterOAuthLogin, walletSessionJsonResponse } from "@/lib/auth/wallet-auth-response";
import { loadWalletSessionForSubject } from "@/lib/auth/wallet-session";
import {
  exchangeGoogleAuthCode,
  GOOGLE_OIDC_COOKIE,
  verifyGoogleIdToken,
} from "@/lib/oauth/google-oidc";
import { clearOidcFlowCookie, readOidcFlowCookie } from "@/lib/oauth/oidc-flow";
import {
  clearAuthReturnCookie,
  readAuthReturnCookie,
} from "@/lib/auth/auth-return-cookie";
import { resolvePublicAppOrigin } from "@/lib/telegram/public-app-origin";

export async function GET(request: NextRequest) {
  try {
    if (!isGoogleServerConfigured()) {
      return redirectAfterOAuthLogin(request, "google", "error", "Google sign-in is not configured.");
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim();
    const state = url.searchParams.get("state")?.trim();
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

    if (error) {
      return redirectAfterOAuthLogin(request, "google", "error", error);
    }

    if (!code || !state) {
      return redirectAfterOAuthLogin(request, "google", "error", "Missing Google authorization code.");
    }

    const cookiePayload = readOidcFlowCookie(request, GOOGLE_OIDC_COOKIE);
    if (!cookiePayload || cookiePayload.state !== state) {
      return redirectAfterOAuthLogin(request, "google", "error", "Google login session expired. Try again.");
    }

    const { idToken } = await exchangeGoogleAuthCode({
      code,
      redirectUri: cookiePayload.redirectUri,
      codeVerifier: cookiePayload.codeVerifier,
    });

    const profile = await verifyGoogleIdToken(idToken, cookiePayload.nonce);
    await getOrCreateOAuthWallet({
      provider: "google",
      subject: profile.subject,
      email: profile.email,
      displayName: profile.displayName,
    });

    const sessionSubject = {
      kind: "oauth" as const,
      provider: "google" as const,
      subject: profile.subject,
    };
    const wallet = await loadWalletSessionForSubject(sessionSubject);
    if (!wallet) {
      return redirectAfterOAuthLogin(request, "google", "error", "Could not load Google wallet.");
    }

    const sessionResponse = walletSessionJsonResponse(wallet, true, request, sessionSubject);
    clearOidcFlowCookie(sessionResponse, request, GOOGLE_OIDC_COOKIE);

    const completeUrl = new URL("/auth/oauth/complete", resolvePublicAppOrigin(request));
    completeUrl.searchParams.set("provider", "google");
    completeUrl.searchParams.set("status", "ok");
    const returnPath = readAuthReturnCookie(request);
    if (returnPath) completeUrl.searchParams.set("next", returnPath);

    const redirect = NextResponse.redirect(completeUrl);
    for (const cookie of sessionResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    clearOidcFlowCookie(redirect, request, GOOGLE_OIDC_COOKIE);
    clearAuthReturnCookie(redirect, request);
    return redirect;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google login failed.";
    return redirectAfterOAuthLogin(request, "google", "error", message);
  }
}
