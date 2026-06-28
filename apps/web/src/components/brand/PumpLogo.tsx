import { PUMP_LOGO } from "@/lib/pump-logo-paths";

type PumpLogoProps = {
  /** Glyph follows theme; rounded is the app-icon plate (favicon style). */
  variant?: "glyph" | "rounded";
  size?: number;
  className?: string;
};

export function PumpLogo({ variant = "glyph", size = 32, className = "" }: PumpLogoProps) {
  if (variant === "rounded") {
    return (
      <img
        src={PUMP_LOGO.rounded}
        alt=""
        width={size}
        height={size}
        className={`pump-logo pump-logo--rounded ${className}`.trim()}
        aria-hidden
        decoding="async"
      />
    );
  }

  return (
    <span
      className={`pump-logo pump-logo--glyph ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <img
        src={PUMP_LOGO.glyphLight}
        alt=""
        width={size}
        height={size}
        className="pump-logo__theme pump-logo__theme--light"
        decoding="async"
      />
      <img
        src={PUMP_LOGO.glyphDark}
        alt=""
        width={size}
        height={size}
        className="pump-logo__theme pump-logo__theme--dark"
        decoding="async"
      />
    </span>
  );
}
