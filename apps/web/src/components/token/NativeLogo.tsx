import Image from "next/image";
import { NATIVE_SYMBOL } from "@/config/chain";
import ethLogoSrc from "@/app/logos/eth-diamond-(white).svg";
import { TOKEN_LOGO_SIZE, type TokenLogoSizeRole } from "@/lib/ui-sizes";

function resolveLogoPx(size: number | TokenLogoSizeRole | undefined): number {
  if (size == null) return TOKEN_LOGO_SIZE.sm;
  if (typeof size === "number") return size;
  return TOKEN_LOGO_SIZE[size];
}

export function NativeLogo({
  size = "sm",
  className = "",
}: {
  /** Named role or px. Prefer `TOKEN_LOGO_SIZE` roles. Default: `sm` (20). */
  size?: number | TokenLogoSizeRole;
  className?: string;
}) {
  const px = resolveLogoPx(size);
  return (
    <Image
      src={ethLogoSrc}
      alt={NATIVE_SYMBOL}
      width={px}
      height={px}
      className={`native-logo shrink-0 ${className}`}
    />
  );
}
