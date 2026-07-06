"use client";

import Script from "next/script";
import { useEffect } from "react";
import {
  bindTelegramMiniAppEvents,
  bootstrapTelegramMiniApp,
  getTelegramWebApp,
  isTelegramMiniAppClient,
  TELEGRAM_MINI_APP_EARLY_BOOT_SCRIPT,
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
        {TELEGRAM_MINI_APP_EARLY_BOOT_SCRIPT}
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
