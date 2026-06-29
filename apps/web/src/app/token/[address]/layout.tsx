import { TokenDetailShell } from "@/components/token/TokenDetailShell";
import { fetchTokenDetailBundle } from "@/lib/token-server";

type TokenDetailLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ address: string }>;
};

/**
 * Persistent token terminal shell — layout state survives sidebar /token/[address] switches
 * (Arena board pattern: no remount, no full skeleton on pair change).
 */
export default async function TokenDetailLayout({
  children,
  params,
}: TokenDetailLayoutProps) {
  const { address } = await params;

  let initialBundle = null;
  try {
    initialBundle = await fetchTokenDetailBundle(address);
  } catch {
    // Client cache + API retry on hydration.
  }

  return (
    <>
      <TokenDetailShell address={address} initialBundle={initialBundle} />
      {children}
    </>
  );
}
