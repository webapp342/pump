/** Allow only same-origin relative return paths (no open redirects). */
export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  const pathname = trimmed.split(/[?#]/)[0] ?? trimmed;
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/")
  ) {
    return null;
  }
  return trimmed;
}
