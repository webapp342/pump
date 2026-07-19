import {
  defaultAvatarIdForAddress,
  isValidUserAvatarId,
  type UserAvatarId,
} from "@/lib/user-avatars";
import { normalizeAddressParam, normalizeUserStorageAddress } from "@/lib/address";
import { getLaunchpadPool } from "@/lib/db/launchpad";
import {
  InvalidUsernameError,
  UsernameTakenError,
  isDefaultUsernameInput,
  validateUsername,
} from "@/lib/username";

export type UserProfile = {
  avatarId: UserAvatarId;
  username: string | null;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23514"
  );
}

async function ensureUserRow(address: string, avatarId: UserAvatarId): Promise<void> {
  const db = getLaunchpadPool();
  await db.query(
    `
    INSERT INTO users (address, last_active, avatar_id)
    VALUES ($1, now(), $2)
    ON CONFLICT (address) DO NOTHING
    `,
    [address, avatarId]
  );
}

function storageAddress(address: string): string {
  return normalizeUserStorageAddress(address);
}

export async function getUserUsername(address: string): Promise<string | null> {
  const db = getLaunchpadPool();
  const normalized = storageAddress(address);
  const result = await db.query<{ username: string | null }>(
    `SELECT username FROM users WHERE address = $1`,
    [normalized]
  );
  return result.rows[0]?.username ?? null;
}

export async function getUsernamesMap(
  addresses: string[]
): Promise<Map<string, string | null>> {
  const normalized = [
    ...new Set(
      addresses
        .map((address) => normalizeAddressParam(address))
        .filter((address): address is string => address != null)
    ),
  ];
  const map = new Map<string, string | null>();
  if (normalized.length === 0) return map;

  for (const address of normalized) {
    map.set(address, null);
  }

  const db = getLaunchpadPool();
  const result = await db.query<{ address: string; username: string | null }>(
    `SELECT address, username FROM users WHERE address = ANY($1::text[])`,
    [normalized]
  );

  for (const row of result.rows) {
    map.set(row.address, row.username);
  }

  return map;
}

export async function getUserProfile(address: string): Promise<UserProfile> {
  const avatarId = await getOrAssignUserAvatar(address);
  const username = await getUserUsername(address);
  return { avatarId, username };
}

export async function isUsernameAvailable(
  username: string,
  excludeAddress?: string
): Promise<boolean> {
  const db = getLaunchpadPool();
  const validation = validateUsername(username);
  if (!validation.ok) return false;

  const params: string[] = [validation.username];
  let excludeClause = "";
  if (excludeAddress) {
    params.push(storageAddress(excludeAddress));
    excludeClause = `AND address <> $2`;
  }

  const result = await db.query<{ address: string }>(
    `
    SELECT address
    FROM users
    WHERE username = $1
    ${excludeClause}
    LIMIT 1
    `,
    params
  );

  return result.rows.length === 0;
}

export async function setUserUsername(
  address: string,
  rawInput: string | null
): Promise<string | null> {
  const db = getLaunchpadPool();
  const normalized = storageAddress(address);
  const fallback = defaultAvatarIdForAddress(normalized);
  await ensureUserRow(normalized, fallback);

  if (rawInput == null || rawInput.trim() === "" || isDefaultUsernameInput(normalized, rawInput)) {
    await db.query(
      `UPDATE users SET username = NULL, last_active = now() WHERE address = $1`,
      [normalized]
    );
    return null;
  }

  const validation = validateUsername(rawInput);
  if (!validation.ok) {
    throw new InvalidUsernameError(validation.error);
  }

  try {
    await db.query(
      `
      UPDATE users
      SET username = $2, last_active = now()
      WHERE address = $1
      `,
      [normalized, validation.username]
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new UsernameTakenError();
    }
    throw error;
  }

  return validation.username;
}

export async function getOrAssignUserAvatar(address: string): Promise<UserAvatarId> {
  const db = getLaunchpadPool();
  const normalized = storageAddress(address);
  const fallback = defaultAvatarIdForAddress(normalized);

  const existing = await db.query<{ avatar_id: string | null }>(
    `SELECT avatar_id FROM users WHERE address = $1`,
    [normalized]
  );

  if (existing.rows.length === 0) {
    try {
      await db.query(
        `INSERT INTO users (address, last_active, avatar_id) VALUES ($1, now(), $2)`,
        [normalized, fallback]
      );
    } catch (error) {
      if (isCheckViolation(error)) return fallback;
      throw error;
    }
    return fallback;
  }

  const saved = existing.rows[0]?.avatar_id;
  if (saved && isValidUserAvatarId(saved)) {
    return saved;
  }

  try {
    await db.query(
      `UPDATE users SET avatar_id = $2, last_active = now() WHERE address = $1`,
      [normalized, fallback]
    );
  } catch (error) {
    if (isCheckViolation(error)) return fallback;
    throw error;
  }
  return fallback;
}

export async function setUserAvatar(address: string, avatarId: string): Promise<UserAvatarId> {
  if (!isValidUserAvatarId(avatarId)) {
    throw new Error("Invalid avatar");
  }

  const db = getLaunchpadPool();
  const normalized = storageAddress(address);

  await db.query(
    `
    INSERT INTO users (address, last_active, avatar_id)
    VALUES ($1, now(), $2)
    ON CONFLICT (address) DO UPDATE
    SET avatar_id = EXCLUDED.avatar_id,
        last_active = now()
    `,
    [normalized, avatarId]
  );

  return avatarId;
}

export async function updateUserProfile(
  address: string,
  input: { avatarId?: string; username?: string | null }
): Promise<UserProfile> {
  const normalized = storageAddress(address);
  let avatarId = await getOrAssignUserAvatar(normalized);
  let username = await getUserUsername(normalized);

  if (input.avatarId != null) {
    avatarId = await setUserAvatar(normalized, input.avatarId);
  }

  if (input.username !== undefined) {
    username = await setUserUsername(normalized, input.username);
  }

  return { avatarId, username };
}
