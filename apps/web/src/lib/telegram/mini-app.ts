/** Pump dark canvas — blend Telegram header chrome when fullscreen is unavailable. */
const PUMP_TMA_CHROME_BG = "#0a0b0d";

const FULLSCREEN_RETRY_MS = [0, 120, 320, 720, 1_500] as const;

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
  const contentInset = webApp.contentSafeAreaInset;
  const deviceInset = webApp.safeAreaInset;
  const top = (contentInset?.top ?? 0) + (deviceInset?.top ?? 0);
  const bottom = (contentInset?.bottom ?? 0) + (deviceInset?.bottom ?? 0);
  const root = document.documentElement;
  root.style.setProperty("--tma-safe-area-bottom", `${bottom}px`);
  root.style.setProperty("--tma-safe-area-top", `${top}px`);
  root.style.setProperty("--tma-content-safe-top", `${contentInset?.top ?? 0}px`);
  root.dataset.tmaFullscreen = webApp.isFullscreen ? "true" : "false";
}

function setTelegramChromeColors(webApp: TelegramWebApp): void {
  try {
    webApp.setHeaderColor(PUMP_TMA_CHROME_BG);
    webApp.setBackgroundColor(PUMP_TMA_CHROME_BG);
  } catch {
    try {
      webApp.setHeaderColor("bg_color");
      webApp.setBackgroundColor("bg_color");
    } catch {
      /* older clients */
    }
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

function scheduleTelegramFullscreen(webApp: TelegramWebApp): void {
  for (const delay of FULLSCREEN_RETRY_MS) {
    window.setTimeout(() => requestTelegramFullscreen(webApp), delay);
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
  scheduleTelegramFullscreen(webApp);

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

/** Inline boot snippet for beforeInteractive script in layout. */
export const TELEGRAM_MINI_APP_EARLY_BOOT_SCRIPT = `(function(){var BG="#0a0b0d";function fs(tg){if(typeof tg.requestFullscreen!=="function"||tg.isFullscreen)return;try{tg.requestFullscreen();}catch(e){}}function boot(){var tg=window.Telegram&&window.Telegram.WebApp;if(!tg)return false;if(!tg.initData&&(!tg.platform||tg.platform==="unknown"))return false;document.documentElement.dataset.tma="true";tg.ready();try{tg.setHeaderColor(BG);tg.setBackgroundColor(BG);}catch(e){try{tg.setHeaderColor("bg_color");tg.setBackgroundColor("bg_color");}catch(err){}}if(!tg.isExpanded)tg.expand();fs(tg);[120,320,720,1500].forEach(function(ms){setTimeout(function(){fs(tg);},ms);});return true;}if(!boot()){var tries=0,timer=setInterval(function(){tries+=1;if(boot()||tries>40)clearInterval(timer);},50);}})();`;
