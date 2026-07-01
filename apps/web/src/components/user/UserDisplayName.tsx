"use client";

import { resolveDisplayUsername } from "@/lib/username";
import { useUserDisplayNames } from "@/hooks/useUserDisplayNames";

type UserDisplayNameProps = {
  address: string;
  username?: string | null;
  compact?: boolean;
  className?: string;
};

export function UserDisplayName({
  address,
  username,
  compact = false,
  className,
}: UserDisplayNameProps) {
  const lookup = useUserDisplayNames(username === undefined ? [address] : [], compact);

  const label =
    username !== undefined
      ? resolveDisplayUsername(address, username, compact)
      : (lookup.get(address.toLowerCase()) ??
        resolveDisplayUsername(address, null, compact));

  return <span className={className}>{label}</span>;
}
