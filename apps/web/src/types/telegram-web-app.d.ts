/** Minimal types for https://telegram.org/js/telegram-web-app.js (injected in Telegram WebView). */
interface TelegramWebAppSafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramWebAppFullscreenFailedEvent {
  error?: "UNSUPPORTED" | "ALREADY_FULLSCREEN" | string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      photo_url?: string;
    };
  };
  platform: string;
  version: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  isExpanded: boolean;
  isFullscreen?: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  safeAreaInset?: TelegramWebAppSafeAreaInset;
  contentSafeAreaInset?: TelegramWebAppSafeAreaInset;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  close: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  onEvent: (eventType: string, callback: (...args: unknown[]) => void) => void;
  offEvent: (eventType: string, callback: (...args: unknown[]) => void) => void;
}

interface TelegramNamespace {
  WebApp: TelegramWebApp;
}

interface Window {
  Telegram?: TelegramNamespace;
}
