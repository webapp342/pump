"use client";

import { materialSymbols } from "@/lib/material-symbols-font";
import { ICON_SIZE, iconSizeClass, type IconSizeRole } from "@/lib/ui-sizes";

export type MaterialSymbolSpec = {
  name: string;
  filled?: boolean;
};

export type PumpIconDefinition = string | MaterialSymbolSpec;
export type PumpIconProp = PumpIconDefinition;

function resolveSymbol(icon: PumpIconDefinition): MaterialSymbolSpec {
  if (typeof icon === "string") return { name: icon, filled: false };
  if (typeof icon === "object" && icon != null && typeof icon.name === "string" && icon.name.length > 0) {
    return { name: icon.name, filled: icon.filled ?? false };
  }
  return { name: "help", filled: false };
}

type PumpIconProps = {
  icon: PumpIconDefinition;
  className?: string;
  fixedWidth?: boolean;
  /** Named role or px. Prefer `xs`–`xl` from `ICON_SIZE`. Default: `md` (20). */
  size?: IconSizeRole | number;
};

/** Material Symbols Rounded — use icons from `@/lib/pump-icons`. */
export function PumpIcon({ icon, className = "", fixedWidth = false, size = "md" }: PumpIconProps) {
  const spec = resolveSymbol(icon);
  const sizeClass =
    typeof size === "string"
      ? iconSizeClass(size)
      : size === ICON_SIZE.xs
        ? "icon-xs"
        : size === ICON_SIZE.sm
          ? "icon-sm"
          : size === ICON_SIZE.md
            ? "icon-md"
            : size === ICON_SIZE.lg
              ? "icon-lg"
              : size === ICON_SIZE.xl
                ? "icon-xl"
                : "";
  const inlineStyle =
    typeof size === "number" && !sizeClass
      ? ({ fontSize: size, width: size, height: size, lineHeight: 1 } as const)
      : undefined;

  return (
    <span
      className={[
        materialSymbols.className,
        "material-symbols-rounded",
        spec.filled ? "material-symbols-rounded--filled" : "",
        fixedWidth ? "material-symbols-rounded--fixed" : "",
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={inlineStyle}
      aria-hidden
    >
      {spec.name}
    </span>
  );
}
