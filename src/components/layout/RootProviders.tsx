import { headers } from "next/headers";
import { CreatorFollowsProvider } from "@/components/creators/CreatorFollowsProvider";
import { FavoritesProvider } from "@/components/favorites/FavoritesProvider";
import { AirdropSavesProvider } from "@/components/airdrops/AirdropSavesProvider";
import { UserAvatarProvider } from "@/components/user/UserAvatarProvider";
import { UserBootstrapProvider } from "@/components/user/UserBootstrapProvider";
import { ReferralCaptureProvider } from "@/components/referrals/ReferralCaptureProvider";
import { RouteWarmup } from "@/components/layout/RouteWarmup";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Web3Provider } from "@/components/wallet/Web3Provider";

/** Reads request headers (dynamic) — must render inside Suspense with cacheComponents. */
export async function RootProviders({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const cookies = headersList.get("cookie");

  return (
    <ThemeProvider>
      <Web3Provider cookies={cookies}>
        <UserBootstrapProvider>
          <FavoritesProvider>
            <AirdropSavesProvider>
              <CreatorFollowsProvider>
                <UserAvatarProvider>
                  <ReferralCaptureProvider>
                    <RouteWarmup />
                    {children}
                  </ReferralCaptureProvider>
                </UserAvatarProvider>
              </CreatorFollowsProvider>
            </AirdropSavesProvider>
          </FavoritesProvider>
        </UserBootstrapProvider>
      </Web3Provider>
    </ThemeProvider>
  );
}
