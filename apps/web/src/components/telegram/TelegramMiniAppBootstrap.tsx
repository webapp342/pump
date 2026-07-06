"use client";

import Script from "next/script";
import { useEffect } from "react";
import {
  bindTelegramMiniAppEvents,
  bootstrapTelegramMiniApp,
  getTelegramWebApp,
  isTelegramMiniAppClient,
} from "@/lib/telegram/mini-app";

const TELEGRAM_WEB_APP_SCRIPT = "https://telegram.org/js/telegram-web-app.js?59";

function initTelegramMiniApp(): void {
  if (!isTelegramMiniAppClient()) return;

  bootstrapTelegramMiniApp();

  const webApp = getTelegramWebApp();
  if (webApp) {
    bindTelegramMiniAppEvents(webApp);
  }
}

/**
 * Loads Telegram WebApp JS and activates Mini App chrome when opened inside Telegram.
 * Normal browser visits are unchanged.
 */
export function TelegramMiniAppBootstrap() {
  useEffect(() => {
    initTelegramMiniApp();
  }, []);

  return (
    <>
      <Script id="tma-early-boot" strategy="beforeInteractive">
        {`(function(){function boot(){var tg=window.Telegram&&window.Telegram.WebApp;if(!tg)return false;if(!tg.initData&&(!tg.platform||tg.platform==="unknown"))return false;document.documentElement.dataset.tma="true";tg.ready();try{tg.setHeaderColor("secondary_bg_color");tg.setBackgroundColor("bg_color");}catch(e){}if(!tg.isExpanded)tg.expand();if(typeof tg.requestFullscreen==="function"&&!tg.isFullscreen){try{tg.requestFullscreen();}catch(e){}}return true;}if(!boot()){var tries=0,timer=setInterval(function(){tries+=1;if(boot()||tries>40)clearInterval(timer);},50);}})();`}
      </Script>
      <Script
        id="telegram-web-app"
        src={TELEGRAM_WEB_APP_SCRIPT}
        strategy="beforeInteractive"
        onReady={initTelegramMiniApp}
      />
    </>
  );
}
