"use client";

import { resolveDisplayUsername } from "@/lib/username";
import { useUserDisplayNames } from "@/hooks/useUserDisplayNames";

type UserDisplayNameProps = {
  address: string;
  username?: string | null;
  /** Premium name styling when the wallet owns Profile frame. */
  hasStatusBadge?: boolean;
  compact?: boolean;
  className?: string;
};

export function UserDisplayName({
  address,
  username,
  hasStatusBadge: hasStatusBadgeProp,
  compact = false,
  className,
}: UserDisplayNameProps) {
  const needsLookup = username === undefined || hasStatusBadgeProp === undefined;
  const lookup = useUserDisplayNames(needsLookup ? [address] : [], compact);
  const meta = lookup.get(address.toLowerCase());

  const label =
    username !== undefined
      ? resolveDisplayUsername(address, username, compact)
      : (meta?.label ?? resolveDisplayUsername(address, null, compact));

  const premium =
    hasStatusBadgeProp !== undefined
      ? hasStatusBadgeProp
      : Boolean(meta?.hasStatusBadge);

  return (
    <span
      className={`user-display-name${premium ? " user-display-name--premium" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      <span className="user-display-name__label">{label}</span>
    </span>
  );
}
