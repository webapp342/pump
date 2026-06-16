export type SharePayload = {
  url: string;
  title: string;
  text: string;
};

export type ShareChannel = {
  id: "x" | "telegram" | "whatsapp" | "email" | "linkedin" | "native";
  label: string;
  href?: string;
  native?: boolean;
};

export function getShareChannels(payload: SharePayload): ShareChannel[] {
  const { url, title, text } = payload;
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  const encodedTitle = encodeURIComponent(title);

  const channels: ShareChannel[] = [
    {
      id: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    },
    {
      id: "telegram",
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    },
    {
      id: "email",
      label: "Email",
      href: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
  ];

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    channels.push({ id: "native", label: "More", native: true });
  }

  return channels;
}

export async function copyShareUrl(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export function referralSharePayload(address: string, origin?: string): SharePayload {
  const url =
    origin != null
      ? `${origin}/?ref=${address}`
      : typeof window !== "undefined"
        ? `${window.location.origin}/?ref=${address}`
        : `/?ref=${address}`;

  return {
    url,
    title: "Join me on Pump",
    text: "Trade memes on BSC with my referral link — connect before your first trade.",
  };
}

export function tokenSharePayload(
  token: { name: string; symbol: string; address: string },
  pageUrl?: string
): SharePayload {
  const url =
    pageUrl ??
    (typeof window !== "undefined"
      ? window.location.href
      : `/token/${token.address}`);

  return {
    url,
    title: `${token.name} ($${token.symbol})`,
    text: `Trade $${token.symbol} on Pump — BSC meme launchpad.`,
  };
}
