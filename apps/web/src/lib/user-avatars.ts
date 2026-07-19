import { isSolanaChainFamily } from "@/config/chain-family";

/** DiceBear style keys stored in users.avatar_id */
export const USER_AVATAR_IDS = [
  "avataaars",
  "bottts",
  "pixelArt",
  "funEmoji",
  "lorelei",
  "adventurer",
  "bigSmile",
  "croodles",
  "micah",
  "personas",
  "notionists",
  "toonHead",
] as const;

export type UserAvatarId = (typeof USER_AVATAR_IDS)[number];

export const USER_AVATAR_LABELS: Record<UserAvatarId, string> = {
  avataaars: "Avataaars",
  bottts: "Bottts",
  pixelArt: "Pixel",
  funEmoji: "Emoji",
  lorelei: "Lorelei",
  adventurer: "Adventurer",
  bigSmile: "Big smile",
  croodles: "Croodles",
  micah: "Micah",
  personas: "Personas",
  notionists: "Notionists",
  toonHead: "Toon",
};

/** Varied DiceBear background palette (hex without #). */
export const USER_AVATAR_BG_COLORS = [
  "b6e3f4",
  "c0aede",
  "d1f4d1",
  "f9e8a8",
  "ffdfbf",
  "a8e6cf",
  "87ceeb",
  "f4a460",
  "dda0dd",
  "98d8c8",
];

export const DEFAULT_USER_AVATAR_ID: UserAvatarId = "avataaars";

export function isValidUserAvatarId(value: string): value is UserAvatarId {
  return (USER_AVATAR_IDS as readonly string[]).includes(value);
}

export function defaultAvatarIdForAddress(address: string): UserAvatarId {
  let hash = 0;
  const seed = isSolanaChainFamily ? address : address.toLowerCase();
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return USER_AVATAR_IDS[hash % USER_AVATAR_IDS.length];
}

export function resolveUserAvatarId(avatarId: string | null | undefined): UserAvatarId {
  if (avatarId && isValidUserAvatarId(avatarId)) {
    return avatarId;
  }
  return DEFAULT_USER_AVATAR_ID;
}
