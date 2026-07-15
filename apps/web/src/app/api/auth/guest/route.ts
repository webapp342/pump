import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateTelegramWallet } from "@/lib/aa/telegram-wallet-server";
import { createSessionTokenForSubject } from "@/lib/auth/wallet-session";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/session-cookie";
import {
  clearAuthReturnCookie,
  readAuthReturnCookie,
} from "@/lib/auth/auth-return-cookie";
import { resolveAuthRedirectOrigin } from "@/lib/telegram/public-app-origin";
import { safeReturnPath } from "@/lib/safe-return-path";
import { isGuestAuthEnabled } from "@/lib/auth/guest-auth";

export async function GET(request: NextRequest) {
  if (!isGuestAuthEnabled()) {
    return NextResponse.json({ error: "Guest auth is not enabled" }, { status: 403 });
  }

  const nextFromQuery = safeReturnPath(request.nextUrl.searchParams.get("next"));

  try {
    const guestId = "999999999999";

    await getOrCreateTelegramWallet({
      telegramId: guestId,
      telegramUsername: "guest_user",
      firstName: "Guest",
    });

    const token = createSessionTokenForSubject({ kind: "telegram", telegramId: guestId });
    const safeOrigin = resolveAuthRedirectOrigin(request);
    const completeUrl = new URL("/auth/telegram/complete", safeOrigin);
    completeUrl.searchParams.set("status", "ok");

    const returnPath = nextFromQuery ?? readAuthReturnCookie(request);
    if (returnPath) completeUrl.searchParams.set("next", returnPath);

    const redirect = NextResponse.redirect(completeUrl);
    redirect.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(request));
    clearAuthReturnCookie(redirect, request);

    return redirect;
  } catch (error) {
    console.error("Guest login error:", error);
    const safeOrigin = resolveAuthRedirectOrigin(request);
    const completeUrl = new URL("/auth/telegram/complete", safeOrigin);
    completeUrl.searchParams.set("status", "error");
    completeUrl.searchParams.set(
      "message",
      error instanceof Error ? error.message : "Guest sign-in failed."
    );
    const returnPath = nextFromQuery ?? readAuthReturnCookie(request);
    if (returnPath) completeUrl.searchParams.set("next", returnPath);
    const redirect = NextResponse.redirect(completeUrl);
    clearAuthReturnCookie(redirect, request);
    return redirect;
  }
}
