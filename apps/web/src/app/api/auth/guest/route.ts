import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateTelegramWallet } from "@/lib/aa/telegram-wallet-server";
import { createSessionTokenForSubject } from "@/lib/auth/wallet-session";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/session-cookie";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    const guestId = "guest-local";
    
    await getOrCreateTelegramWallet({
      telegramId: guestId,
      telegramUsername: "guest_user",
      firstName: "Guest",
    });

    const token = createSessionTokenForSubject({ kind: "telegram", telegramId: guestId });

    // Redirect to home or wherever
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(request));

    return response;
  } catch (error) {
    console.error("Guest login error:", error);
    return NextResponse.json({ error: "Could not create guest session" }, { status: 500 });
  }
}
