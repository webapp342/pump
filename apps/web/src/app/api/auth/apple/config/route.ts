import { NextResponse, type NextRequest } from "next/server";
import { isAppleAuthConfigured, isAppleServerConfigured } from "@/lib/auth-config";
import { isAppleOidcRedirectConfigured } from "@/lib/oauth/apple-oidc";
import { resolvePublicAppOrigin } from "@/lib/telegram/public-app-origin";

export async function GET(request: NextRequest) {
  if (!isAppleAuthConfigured()) {
    return NextResponse.json({ error: "Apple sign-in is not configured." }, { status: 503 });
  }

  return NextResponse.json({
    data: {
      configured: true,
      serverReady: isAppleServerConfigured(),
      redirectReady: isAppleServerConfigured() && isAppleOidcRedirectConfigured(),
      publicOrigin: resolvePublicAppOrigin(request),
    },
  });
}
