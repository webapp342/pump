"use client";

import { useParams } from "next/navigation";
import { TokenDetailShell } from "@/components/token/TokenDetailShell";
import {
  TokenDetailSsrProvider,
  useTokenDetailSsrBundle,
} from "@/components/token/TokenDetailSsrBridge";
import { peekTokenDetailBundle } from "@/lib/token-detail-client";

type TokenDetailRouteLayoutProps = {
  children: React.ReactNode;
};

function TokenDetailShellFromSeed({ address }: { address: string }) {
  const ssrBundle = useTokenDetailSsrBundle(address);
  const initialBundle = ssrBundle ?? peekTokenDetailBundle(address) ?? null;
  return <TokenDetailShell address={address} initialBundle={initialBundle} />;
}

/**
 * Client token route shell — never suspends on /token/[address] switches.
 * SSR seed is injected via page children (rendered first) into TokenDetailSsrProvider.
 * Live WS/poll stays inside TokenDetailShell → TokenDetailLive.
 */
export function TokenDetailRouteLayout({ children }: TokenDetailRouteLayoutProps) {
  const params = useParams<{ address: string }>();
  const address = params?.address;

  if (!address) return null;

  return (
    <TokenDetailSsrProvider>
      {/* Seed registers during render before Shell peeks */}
      {children}
      <TokenDetailShellFromSeed address={address} />
    </TokenDetailSsrProvider>
  );
}
