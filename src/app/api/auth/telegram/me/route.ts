import { NextResponse, type NextRequest } from "next/server";
import { getTelegramWalletCredentials } from "@/lib/aa/telegram-wallet-server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session-cookie";

export async function GET(request: NextRequest) {
  try {
    const telegramId = verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
    if (!telegramId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const wallet = await getTelegramWalletCredentials(telegramId);
    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 401 });
    }

    return NextResponse.json(
      {
        data: {
          telegramId: wallet.telegramId,
          telegramUsername: wallet.telegramUsername,
          firstName: wallet.firstName,
          eoaAddress: wallet.eoaAddress,
          scwAddress: wallet.scwAddress,
          privateKey: wallet.privateKey,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
