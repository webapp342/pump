import { generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";
import { deriveWalletAddresses } from "@/lib/aa/kernel-session";
import {
  getTelegramWallet,
  insertTelegramWallet,
  updateTelegramProfile,
} from "@/lib/db/telegram-wallets";

export type TelegramWalletCredentials = {
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  eoaAddress: string;
  scwAddress: string;
  privateKey: Hex;
};

export async function getOrCreateTelegramWallet(input: {
  telegramId: string;
  telegramUsername?: string | null;
  firstName?: string | null;
}): Promise<TelegramWalletCredentials> {
  const existing = await getTelegramWallet(input.telegramId);
  if (existing) {
    await updateTelegramProfile(input.telegramId, {
      telegramUsername: input.telegramUsername,
      firstName: input.firstName,
    });
    return existing;
  }

  const privateKey = generatePrivateKey();
  const { eoaAddress, scwAddress } = await deriveWalletAddresses(privateKey);

  return insertTelegramWallet({
    telegramId: input.telegramId,
    telegramUsername: input.telegramUsername,
    firstName: input.firstName,
    eoaAddress,
    scwAddress,
    privateKey,
  });
}

export async function getTelegramWalletCredentials(
  telegramId: string
): Promise<TelegramWalletCredentials | null> {
  return getTelegramWallet(telegramId);
}
