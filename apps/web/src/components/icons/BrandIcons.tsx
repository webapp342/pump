"use client";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faApple,
  faDiscord,
  faGoogle,
  faLinkedin,
  faTelegram,
  faWhatsapp,
  faXTwitter,
} from "@fortawesome/free-brands-svg-icons";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";

type BrandIconProps = {
  className?: string;
};

function FaBrandIcon({
  icon,
  className = "h-4 w-4",
  fixedWidth = false,
}: BrandIconProps & { icon: IconDefinition; fixedWidth?: boolean }) {
  return <FontAwesomeIcon icon={icon} className={className} fixedWidth={fixedWidth} />;
}

export function XBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <FaBrandIcon icon={faXTwitter} className={className} />;
}

export function TelegramBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <FaBrandIcon icon={faTelegram} className={className} />;
}

export function DiscordBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <FaBrandIcon icon={faDiscord} className={className} />;
}

export function WebsiteBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <FaBrandIcon icon={faGlobe} className={className} />;
}

export function WhatsAppBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <FaBrandIcon icon={faWhatsapp} className={className} />;
}

export function LinkedInBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <FaBrandIcon icon={faLinkedin} className={className} />;
}

export function GoogleBrandIcon({ className = "h-5 w-5 shrink-0" }: BrandIconProps) {
  return <FaBrandIcon icon={faGoogle} className={className} />;
}

export function AppleBrandIcon({ className = "h-5 w-5 shrink-0" }: BrandIconProps) {
  return <FaBrandIcon icon={faApple} className={className} />;
}
