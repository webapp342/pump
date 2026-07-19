import type { UserAvatarId } from "@/lib/user-avatars";
import { addressCacheKey } from "@/lib/address";

const avatarIdCache = new Map<string, UserAvatarId>();
const inflight = new Map<string, Promise<UserAvatarId | null>>();

export function getCachedUserAvatarId(address: string): UserAvatarId | null {
  const key = addressCacheKey(address);
  if (!key) return null;
  return avatarIdCache.get(key) ?? null;
}

export function fetchUserAvatarId(address: string): Promise<UserAvatarId | null> {
  const key = addressCacheKey(address);
  if (!key) return Promise.resolve(null);

  const cached = avatarIdCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const response = await fetch(
        `/api/user/avatar?address=${encodeURIComponent(key)}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as { data?: { avatarId?: UserAvatarId } };
      if (response.ok && body.data?.avatarId) {
        avatarIdCache.set(key, body.data.avatarId);
        return body.data.avatarId;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
