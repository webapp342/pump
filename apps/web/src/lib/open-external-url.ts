import { getTelegramWebApp } from "@/lib/telegram/mini-app";

export type ExternalOpenTarget = {
  webUrl: string;
  appUrl?: string;
  /** t.me / telegram.me — use Telegram.WebApp.openTelegramLink when inside TMA */
  telegramMiniAppLink?: boolean;
};

export function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function tryOpenMobileApp(appUrl: string, webUrl: string): void {
  let handedOff = false;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") handedOff = true;
  };
  const onBlur = () => {
    handedOff = true;
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);

  window.open(appUrl, "_blank");

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    if (!handedOff) {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }
  }, 700);
}

/** Opens a participant / external URL with Telegram Mini App + mobile deep-link handling. */
export function openExternalUrl(target: ExternalOpenTarget): void {
  const webApp = getTelegramWebApp();

  if (webApp) {
    if (target.telegramMiniAppLink && typeof webApp.openTelegramLink === "function") {
      webApp.openTelegramLink(target.webUrl);
      return;
    }
    if (typeof webApp.openLink === "function") {
      webApp.openLink(target.webUrl);
      return;
    }
  }

  if (isMobileUserAgent() && target.appUrl) {
    tryOpenMobileApp(target.appUrl, target.webUrl);
    return;
  }

  window.open(target.webUrl, "_blank", "noopener,noreferrer");
}
