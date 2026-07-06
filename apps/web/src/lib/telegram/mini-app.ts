/** True when running inside Telegram Mini App WebView (not a normal browser tab). */
export function isTelegramMiniAppClient(): boolean {
  if (typeof window === "undefined") return false;
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return false;
  if (webApp.initData) return true;
  return Boolean(webApp.platform && webApp.platform !== "unknown");
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (!isTelegramMiniAppClient()) return null;
  return window.Telegram?.WebApp ?? null;
}

export function applyTelegramSafeAreaCss(webApp: TelegramWebApp): void {
  const inset = webApp.contentSafeAreaInset ?? webApp.safeAreaInset;
  const bottom = inset?.bottom ?? 0;
  const top = inset?.top ?? 0;
  const root = document.documentElement;
  root.style.setProperty("--tma-safe-area-bottom", `${bottom}px`);
  root.style.setProperty("--tma-safe-area-top", `${top}px`);
}
