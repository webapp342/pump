"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tokenDetailPath } from "@/lib/token-routes";
import {
  fetchTokenDetailBundleClient,
  tokenDetailQueryKey,
} from "@/lib/token-detail-client";

type TokenDetailLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  address: string;
};

export function TokenDetailLink({
  address,
  prefetch = true,
  onMouseEnter,
  onFocus,
  ...rest
}: TokenDetailLinkProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const href = tokenDetailPath(address);

  const prefetchBundle = () => {
    router.prefetch(href);
    void queryClient.prefetchQuery({
      queryKey: tokenDetailQueryKey(address),
      queryFn: () => fetchTokenDetailBundleClient(address),
      staleTime: 5_000,
    });
  };

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onMouseEnter={(event) => {
        prefetchBundle();
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        prefetchBundle();
        onFocus?.(event);
      }}
      {...rest}
    />
  );
}
