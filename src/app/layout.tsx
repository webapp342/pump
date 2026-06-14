import type { Metadata } from "next";
import { CreatorFollowsProvider } from "@/components/creators/CreatorFollowsProvider";
import { FavoritesProvider } from "@/components/favorites/FavoritesProvider";
import { UserAvatarProvider } from "@/components/user/UserAvatarProvider";
import { ReferralCaptureProvider } from "@/components/referrals/ReferralCaptureProvider";
import { RouteWarmup } from "@/components/layout/RouteWarmup";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Web3Provider } from "@/components/wallet/Web3Provider";
import { ibmPlexMono, inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pump — Meme Launchpad",
  description: "Launch and trade memes on BSC bonding curves",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${inter.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var storedTheme = localStorage.getItem("pump-theme");
                var valid = storedTheme === "light" || storedTheme === "dark" || storedTheme === "navy" || storedTheme === "slate";
                var theme = valid ? storedTheme : "dark";
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme === "dark" || theme === "navy" ? "dark" : "light";
              } catch (error) {}
            `,
          }}
        />
        <ThemeProvider>
          <Web3Provider>
            <FavoritesProvider>
              <CreatorFollowsProvider>
                <UserAvatarProvider>
                  <ReferralCaptureProvider>
                    <RouteWarmup />
                    {children}
                  </ReferralCaptureProvider>
                </UserAvatarProvider>
              </CreatorFollowsProvider>
            </FavoritesProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
