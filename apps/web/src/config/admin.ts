/** Ops wallets — override via env; otherwise read from chain in admin API. */
export const ADMIN_ADDRESS = (process.env.NEXT_PUBLIC_ADMIN_ADDRESS ??
  "0x11Ea71d1BEb04Aece4d06a585D9dbc6F58836880") as `0x${string}`;

export const TREASURY_ADDRESS = (process.env.NEXT_PUBLIC_LAUNCHPAD_TREASURY ??
  "0xA28A49856dE40A0418b6cF06266cbE2A0971Fc20") as `0x${string}`;

export function normalizeWallet(address: string | undefined): string | null {
  if (!address) return null;
  return address.toLowerCase();
}

export function isAdminWallet(address: string | undefined, admin = ADMIN_ADDRESS): boolean {
  const a = normalizeWallet(address);
  return a != null && a === admin.toLowerCase();
}

export function isTreasuryWallet(
  address: string | undefined,
  treasury = TREASURY_ADDRESS
): boolean {
  const a = normalizeWallet(address);
  return a != null && a === treasury.toLowerCase();
}
