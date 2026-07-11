import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateTelegramWallet } from "@/lib/aa/telegram-wallet-server";
import {
  verifyTelegramLogin,
  type TelegramLoginPayload,
} from "@/lib/telegram/verify-login";
import { redirectAfterTelegramLogin, walletAuthJsonResponse } from "@/lib/telegram/wallet-auth-response";
import { resolveAuthRedirectOrigin } from "@/lib/telegram/public-app-origin";
import { isTelegramServerConfigured } from "@/lib/telegram-config";

function legacyPayloadFromSearchParams(url: URL): TelegramLoginPayload | null {
  const id = Number(url.searchParams.get("id"));
  const authDate = Number(url.searchParams.get("auth_date"));
  const hash = url.searchParams.get("hash") ?? "";
  const firstName = url.searchParams.get("first_name") ?? "";

  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(authDate) || !hash || !firstName) {
    return null;
  }

  return {
    id,
    auth_date: authDate,
    hash,
    first_name: firstName,
    last_name: url.searchParams.get("last_name") ?? undefined,
    username: url.searchParams.get("username") ?? undefined,
    photo_url: url.searchParams.get("photo_url") ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!isTelegramServerConfigured()) {
      return redirectAfterTelegramLogin(request, "error", "Telegram auth is not configured.");
    }

    const url = new URL(request.url);
    const payload = legacyPayloadFromSearchParams(url);
    if (!payload || !verifyTelegramLogin(payload)) {
      return redirectAfterTelegramLogin(request, "error", "Invalid Telegram login.");
    }

    const wallet = await getOrCreateTelegramWallet({
      telegramId: String(payload.id),
      telegramUsername: payload.username ?? null,
      firstName: payload.first_name ?? null,
    });

    const sessionResponse = walletAuthJsonResponse(wallet, true, request);
    const completeUrl = new URL("/auth/telegram/complete", resolveAuthRedirectOrigin(request));
    completeUrl.searchParams.set("status", "ok");
    const redirect = NextResponse.redirect(completeUrl);
    for (const cookie of sessionResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram login failed.";
    return redirectAfterTelegramLogin(request, "error", message);
  }
}
