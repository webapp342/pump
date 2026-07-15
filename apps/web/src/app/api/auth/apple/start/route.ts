import { NextResponse, type NextRequest } from "next/server";
import { isAppleServerConfigured } from "@/lib/auth-config";
import {
  buildAppleOauthAuthUrl,
  getAppleOauthClientId,
  getAppleOauthRedirectUri,
  APPLE_OIDC_COOKIE,
  APPLE_OIDC_COOKIE_MAX_AGE_SECONDS,
  isAppleOidcRedirectConfigured,
} from "@/lib/oauth/apple-oidc";
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
  if (!isAppleServerConfigured()) {
    return NextResponse.json({ error: "Apple sign-in is not configured." }, { status: 503 });
  }

  if (!isAppleOidcRedirectConfigured()) {
    return NextResponse.json(
      { error: "Apple Sign In is not fully configured on the server." },
      { status: 503 }
    );
  }

  const clientId = getAppleOauthClientId();
  const origin = resolvePublicAppOrigin(request);
  const redirectUri = getAppleOauthRedirectUri(origin);
  const state = createOidcState();
  const nonce = createOidcNonce();
  const codeVerifier = createPkceVerifier();
  const codeChallenge = createPkceChallenge(codeVerifier);

  const authUrl = buildAppleOauthAuthUrl({
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
    APPLE_OIDC_COOKIE,
    { state, nonce, codeVerifier, redirectUri },
    APPLE_OIDC_COOKIE_MAX_AGE_SECONDS
  );

  setAuthReturnCookie(response, request, safeReturnPath(request.nextUrl.searchParams.get("next")));

  return response;
}
