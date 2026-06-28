import type { Metadata } from "next";
import { RootProviders } from "@/components/layout/RootProviders";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ibmPlexMono, inter } from "@/lib/fonts";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3012";
const defaultTitle = "Pump — BSC Meme Launchpad";
const defaultDescription =
  "Launch, trade, and earn on BSC bonding curves. Pro trader terminal with rewards layer.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: defaultTitle,
    template: "%s | Pump",
  },
  description: defaultDescription,
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    siteName: "Pump",
    type: "website",
    url: appUrl,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: defaultTitle }],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/opengraph-image"],
  },
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
                var theme;
                if (storedTheme === "light" || storedTheme === "dark") {
                  theme = storedTheme;
                } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
                  theme = "dark";
                } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
                  theme = "light";
                } else {
                  theme = "dark";
                }
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme;
              } catch (error) {
                document.documentElement.dataset.theme = "dark";
                document.documentElement.style.colorScheme = "dark";
              }
            `,
          }}
        />
        <ThemeProvider>
          <RootProviders>{children}</RootProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
