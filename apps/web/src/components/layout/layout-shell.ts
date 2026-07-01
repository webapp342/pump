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

/** Portfolio terminal — flush on mobile like token detail. */
export function isPortfolioRoute(pathname: string): boolean {
  return pathname === "/portfolio" || pathname.startsWith("/portfolio/");
}

/** Main padding: portfolio mobile flush; token fully flush; default inset. */
export function shellMainPaddingClass(pathname: string): string {
  if (isTokenRoute(pathname)) return shellTokenPagePaddingClass;
  if (isPortfolioRoute(pathname)) {
    return `max-md:p-0 md:py-8 md:pb-8 ${shellPaddingXClass}`;
  }
  return `py-5 md:py-8 md:pb-8 ${shellPaddingXClass}`;
}

/** Main width: portfolio + token use full width on mobile. */
export function shellMainLayoutClass(pathname: string, wide: boolean): string {
  if (isTokenRoute(pathname)) {
    return "token-page-main w-full max-w-none flex-1";
  }
  const maxWidth = wide ? shellWideMaxWidthClass : shellMaxWidthClassForPath(pathname);
  if (isPortfolioRoute(pathname)) {
    return `portfolio-page-main mx-auto w-full flex-1 max-md:max-w-none ${maxWidth}`;
  }
  return `mx-auto w-full flex-1 ${maxWidth}`;
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
