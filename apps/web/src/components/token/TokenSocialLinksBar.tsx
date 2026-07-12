import {
  DiscordBrandIcon,
  TelegramBrandIcon,
  WebsiteBrandIcon,
  XBrandIcon,
} from "@/components/icons/BrandIcons";
import { hasSocialLinks, type TokenSocialLinks } from "@/lib/token-social";

type TokenSocialLinksBarProps = {
  links: TokenSocialLinks;
  inline?: boolean;
  variant?: "default" | "mobile" | "toolbar";
};

const LINK_ITEMS = [
  { key: "twitter" as const, label: "X", mobileLabel: "X" },
  { key: "website" as const, label: "Website", mobileLabel: "Web" },
  { key: "telegram" as const, label: "Telegram", mobileLabel: "Telegram" },
  { key: "discord" as const, label: "Discord", mobileLabel: "Discord" },
] as const;

function SocialIcon({ type }: { type: (typeof LINK_ITEMS)[number]["key"] }) {
  switch (type) {
    case "twitter":
      return <XBrandIcon className="h-3.5 w-3.5" />;
    case "website":
      return <WebsiteBrandIcon className="h-3.5 w-3.5" />;
    case "telegram":
      return <TelegramBrandIcon className="h-3.5 w-3.5" />;
    case "discord":
      return <DiscordBrandIcon className="h-3.5 w-3.5" />;
  }
}

export function TokenSocialLinksBar({
  links,
  inline = false,
  variant = "default",
}: TokenSocialLinksBarProps) {
  if (!hasSocialLinks(links)) return null;

  const activeLinks = LINK_ITEMS.filter(({ key }) => links[key]);

  if (variant === "toolbar") {
    return (
      <div className="token-detail-toolbar__social">
        {activeLinks.map(({ key, label }) => (
          <a
            key={key}
            href={links[key]}
            target="_blank"
            rel="noopener noreferrer"
            className="token-detail-toolbar__social-btn"
            aria-label={label}
            title={label}
          >
            <SocialIcon type={key} />
          </a>
        ))}
      </div>
    );
  }

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
