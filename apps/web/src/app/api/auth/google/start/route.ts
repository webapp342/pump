import { NextResponse, type NextRequest } from "next/server";
import { isGoogleServerConfigured } from "@/lib/auth-config";
import {
  buildGoogleOauthAuthUrl,
  getGoogleOauthClientId,
  getGoogleOauthRedirectUri,
  GOOGLE_OIDC_COOKIE,
  GOOGLE_OIDC_COOKIE_MAX_AGE_SECONDS,
  isGoogleOidcRedirectConfigured,
} from "@/lib/oauth/google-oidc";
import {
  createOidcNonce,
  createOidcState,
  createPkceChallenge,
  createPkceVerifier,
  setOidcFlowCookie,
} from "@/lib/oauth/oidc-flow";
import { resolvePublicAppOrigin } from "@/lib/telegram/public-app-origin";
import { setAuthReturnCookie } from "@/lib/auth/auth-return-cookie";
import { safeReturnPath } from "@/lib/safe-return-path";

export async function GET(request: NextRequest) {
  if (!isGoogleServerConfigured()) {
    return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 503 });
  }

  if (!isGoogleOidcRedirectConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth redirect is not configured. Set GOOGLE_OAUTH_CLIENT_SECRET." },
      { status: 503 }
    );
  }

  const clientId = getGoogleOauthClientId();
  const origin = resolvePublicAppOrigin(request);
  const redirectUri = getGoogleOauthRedirectUri(origin);
  const state = createOidcState();
  const nonce = createOidcNonce();
  const codeVerifier = createPkceVerifier();
  const codeChallenge = createPkceChallenge(codeVerifier);

  const authUrl = buildGoogleOauthAuthUrl({
    clientId,
    redirectUri,
    state,
    nonce,
    codeChallenge,
  });

  const response = NextResponse.json(
    { data: { authUrl } },
    { headers: { "Cache-Control": "no-store" } }
  );

  setOidcFlowCookie(
    response,
    request,
    GOOGLE_OIDC_COOKIE,
    { state, nonce, codeVerifier, redirectUri },
    GOOGLE_OIDC_COOKIE_MAX_AGE_SECONDS
  );

  setAuthReturnCookie(response, request, safeReturnPath(request.nextUrl.searchParams.get("next")));

  return response;
}
