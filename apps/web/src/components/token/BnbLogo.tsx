import { NativeLogo } from "@/components/token/NativeLogo";
import type { TokenLogoSizeRole } from "@/lib/ui-sizes";

/** @deprecated Use NativeLogo — kept for existing imports. */
export function BnbLogo({
  size = "sm",
  className = "",
}: {
  size?: number | TokenLogoSizeRole;
  className?: string;
}) {
  return <NativeLogo size={size} className={className} />;
}
