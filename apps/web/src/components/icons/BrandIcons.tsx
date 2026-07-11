import { PumpIcon } from "@/lib/icons";
import {
  faApple,
  faDiscord,
  faGoogle,
  faLinkedin,
  faTelegram,
  faWhatsapp,
  faXTwitter,
} from "@/lib/pump-icons";

type BrandIconProps = {
  className?: string;
};

export function XBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <PumpIcon icon={faXTwitter} className={className} />;
}

export function TelegramBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <PumpIcon icon={faTelegram} className={className} />;
}

export function DiscordBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <PumpIcon icon={faDiscord} className={className} />;
}

export function WhatsAppBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <PumpIcon icon={faWhatsapp} className={className} />;
}

export function LinkedInBrandIcon({ className = "h-4 w-4" }: BrandIconProps) {
  return <PumpIcon icon={faLinkedin} className={className} />;
}

export function GoogleBrandIcon({ className = "h-5 w-5 shrink-0" }: BrandIconProps) {
  return <PumpIcon icon={faGoogle} className={className} />;
}

export function AppleBrandIcon({ className = "h-5 w-5 shrink-0" }: BrandIconProps) {
  return <PumpIcon icon={faApple} className={className} />;
}
