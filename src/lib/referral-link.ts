export function buildReferralInviteUrl(address: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?ref=${address}`;
}

export function truncateReferralInviteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const ref = parsed.searchParams.get("ref");
    const host = parsed.host || "app";
    if (!ref) return truncateMiddle(url, 32);
    const shortRef =
      ref.length > 14 ? `${ref.slice(0, 8)}…${ref.slice(-4)}` : ref;
    return `${host}/?ref=${shortRef}`;
  } catch {
    return truncateMiddle(url, 32);
  }
}

function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
