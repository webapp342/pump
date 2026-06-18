import type { Metadata } from "next";
import { Suspense } from "react";
import { RootProviders } from "@/components/layout/RootProviders";
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
      data-theme="slate"
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
                var theme = valid ? storedTheme : "slate";
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme === "dark" || theme === "navy" ? "dark" : "light";
              } catch (error) {}
            `,
          }}
        />
        <Suspense>
          <RootProviders>{children}</RootProviders>
        </Suspense>
      </body>
    </html>
  );
}
