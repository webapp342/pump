import localFont from "next/font/local";

/** Coinbase CDS Icons — self-hosted (CSP-safe, bundled with app). */
export const coinbaseIcons = localFont({
  src: "../fonts/CoinbaseIcons.woff2",
  display: "block",
  weight: "400",
  variable: "--font-coinbase-icons",
});
