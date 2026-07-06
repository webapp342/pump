"use client";

import Script from "next/script";
import { useEffect } from "react";
import {
  applyTelegramSafeAreaCss,
  getTelegramWebApp,
  isTelegramMiniAppClient,
} from "@/lib/telegram/mini-app";

const TELEGRAM_WEB_APP_SCRIPT = "https://telegram.org/js/telegram-web-app.js";

function initTelegramMiniApp(): void {
  if (!isTelegramMiniAppClient()) return;

  const webApp = getTelegramWebApp();
  if (!webApp) return;

  const root = document.documentElement;
  root.dataset.tma = "true";

  webApp.ready();
  if (!webApp.isExpanded) {
    webApp.expand();
  }

  applyTelegramSafeAreaCss(webApp);

  try {
    webApp.setHeaderColor("secondary_bg_color");
    webApp.setBackgroundColor("bg_color");
  } catch {
    /* older clients may not support color tokens */
  }

  const onSafeAreaChange = () => applyTelegramSafeAreaCss(webApp);
  webApp.onEvent("safeAreaChanged", onSafeAreaChange);
  webApp.onEvent("contentSafeAreaChanged", onSafeAreaChange);
  webApp.onEvent("viewportChanged", onSafeAreaChange);
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
    <Script
      id="telegram-web-app"
      src={TELEGRAM_WEB_APP_SCRIPT}
      strategy="beforeInteractive"
      onReady={initTelegramMiniApp}
    />
  );
}
