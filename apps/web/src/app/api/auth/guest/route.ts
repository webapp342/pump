import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateTelegramWallet } from "@/lib/aa/telegram-wallet-server";
import { createSessionTokenForSubject } from "@/lib/auth/wallet-session";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/session-cookie";
import { resolveAuthRedirectOrigin } from "@/lib/telegram/public-app-origin";

import { isGuestAuthEnabled } from "@/lib/auth/guest-auth";

export async function GET(request: NextRequest) {
  if (!isGuestAuthEnabled()) {
    return NextResponse.json({ error: "Guest auth is not enabled" }, { status: 403 });
  }

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

    const redirect = NextResponse.redirect(completeUrl);
    redirect.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(request));

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
    return NextResponse.redirect(completeUrl);
  }
}
