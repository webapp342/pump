import { connection } from "next/server";
import { TokenDetailShell } from "@/components/token/TokenDetailShell";
import { fetchTokenDetailBundle } from "@/lib/token-server";

type TokenDetailPageLoaderProps = {
  address: string;
};

/** Dynamic server island — token + trades + holders SSR bundle. */
export async function TokenDetailPageLoader({ address }: TokenDetailPageLoaderProps) {
  await connection();

  let initialBundle = null;
  try {
    initialBundle = await fetchTokenDetailBundle(address);
  } catch {
    // Client retries on hydration.
  }

  return <TokenDetailShell address={address} initialBundle={initialBundle} />;
}
