import { createHash, createHmac, timingSafeEqual } from "crypto";

export type TelegramLoginPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

const MAX_AUTH_AGE_SECONDS = 86_400;

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || token === "CHANGE_ME") {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  return token;
}

export function verifyTelegramLogin(payload: TelegramLoginPayload): boolean {
  const { hash, ...rest } = payload;
  if (!hash || typeof hash !== "string") return false;
  if (!Number.isFinite(rest.id) || rest.id <= 0) return false;
  if (!Number.isFinite(rest.auth_date) || rest.auth_date <= 0) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - rest.auth_date > MAX_AUTH_AGE_SECONDS) return false;

  const dataCheckString = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHash("sha256").update(getBotToken()).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}
