/** Shared horizontal bounds for header and main. */
export const shellMaxWidthClass = "max-w-[1600px]";
export const shellWideMaxWidthClass = "max-w-[1920px]";
export const shellPaddingXClass = "px-3 sm:px-4 md:px-5 lg:px-6";
/** Token terminal — flush grid, no outer inset (Coinbase Advanced). */
export const shellTokenPagePaddingClass = "";
export const shellTokenPagePaddingXClass = "";
/** Matches --token-page-gutter in globals.css (0). */
export const shellTokenPageGutterClass = "gap-0";
export const shellHeaderInnerClass = "w-full max-w-none px-3 sm:px-4";
/** @deprecated Use shellHeaderInnerClass */
export const shellTokenPageHeaderInnerClass = shellHeaderInnerClass;
export const shellInnerClass = `mx-auto w-full ${shellMaxWidthClass} ${shellPaddingXClass}`;

/** Token detail routes — includes `/token` fallbacks and `/token/0x…` pages. */
export function isTokenRoute(pathname: string): boolean {
  return pathname === "/token" || pathname.startsWith("/token/");
}

export function shellUsesWideLayout(pathname: string): boolean {
  return isTokenRoute(pathname);
}

export function shellMaxWidthClassForPath(pathname: string): string {
  return shellUsesWideLayout(pathname) ? shellWideMaxWidthClass : shellMaxWidthClass;
}

export function shellInnerClassForPath(pathname: string): string {
  return `mx-auto w-full ${shellMaxWidthClassForPath(pathname)} ${shellPaddingXClass}`;
}
