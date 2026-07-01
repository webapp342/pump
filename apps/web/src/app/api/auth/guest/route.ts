import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateTelegramWallet } from "@/lib/aa/telegram-wallet-server";
import { createSessionTokenForSubject } from "@/lib/auth/wallet-session";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/session-cookie";
import { resolvePublicAppOrigin } from "@/lib/telegram/public-app-origin";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    const guestId = "999999999999";
    
    await getOrCreateTelegramWallet({
      telegramId: guestId,
      telegramUsername: "guest_user",
      firstName: "Guest",
    });

    const token = createSessionTokenForSubject({ kind: "telegram", telegramId: guestId });

    // Redirect to home using a safe origin (avoids 0.0.0.0 issues on Windows/Chrome)
    const safeOrigin = resolvePublicAppOrigin(request);
    const response = NextResponse.redirect(new URL("/", safeOrigin));
    
    response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(request));

    // IMPORTANT: The client uses localStorage hints to know when to fetch /api/auth/me
    // We can't set localStorage from an API route directly, so we redirect to a special complete page
    // or we just redirect to a URL with a query param that the client picks up.
    // For guest login, we'll just redirect to /auth/telegram/complete?status=ok
    const completeUrl = new URL("/auth/telegram/complete", safeOrigin);
    completeUrl.searchParams.set("status", "ok");
    
    const redirect = NextResponse.redirect(completeUrl);
    redirect.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(request));

    return redirect;
  } catch (error) {
    console.error("Guest login error:", error);
    return NextResponse.json({ error: "Could not create guest session" }, { status: 500 });
  }
}
