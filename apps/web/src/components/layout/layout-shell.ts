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

/** Arena discovery — sticky toolbar, scrollable coin grid. */
export function isArenaRoute(pathname: string): boolean {
  return pathname === "/arena" || pathname.startsWith("/arena/");
}

/** Missions hub — same terminal width and mobile flush as portfolio. */
export function isMissionsRoute(pathname: string): boolean {
  return pathname === "/missions" || pathname.startsWith("/missions/");
}

/** KOL Market — same 68rem hub terminal frame as Missions. */
export function isKolMarketRoute(pathname: string): boolean {
  return pathname === "/kol-market" || pathname.startsWith("/kol-market/");
}

/** Airdrops hub — same terminal width and mobile flush as portfolio. */
export function isAirdropsRoute(pathname: string): boolean {
  return pathname === "/airdrops" || pathname.startsWith("/airdrops/");
}

/** Create token wizard — same 68rem hub terminal as airdrop create. */
export function isCreateRoute(pathname: string): boolean {
  return pathname === "/create" || pathname.startsWith("/create/");
}

/** Portfolio, Arena, Missions, KOL Market, Airdrops, Create — shared 68rem desktop terminal frame. */
export function isHubTerminalRoute(pathname: string): boolean {
  return (
    isPortfolioRoute(pathname) ||
    isArenaRoute(pathname) ||
    isMissionsRoute(pathname) ||
    isKolMarketRoute(pathname) ||
    isAirdropsRoute(pathname) ||
    isCreateRoute(pathname)
  );
}

/** Main padding: portfolio mobile flush; token fully flush; default inset. */
export function shellMainPaddingClass(pathname: string): string {
  if (isTokenRoute(pathname)) return shellTokenPagePaddingClass;
  if (isHubTerminalRoute(pathname)) {
    const mobilePad = isArenaRoute(pathname) ? "max-md:py-0" : "max-md:p-0";
    return `${mobilePad} md:pt-0 md:pb-8 md:px-0`;
  }
  if (isPortfolioRoute(pathname)) {
    return `max-md:p-0 md:py-8 md:pb-8 ${shellPaddingXClass}`;
  }
  if (isArenaRoute(pathname)) {
    return `max-md:py-0 md:py-8 md:pb-8 ${shellPaddingXClass}`;
  }
  if (isMissionsRoute(pathname)) {
    return `max-md:p-0 md:py-8 md:pb-8 ${shellPaddingXClass}`;
  }
  if (isAirdropsRoute(pathname)) {
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
  const hubDesktopWidth = isHubTerminalRoute(pathname) ? "md:max-w-none" : maxWidth;
  if (isPortfolioRoute(pathname)) {
    return `portfolio-page-main mx-auto w-full flex-1 max-md:max-w-none ${hubDesktopWidth}`;
  }
  if (isArenaRoute(pathname)) {
    return `arena-page-main mx-auto w-full flex-1 max-md:max-w-none ${hubDesktopWidth}`;
  }
  if (isMissionsRoute(pathname)) {
    return `missions-page-main mx-auto w-full flex-1 max-md:max-w-none ${hubDesktopWidth}`;
  }
  if (isKolMarketRoute(pathname)) {
    return `kol-market-page-main mx-auto w-full flex-1 max-md:max-w-none ${hubDesktopWidth}`;
  }
  if (isAirdropsRoute(pathname)) {
    return `airdrops-page-main mx-auto w-full flex-1 max-md:max-w-none ${hubDesktopWidth}`;
  }
  if (isCreateRoute(pathname)) {
    return `airdrops-page-main mx-auto w-full flex-1 max-md:max-w-none ${hubDesktopWidth}`;
  }
  return `mx-auto w-full flex-1 ${maxWidth}`;
}

export function shellHeaderInnerClassForPath(pathname: string): string {
  if (isHubTerminalRoute(pathname)) {
    return "w-full max-w-none px-3 sm:px-4 md:px-0";
  }
  return shellHeaderInnerClass;
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
