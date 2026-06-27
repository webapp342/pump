/** Shared horizontal bounds for header and main. */
export const shellMaxWidthClass = "max-w-[1600px]";
export const shellWideMaxWidthClass = "max-w-[1920px]";
export const shellPaddingXClass = "px-3 sm:px-4 md:px-5 lg:px-6";
/** Equal minimal inset for token detail (~2px gutters). */
export const shellTokenPagePaddingClass = "p-0.5";
export const shellTokenPagePaddingXClass = "px-0.5";
export const shellInnerClass = `mx-auto w-full ${shellMaxWidthClass} ${shellPaddingXClass}`;

export function shellUsesWideLayout(pathname: string): boolean {
  return pathname.startsWith("/token/");
}

export function shellMaxWidthClassForPath(pathname: string): string {
  return shellUsesWideLayout(pathname) ? shellWideMaxWidthClass : shellMaxWidthClass;
}

export function shellInnerClassForPath(pathname: string): string {
  return `mx-auto w-full ${shellMaxWidthClassForPath(pathname)} ${shellPaddingXClass}`;
}
