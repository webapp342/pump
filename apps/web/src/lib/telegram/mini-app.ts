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
  root.dataset.tmaFullscreen = webApp.isFullscreen ? "true" : "false";
}

function setTelegramChromeColors(webApp: TelegramWebApp): void {
  try {
    webApp.setHeaderColor("secondary_bg_color");
    webApp.setBackgroundColor("bg_color");
  } catch {
    /* older clients may not support color tokens */
  }
}

function requestTelegramFullscreen(webApp: TelegramWebApp): void {
  if (typeof webApp.requestFullscreen !== "function" || webApp.isFullscreen) return;
  try {
    webApp.requestFullscreen();
  } catch {
    /* fallback to expand only */
  }
}

/** ready → expand → requestFullscreen (Bot API 8.0+). Safe to call multiple times. */
export function bootstrapTelegramMiniApp(): void {
  if (!isTelegramMiniAppClient()) return;

  const webApp = getTelegramWebApp();
  if (!webApp) return;

  document.documentElement.dataset.tma = "true";

  webApp.ready();
  setTelegramChromeColors(webApp);

  if (!webApp.isExpanded) {
    webApp.expand();
  }

  requestTelegramFullscreen(webApp);

  try {
    webApp.disableVerticalSwipes?.();
  } catch {
    /* Bot API 7.7+ */
  }

  applyTelegramSafeAreaCss(webApp);
}

let eventsBound = false;

export function bindTelegramMiniAppEvents(webApp: TelegramWebApp): void {
  if (eventsBound) return;
  eventsBound = true;

  const onLayoutChange = () => {
    applyTelegramSafeAreaCss(webApp);
    if (!webApp.isFullscreen) {
      requestTelegramFullscreen(webApp);
    }
  };

  webApp.onEvent("safeAreaChanged", onLayoutChange);
  webApp.onEvent("contentSafeAreaChanged", onLayoutChange);
  webApp.onEvent("viewportChanged", onLayoutChange);
  webApp.onEvent("fullscreenChanged", onLayoutChange);
  webApp.onEvent("activated", () => bootstrapTelegramMiniApp());
  webApp.onEvent("fullscreenFailed", (...args: unknown[]) => {
    const event = args[0] as TelegramWebAppFullscreenFailedEvent | undefined;
    if (event?.error === "UNSUPPORTED" && !webApp.isExpanded) {
      webApp.expand();
    }
  });
}
