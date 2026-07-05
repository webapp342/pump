"use client";

import type { Hex } from "viem";
import {
  buildKernelWalletSession,
  type KernelWalletSession,
} from "@/lib/aa/kernel-session";
import { TELEGRAM_SESSION_HINT_KEY } from "@/lib/aa/telegram-account";

export type PumpAccountSession = KernelWalletSession & {
  authProvider: "telegram" | "google" | "apple";
  accountId: string;
  displayName: string | null;
  email: string | null;
};

export const PUMP_SESSION_HINT_KEY = "pump_session_hint";

type WalletApiPayload = {
  authProvider: "telegram" | "google" | "apple";
  accountId: string;
  displayName: string | null;
  email: string | null;
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  scwAddress: string;
  privateKey: Hex;
};

export function markPumpSessionHint(): void {
  try {
    localStorage.setItem(PUMP_SESSION_HINT_KEY, "1");
    localStorage.setItem(TELEGRAM_SESSION_HINT_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearPumpSessionHint(): void {
  try {
    localStorage.removeItem(PUMP_SESSION_HINT_KEY);
    localStorage.removeItem(TELEGRAM_SESSION_HINT_KEY);
  } catch {
    // ignore
  }
}

function hasPumpSessionHint(): boolean {
  try {
    return (
      localStorage.getItem(PUMP_SESSION_HINT_KEY) === "1" ||
      localStorage.getItem(TELEGRAM_SESSION_HINT_KEY) === "1"
    );
  } catch {
    return false;
  }
}

async function fetchWalletSessionFromMe(): Promise<PumpAccountSession> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });

  const body = (await response.json()) as {
    data?: WalletApiPayload;
    error?: string;
  };

  if (!response.ok || !body.data?.privateKey) {
    if (response.status === 401) {
      throw new Error("Not authenticated");
    }
    throw new Error(body.error ?? "Could not load wallet session.");
  }

  const kernel = await buildKernelWalletSession({
    telegramId: body.data.telegramId || body.data.accountId,
    telegramUsername: body.data.telegramUsername,
    firstName: body.data.firstName ?? body.data.displayName,
    privateKey: body.data.privateKey,
  });

  return {
    ...kernel,
    authProvider: body.data.authProvider,
    accountId: body.data.accountId,
    displayName: body.data.displayName,
    email: body.data.email,
  };
}

export async function restorePumpKernelSession(): Promise<PumpAccountSession | null> {
  if (!hasPumpSessionHint()) return null;

  try {
    return await fetchWalletSessionFromMe();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      clearPumpSessionHint();
      return null;
    }
    clearPumpSessionHint();
    throw error;
  }
}

export async function logoutPumpSession(): Promise<void> {
  clearPumpSessionHint();
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });
}

export async function fetchWalletPrivateKey(): Promise<Hex> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });

  const body = (await response.json()) as {
    data?: { privateKey?: Hex };
    error?: string;
  };

  if (!response.ok || !body.data?.privateKey) {
    if (response.status === 401) {
      throw new Error("Not authenticated");
    }
    throw new Error(body.error ?? "Could not load wallet key.");
  }

  return body.data.privateKey;
}

export function pumpDisplayName(
  session: Pick<PumpAccountSession, "authProvider" | "telegramUsername" | "firstName" | "displayName" | "email">
): string {
  if (session.authProvider === "telegram") {
    if (session.telegramUsername) return `@${session.telegramUsername}`;
    if (session.firstName) return session.firstName;
    return "Telegram user";
  }
  if (session.displayName) return session.displayName;
  if (session.email) return session.email;
  return session.authProvider === "google" ? "Google user" : "Apple user";
}
