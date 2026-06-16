const PREV_KEY = "pump-nav-prev";
const CURR_KEY = "pump-nav-curr";

function normalizePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

/** Record SPA path changes so Back can return to the real previous screen. */
export function syncNavHistory(pathname: string): void {
  if (typeof window === "undefined") return;
  const next = normalizePath(pathname);
  const curr = sessionStorage.getItem(CURR_KEY);
  if (curr === next) return;
  if (curr) sessionStorage.setItem(PREV_KEY, curr);
  sessionStorage.setItem(CURR_KEY, next);
}

/** Call before client navigation so Back works even on fast link clicks. */
export function noteNavFromCurrentPath(): void {
  if (typeof window === "undefined") return;
  const here = normalizePath(window.location.pathname);
  sessionStorage.setItem(PREV_KEY, here);
}

export function getPreviousNavPath(): string | null {
  if (typeof window === "undefined") return null;
  const prev = sessionStorage.getItem(PREV_KEY);
  if (!prev?.startsWith("/") || prev.startsWith("//")) return null;
  return prev;
}
