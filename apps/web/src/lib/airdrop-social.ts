import { openExternalUrl } from "@/lib/open-external-url";

export const AIRDROP_SOCIAL_TASK_TYPES = [
  { value: "FOLLOW_X", label: "Follow us on X", action: "Follow →" },
  { value: "JOIN_TELEGRAM", label: "Join our Telegram", action: "Join →" },
  { value: "JOIN_DISCORD", label: "Join our Discord server", action: "Join →" },
  { value: "VISIT_WEBSITE", label: "Visit website", action: "Visit →" },
  { value: "RETWEET_X", label: "Retweet our X post", action: "Retweet →" },
] as const;

const TWEET_URL_PATTERN = /(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i;
const TWEET_PATH_PATTERN = /\/status\/(\d+)/i;
const X_PROFILE_PATH_PATTERN = /^\/([A-Za-z0-9_]{1,15})\/?$/;
const X_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const TELEGRAM_HOSTS = new Set(["t.me", "telegram.me", "www.t.me", "www.telegram.me"]);
const DISCORD_INVITE_PATH = /(?:^|\/)invite\/([A-Za-z0-9-]+)/i;
const DISCORD_GG_PATH = /^(?:https?:\/\/)?(?:www\.)?discord\.gg\/([A-Za-z0-9-]+)/i;

const RESERVED_X_PATHS = new Set([
  "intent",
  "home",
  "search",
  "explore",
  "messages",
  "notifications",
  "i",
  "settings",
  "share",
  "hashtag",
  "compose",
]);

export type AirdropSocialTaskType = (typeof AIRDROP_SOCIAL_TASK_TYPES)[number]["value"];

export type SocialTaskOpenTarget = {
  webUrl: string;
  appUrl?: string;
  telegramMiniAppLink?: boolean;
};

export type SocialTaskDraft = {
  taskType: AirdropSocialTaskType;
  targetUrl: string;
  enabled: boolean;
};

export function createDefaultSocialTasks(): SocialTaskDraft[] {
  return AIRDROP_SOCIAL_TASK_TYPES.map((task) => ({
    taskType: task.value,
    targetUrl: "",
    enabled: false,
  }));
}

export function socialTaskLabel(taskType: string): string {
  return AIRDROP_SOCIAL_TASK_TYPES.find((t) => t.value === taskType)?.label ?? taskType;
}

export function socialTaskActionLabel(taskType: string): string {
  return AIRDROP_SOCIAL_TASK_TYPES.find((t) => t.value === taskType)?.action ?? "Open →";
}

export function parseXUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.replace(/^www\./, "");
      if (host !== "x.com" && host !== "twitter.com" && host !== "mobile.twitter.com") {
        return null;
      }
      const match = parsed.pathname.match(X_PROFILE_PATH_PATTERN);
      const username = match?.[1];
      if (!username || RESERVED_X_PATHS.has(username.toLowerCase())) return null;
      return username;
    } catch {
      return null;
    }
  }

  const username = trimmed.replace(/^@/, "");
  if (!X_USERNAME_PATTERN.test(username)) return null;
  return username;
}

export function parseTweetIdFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const fullMatch = trimmed.match(TWEET_URL_PATTERN);
  if (fullMatch?.[1]) return fullMatch[1];

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com" && host !== "mobile.twitter.com") {
      return null;
    }
    const pathMatch = parsed.pathname.match(TWEET_PATH_PATTERN);
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    return null;
  }

  return null;
}

export function isTweetUrl(url: string): boolean {
  return parseTweetIdFromUrl(url) != null;
}

/** Normalize creator input before saving to DB. */
export function normalizeSocialTaskTarget(taskType: string, value: string): string {
  const trimmed = value.trim();
  if (taskType === "FOLLOW_X") {
    return parseXUsername(trimmed) ?? trimmed.replace(/^@/, "");
  }
  return trimmed;
}

function parseDiscordInviteCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const shortMatch = trimmed.match(DISCORD_GG_PATH);
  if (shortMatch?.[1]) return shortMatch[1];

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host !== "discord.com" && host !== "discord.gg") return null;
    const pathMatch = parsed.pathname.match(DISCORD_INVITE_PATH);
    return pathMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

function parseTelegramTarget(input: string): { webUrl: string; appUrl?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.replace(/^www\./, "");
      if (!TELEGRAM_HOSTS.has(host)) return null;

      const joinChatMatch = parsed.pathname.match(/^\/joinchat\/([A-Za-z0-9_-]+)/i);
      if (joinChatMatch?.[1]) {
        return {
          webUrl: `https://t.me/joinchat/${joinChatMatch[1]}`,
          appUrl: `tg://join?invite=${joinChatMatch[1]}`,
        };
      }

      const plusInviteMatch = parsed.pathname.match(/^\/\+([A-Za-z0-9_-]+)/);
      if (plusInviteMatch?.[1]) {
        return {
          webUrl: `https://t.me/+${plusInviteMatch[1]}`,
          appUrl: `tg://join?invite=${plusInviteMatch[1]}`,
        };
      }

      const usernameMatch = parsed.pathname.match(/^\/([A-Za-z0-9_]{3,})$/);
      if (usernameMatch?.[1]) {
        return {
          webUrl: `https://t.me/${usernameMatch[1]}`,
          appUrl: `tg://resolve?domain=${usernameMatch[1]}`,
        };
      }

      return { webUrl: trimmed };
    } catch {
      return null;
    }
  }

  const username = trimmed.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{3,}$/.test(username)) return null;
  return {
    webUrl: `https://t.me/${username}`,
    appUrl: `tg://resolve?domain=${username}`,
  };
}

/** Resolve web + optional native app URLs for a participant social task. */
export function resolveSocialTaskOpenTarget(
  taskType: string,
  targetUrl: string
): SocialTaskOpenTarget {
  const trimmed = targetUrl.trim();

  if (taskType === "FOLLOW_X") {
    const username = parseXUsername(trimmed);
    if (username) {
      return {
        webUrl: `https://x.com/intent/follow?screen_name=${encodeURIComponent(username)}`,
        appUrl: `twitter://user?screen_name=${encodeURIComponent(username)}`,
      };
    }
  }

  if (taskType === "RETWEET_X") {
    const tweetId = parseTweetIdFromUrl(trimmed);
    if (tweetId) {
      return {
        webUrl: `https://x.com/intent/retweet?tweet_id=${tweetId}`,
        appUrl: `twitter://status?id=${tweetId}`,
      };
    }
  }

  if (taskType === "JOIN_TELEGRAM") {
    const telegram = parseTelegramTarget(trimmed);
    if (telegram) {
      return {
        webUrl: telegram.webUrl,
        appUrl: telegram.appUrl,
        telegramMiniAppLink: true,
      };
    }
  }

  if (taskType === "JOIN_DISCORD") {
    const inviteCode = parseDiscordInviteCode(trimmed);
    if (inviteCode) {
      return {
        webUrl: `https://discord.gg/${inviteCode}`,
        appUrl: `discord://discord.com/invite/${inviteCode}`,
      };
    }
  }

  return { webUrl: trimmed };
}

/** URL opened when a participant clicks a social task (web fallback). */
export function socialTaskParticipantUrl(taskType: string, targetUrl: string): string {
  return resolveSocialTaskOpenTarget(taskType, targetUrl).webUrl;
}

/** Open social task with mobile deep link / Telegram Mini App handling. */
export function openSocialTaskParticipantUrl(taskType: string, targetUrl: string): void {
  openExternalUrl(resolveSocialTaskOpenTarget(taskType, targetUrl));
}

/** Participant-facing task title (preview + airdrop detail). */
export function socialTaskPreviewLabel(taskType: string, _targetUrl?: string): string {
  return socialTaskLabel(taskType);
}

export function socialTaskInputPlaceholder(taskType: string): string {
  if (taskType === "FOLLOW_X") return "username";
  if (taskType === "RETWEET_X") return "https://x.com/user/status/1234567890";
  return "https://...";
}

export function socialTaskUrlHint(taskType: string): string {
  if (taskType === "FOLLOW_X") {
    return "X username to follow — participants get the follow dialog.";
  }
  if (taskType === "RETWEET_X") {
    return "Paste the tweet link — participants get the X retweet dialog.";
  }
  return "Add the link participants will open.";
}

export function socialTaskUsesUsernameInput(taskType: string): boolean {
  return taskType === "FOLLOW_X";
}

export function validateSocialTaskUrl(taskType: string, targetUrl: string): string | null {
  const trimmed = targetUrl.trim();
  if (!trimmed) {
    return taskType === "FOLLOW_X" ? "X username is required" : "URL is required";
  }

  if (taskType === "FOLLOW_X") {
    if (!parseXUsername(trimmed)) {
      return "Enter a valid X username (e.g. pump or @pump)";
    }
    return null;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return "URL must start with http:// or https://";
  }

  if (taskType === "RETWEET_X" && !isTweetUrl(trimmed)) {
    return "Use a valid X/Twitter tweet link (…/status/123…)";
  }

  return null;
}

/** @deprecated Use socialTaskInputPlaceholder */
export function socialTaskUrlPlaceholder(taskType: string): string {
  return socialTaskInputPlaceholder(taskType);
}
