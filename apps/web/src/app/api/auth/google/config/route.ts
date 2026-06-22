import { NextResponse } from "next/server";
import { isGoogleAuthConfigured, isGoogleServerConfigured } from "@/lib/auth-config";
import { isGoogleOidcRedirectConfigured } from "@/lib/oauth/google-oidc";
import { resolvePublicAppOrigin } from "@/lib/telegram/public-app-origin";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 503 });
  }

  return NextResponse.json({
    data: {
      configured: true,
      serverReady: isGoogleServerConfigured(),
      redirectReady: isGoogleServerConfigured() && isGoogleOidcRedirectConfigured(),
      publicOrigin: resolvePublicAppOrigin(request),
    },
  });
}
