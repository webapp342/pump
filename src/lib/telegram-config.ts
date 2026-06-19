export const telegramBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";

export function isTelegramAuthConfigured(): boolean {
  return Boolean(
    telegramBotUsername &&
      telegramBotUsername !== "CHANGE_ME" &&
      process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_BOT_TOKEN !== "CHANGE_ME"
  );
}
