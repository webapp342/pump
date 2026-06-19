import type { Hex } from "viem";
import { buildKernelWalletSession, type KernelWalletSession } from "@/lib/aa/kernel-session";
import type { TelegramLoginPayload } from "@/lib/telegram/verify-login";

export type TelegramAccountSession = KernelWalletSession;

type WalletApiPayload = {
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  scwAddress: string;
  privateKey: Hex;
};

async function fetchWalletSession(path: string, init?: RequestInit): Promise<TelegramAccountSession> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
  });

  const body = (await response.json()) as {
    data?: WalletApiPayload;
    error?: string;
  };

  if (!response.ok || !body.data?.privateKey) {
    throw new Error(body.error ?? "Could not load wallet for this Telegram account.");
  }

  return buildKernelWalletSession({
    telegramId: body.data.telegramId,
    telegramUsername: body.data.telegramUsername,
    firstName: body.data.firstName,
    privateKey: body.data.privateKey,
  });
}

export async function createTelegramKernelSessionFromWidget(
  payload: TelegramLoginPayload
): Promise<TelegramAccountSession> {
  return fetchWalletSession("/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function restoreTelegramKernelSession(): Promise<TelegramAccountSession | null> {
  const response = await fetch("/api/auth/telegram/me", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });

  if (response.status === 401) return null;

  const body = (await response.json()) as {
    data?: WalletApiPayload;
    error?: string;
  };

  if (!response.ok || !body.data?.privateKey) {
    throw new Error(body.error ?? "Could not restore Telegram session.");
  }

  return buildKernelWalletSession({
    telegramId: body.data.telegramId,
    telegramUsername: body.data.telegramUsername,
    firstName: body.data.firstName,
    privateKey: body.data.privateKey,
  });
}

export async function logoutTelegramSession(): Promise<void> {
  await fetch("/api/auth/telegram/logout", {
    method: "POST",
    credentials: "same-origin",
  });
}

export function telegramDisplayName(session: Pick<TelegramAccountSession, "firstName" | "telegramUsername">): string {
  if (session.telegramUsername) return `@${session.telegramUsername}`;
  if (session.firstName) return session.firstName;
  return "Telegram user";
}
