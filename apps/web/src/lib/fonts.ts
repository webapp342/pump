import { IBM_Plex_Sans } from "next/font/google";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

/** Corporate UI — Geist Sans (Swiss neo-grotesque, Vercel). */
export const geistSans = GeistSans;

/** Tabular numbers — Geist Mono pairs with Geist Sans. */
export const geistMono = GeistMono;

/** Navbar wordmark — IBM Plex Sans (fintech / institutional lockup). */
export const brandWordmark = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-brand-wordmark",
  display: "swap",
});

/** Material Symbols Rounded — self-hosted (CSP-safe, bundled with app). */
export const materialSymbols = localFont({
  src: "../fonts/material-symbols-rounded.woff2",
  display: "block",
  weight: "100 700",
});
