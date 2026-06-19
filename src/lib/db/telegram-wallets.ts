import { getLaunchpadPool } from "@/lib/db/launchpad";
import { decryptPrivateKey, encryptPrivateKey } from "@/lib/wallet-key-crypto";
import type { Hex } from "viem";

export type TelegramWalletRow = {
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  eoaAddress: string;
  scwAddress: string;
  privateKey: Hex;
};

type DbRow = {
  telegram_id: string;
  telegram_username: string | null;
  first_name: string | null;
  eoa_address: string;
  scw_address: string;
  encrypted_private_key: string;
};

function mapRow(row: DbRow): TelegramWalletRow {
  return {
    telegramId: row.telegram_id,
    telegramUsername: row.telegram_username,
    firstName: row.first_name,
    eoaAddress: row.eoa_address,
    scwAddress: row.scw_address,
    privateKey: decryptPrivateKey(row.encrypted_private_key),
  };
}

export async function getTelegramWallet(telegramId: string): Promise<TelegramWalletRow | null> {
  const db = getLaunchpadPool();
  const result = await db.query<DbRow>(
    `
    SELECT telegram_id, telegram_username, first_name, eoa_address, scw_address, encrypted_private_key
    FROM telegram_wallets
    WHERE telegram_id = $1
    `,
    [telegramId]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function insertTelegramWallet(input: {
  telegramId: string;
  telegramUsername?: string | null;
  firstName?: string | null;
  eoaAddress: string;
  scwAddress: string;
  privateKey: Hex;
}): Promise<TelegramWalletRow> {
  const db = getLaunchpadPool();
  const encrypted = encryptPrivateKey(input.privateKey);
  const result = await db.query<DbRow>(
    `
    INSERT INTO telegram_wallets (
      telegram_id,
      telegram_username,
      first_name,
      eoa_address,
      scw_address,
      encrypted_private_key
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (telegram_id) DO NOTHING
    RETURNING telegram_id, telegram_username, first_name, eoa_address, scw_address, encrypted_private_key
    `,
    [
      input.telegramId,
      input.telegramUsername ?? null,
      input.firstName ?? null,
      input.eoaAddress.toLowerCase(),
      input.scwAddress.toLowerCase(),
      encrypted,
    ]
  );

  if (result.rows[0]) return mapRow(result.rows[0]);

  const existing = await getTelegramWallet(input.telegramId);
  if (!existing) {
    throw new Error("Could not persist Telegram wallet");
  }
  return existing;
}

export async function updateTelegramProfile(
  telegramId: string,
  profile: { telegramUsername?: string | null; firstName?: string | null }
): Promise<void> {
  const db = getLaunchpadPool();
  await db.query(
    `
    UPDATE telegram_wallets
    SET
      telegram_username = COALESCE($2, telegram_username),
      first_name = COALESCE($3, first_name),
      updated_at = now()
    WHERE telegram_id = $1
    `,
    [telegramId, profile.telegramUsername ?? null, profile.firstName ?? null]
  );
}
