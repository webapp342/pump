type LocalFontOptions = {
  src?: unknown;
  variable?: string;
  display?: string;
  weight?: string;
};

/** Vite shim — Next.js localFont is not available in the admin bundle. */
export default function localFont(options: LocalFontOptions = {}) {
  return {
    className: "material-symbols-rounded",
    variable: options.variable ?? "--font-material-symbols",
  };
}
