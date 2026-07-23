"use client";

import type { Address, EIP1193Provider, Hex } from "viem";
import type { KernelAccountClient } from "@zerodev/sdk";
import {
  buildKernelWalletSession,
  type KernelWalletSession,
} from "@/lib/aa/kernel-session";
import { TELEGRAM_SESSION_HINT_KEY } from "@/lib/aa/telegram-account";
import { isSolanaChainFamily } from "@/config/chain-family";

export type PumpAccountSession = Omit<KernelWalletSession, "kernelClient" | "provider"> & {
  authProvider: "telegram" | "google" | "apple";
  accountId: string;
  displayName: string | null;
  email: string | null;
  /** EVM only — null on Solana (silent-session uses Ed25519 wallet). */
  kernelClient: KernelAccountClient | null;
  provider: EIP1193Provider | null;
};

export const PUMP_SESSION_HINT_KEY = "pump_session_hint";

const SOLANA_EVM_PLACEHOLDER = "0x0000000000000000000000000000000000000000" as Address;

type WalletApiPayload = {
  authProvider: "telegram" | "google" | "apple";
  accountId: string;
  displayName: string | null;
  email: string | null;
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  eoaAddress: string;
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

async function fetchAuthMePayload(timeoutMs?: number): Promise<WalletApiPayload> {
  const controller = new AbortController();
  const timer =
    timeoutMs != null
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });

    const body = (await response.json()) as {
      data?: WalletApiPayload;
      error?: string;
    };

    if (!response.ok || !body.data) {
      if (response.status === 401) {
        throw new Error("Not authenticated");
      }
      throw new Error(body.error ?? "Could not load wallet session.");
    }

    return body.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Sign-in timed out. Check your connection and try again.");
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildSolanaPumpSession(data: WalletApiPayload): PumpAccountSession {
  return {
    telegramId: data.telegramId || data.accountId,
    telegramUsername: data.telegramUsername,
    firstName: data.firstName ?? data.displayName,
    eoaAddress: (data.eoaAddress as Address) || SOLANA_EVM_PLACEHOLDER,
    scwAddress: (data.scwAddress as Address) || SOLANA_EVM_PLACEHOLDER,
    kernelClient: null,
    provider: null,
    authProvider: data.authProvider,
    accountId: data.accountId,
    displayName: data.displayName,
    email: data.email,
  };
}

async function fetchWalletSessionFromMe(timeoutMs?: number): Promise<PumpAccountSession> {
  const data = await fetchAuthMePayload(timeoutMs);

  if (isSolanaChainFamily) {
    return buildSolanaPumpSession(data);
  }

  if (!data.privateKey) {
    throw new Error("Could not load wallet session.");
  }

  try {
    const kernel = await buildKernelWalletSession({
      telegramId: data.telegramId || data.accountId,
      telegramUsername: data.telegramUsername,
      firstName: data.firstName ?? data.displayName,
      privateKey: data.privateKey,
    });

    return {
      ...kernel,
      authProvider: data.authProvider,
      accountId: data.accountId,
      displayName: data.displayName,
      email: data.email,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/match|fetch failed|JSON-RPC/i.test(msg)) {
      throw new Error(
        "Could not connect to the chain RPC. Check NEXT_PUBLIC_RPC_URL and bundler settings."
      );
    }
    throw error;
  }
}

/** Post-OAuth redirect: set hint, load session cookie, build kernel client. */
export async function completePumpSignIn(timeoutMs = 30_000): Promise<PumpAccountSession> {
  markPumpSessionHint();

  try {
    return await fetchWalletSessionFromMe(timeoutMs);
  } catch (error) {
    clearPumpSessionHint();
    throw error;
  }
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

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Session hint already cleared — user is signed out locally.
  }

  // Best-effort — never block logout on push / service worker cleanup.
  void import("@/lib/push/client")
    .then((mod) => mod.unsubscribeFromPushNotifications())
    .catch(() => undefined);
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
