const SESSION_APPROVAL_KEY = "pump-aa-session-approval";
const SESSION_PRIVATE_KEY = "pump-aa-session-pk";
const SESSION_GRANTED_AT_KEY = "pump-aa-session-granted-at";

export type StoredSession = {
  approval: string;
  privateKey: `0x${string}`;
  grantedAt: number;
};

export function loadStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const approval = localStorage.getItem(SESSION_APPROVAL_KEY);
    const privateKey = localStorage.getItem(SESSION_PRIVATE_KEY) as `0x${string}` | null;
    const grantedAtRaw = localStorage.getItem(SESSION_GRANTED_AT_KEY);
    if (!approval || !privateKey || !grantedAtRaw) return null;
    return {
      approval,
      privateKey,
      grantedAt: Number(grantedAtRaw),
    };
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_APPROVAL_KEY, session.approval);
  localStorage.setItem(SESSION_PRIVATE_KEY, session.privateKey);
  localStorage.setItem(SESSION_GRANTED_AT_KEY, String(session.grantedAt));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_APPROVAL_KEY);
  localStorage.removeItem(SESSION_PRIVATE_KEY);
  localStorage.removeItem(SESSION_GRANTED_AT_KEY);
}

/** Default session TTL — 7 days per research doc. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isSessionExpired(grantedAt: number, ttlMs = SESSION_TTL_MS): boolean {
  return Date.now() - grantedAt > ttlMs;
}
