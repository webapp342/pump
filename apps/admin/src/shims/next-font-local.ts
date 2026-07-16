type LocalFontOptions = {
  src?: unknown;
  variable?: string;
  display?: string;
  weight?: string;
};

/**
 * Vite shim — Next.js localFont is not available in the admin bundle.
 * CoinbaseIcons @font-face lives in globals.css; class applies that family.
 */
export default function localFont(options: LocalFontOptions = {}) {
  return {
    className: "pump-coinbase-icons",
    variable: options.variable ?? "--font-coinbase-icons",
  };
}
