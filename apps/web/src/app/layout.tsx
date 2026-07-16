import type { Metadata, Viewport } from "next";
import { RootProviders } from "@/components/layout/RootProviders";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import { TelegramMiniAppBootstrap } from "@/components/telegram/TelegramMiniAppBootstrap";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { geistMono, geistSans, brandWordmark, coinbaseIcons } from "@/lib/fonts";
import "@/lib/fontawesome-config";
import "./typography-theme.css";
import "./size-theme.css";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3012";
const appName = "Pump";
const defaultTitle = "Pump — BSC Meme Launchpad";
const defaultDescription =
  "Launch, trade, and earn on BSC bonding curves. Pro trader terminal with rewards layer.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: appName,
  title: {
    default: defaultTitle,
    template: "%s | Pump",
  },
  description: defaultDescription,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/logos/light.svg", type: "image/svg+xml", media: "(prefers-color-scheme: light)" },
      { url: "/logos/dark.svg", type: "image/svg+xml", media: "(prefers-color-scheme: dark)" },
      { url: "/logo-mark.svg", type: "image/svg+xml" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/logo-mark.svg"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: appName,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    siteName: appName,
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0052ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0052ff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-type-theme="coinbase-cds"
      data-size-theme="pump-cds"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${brandWordmark.variable} ${coinbaseIcons.variable}`}
    >
      <body className={geistSans.className}>
        <PwaProvider>
          <TelegramMiniAppBootstrap />
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
                document.documentElement.dataset.typeTheme = "coinbase-cds";
                document.documentElement.dataset.sizeTheme = "pump-cds";
                document.documentElement.style.colorScheme = theme;

                var standalone =
                  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
                  (window.navigator && window.navigator.standalone === true);
                if (standalone) {
                  document.documentElement.dataset.standalone = "true";
                }
              } catch (error) {
                document.documentElement.dataset.theme = "dark";
                document.documentElement.dataset.typeTheme = "coinbase-cds";
                document.documentElement.dataset.sizeTheme = "pump-cds";
                document.documentElement.style.colorScheme = "dark";
              }
            `,
          }}
        />
        <ThemeProvider>
          <RootProviders>{children}</RootProviders>
        </ThemeProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
