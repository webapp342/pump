import type { UserAvatarId } from "@/lib/user-avatars";

export type UserBootstrapData = {
  address: string;
  favorites: string[];
  airdropSaves: string[];
  creatorFollows: string[];
  avatarId: UserAvatarId | null;
  username: string | null;
  hasStatusBadge?: boolean;
};

export const USER_BOOTSTRAP_EVENT = "pump:user-bootstrap";

const cache = new Map<string, UserBootstrapData>();

function key(address: string): string {
  return address.toLowerCase();
}

export function setUserBootstrap(data: UserBootstrapData): void {
  cache.set(key(data.address), data);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(USER_BOOTSTRAP_EVENT, { detail: data }));
  }
}

export function getUserBootstrap(address: string): UserBootstrapData | null {
  return cache.get(key(address)) ?? null;
}

export function clearUserBootstrap(address?: string): void {
  if (address) {
    cache.delete(key(address));
    return;
  }
  cache.clear();
}

/** Apply cached or incoming bootstrap once; returns cleanup. */
export function subscribeUserBootstrap(
  address: string,
  onData: (data: UserBootstrapData) => void
): () => void {
  const cached = getUserBootstrap(address);
  if (cached) {
    onData(cached);
    return () => undefined;
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<UserBootstrapData>).detail;
    if (detail.address.toLowerCase() !== address.toLowerCase()) return;
    onData(detail);
  };

  window.addEventListener(USER_BOOTSTRAP_EVENT, handler);
  return () => window.removeEventListener(USER_BOOTSTRAP_EVENT, handler);
}
