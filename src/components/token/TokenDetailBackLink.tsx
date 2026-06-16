"use client";

import { useSearchParams } from "next/navigation";
import { PageBackLink } from "@/components/ui/PageBackLink";
import { safeReturnPath } from "@/lib/safe-return-path";

export function TokenDetailBackLink() {
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));

  return <PageBackLink href={returnTo ?? "/"} />;
}
