import { hasSocialLinks, type TokenSocialLinks } from "@/lib/token-social";

type TokenSocialLinksBarProps = {
  links: TokenSocialLinks;
  inline?: boolean;
  variant?: "default" | "mobile";
};

const LINK_ITEMS = [
  { key: "twitter" as const, label: "X", mobileLabel: "X" },
  { key: "website" as const, label: "Website", mobileLabel: "Web" },
  { key: "telegram" as const, label: "Telegram", mobileLabel: "Telegram" },
  { key: "discord" as const, label: "Discord", mobileLabel: "Discord" },
] as const;

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-current">
      <path d="M13.2 10.5 19.4 3h-1.5l-5.4 6.5L8.1 3H3.2l6.5 9.4L3.2 21h1.5l5.7-6.9 5.1 6.9h4.9l-6.8-9.5Z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current">
      <circle cx="12" cy="12" r="9" strokeWidth="1.6" />
      <path d="M3 12h18M12 3c2.5 2.8 2.5 14.2 0 18M12 3c-2.5 2.8-2.5 14.2 0 18" strokeWidth="1.6" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current">
      <path
        d="M20.5 4.5 4.8 11.1c-.9.4-.9 1.6.1 1.9l4 1.2 1.5 4.7c.3.9 1.5.9 1.8 0l1.7-5.9 5.3-7.5c.5-.7-.1-1.6-.9-1.2Z"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.8 13.2 15.8 8.5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-current">
      <path d="M18.9 6.2A15.4 15.4 0 0 0 15.3 5c-.2.3-.4.8-.5 1.1a14.2 14.2 0 0 0-4.6 0C9.9 5.8 9.7 5.3 9.5 5a15.4 15.4 0 0 0-3.6 1.2C4.5 9.4 3.8 12.5 4.1 15.5a15.6 15.6 0 0 0 4.8 2.4c.4-.5.7-1.1 1-1.7-.5-.2-1.1-.5-1.5-.8l.4-.3c2.9 1.3 6.1 1.3 8.9 0l.4.3c-.5.3-1 .6-1.6.8.3.6.6 1.2 1 1.7a15.5 15.5 0 0 0 4.8-2.4c.4-3.5-.6-6.5-2.1-9.3ZM9.7 13.8c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6Zm4.6 0c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6Z" />
    </svg>
  );
}

function SocialIcon({ type }: { type: (typeof LINK_ITEMS)[number]["key"] }) {
  switch (type) {
    case "twitter":
      return <XIcon />;
    case "website":
      return <GlobeIcon />;
    case "telegram":
      return <TelegramIcon />;
    case "discord":
      return <DiscordIcon />;
  }
}

export function TokenSocialLinksBar({
  links,
  inline = false,
  variant = "default",
}: TokenSocialLinksBarProps) {
  if (!hasSocialLinks(links)) return null;

  const activeLinks = LINK_ITEMS.filter(({ key }) => links[key]);

  if (variant === "mobile") {
    return (
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {activeLinks.map(({ key, mobileLabel }) => (
          <a
            key={key}
            href={links[key]}
            target="_blank"
            rel="noopener noreferrer"
            className="toolbar-btn shrink-0"
          >
            <SocialIcon type={key} />
            <span>{mobileLabel}</span>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div
      className={
        inline
          ? "flex shrink-0 flex-wrap items-center gap-1.5"
          : "mt-3 flex flex-wrap gap-2"
      }
    >
      {activeLinks.map(({ key, label }) => (
        <a
          key={key}
          href={links[key]}
          target="_blank"
          rel="noopener noreferrer"
          className={
            inline
              ? "toolbar-btn !h-auto py-1"
              : "toolbar-btn !h-auto py-1.5"
          }
        >
          <SocialIcon type={key} />
          <span>{label}</span>
        </a>
      ))}
    </div>
  );
}
