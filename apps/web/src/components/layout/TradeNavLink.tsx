"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useTradeHomeHref } from "@/hooks/useTradeHomeHref";

type TradeNavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  fallbackHref?: string;
};

/** Trade home link — opens last visited token detail, not cold default. */
export function TradeNavLink({ fallbackHref = "/", ...props }: TradeNavLinkProps) {
  const href = useTradeHomeHref(fallbackHref);
  return <Link href={href} prefetch {...props} />;
}
