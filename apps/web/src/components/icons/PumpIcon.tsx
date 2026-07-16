"use client";

import { glyphMap } from "@coinbase/cds-icons/glyphMap";
import type { IconName } from "@coinbase/cds-icons/IconName";
import { coinbaseIcons } from "@/lib/coinbase-icons-font";
import { ICON_SIZE, iconSizeClass, type IconSizeRole } from "@/lib/ui-sizes";

export type CdsIconSpec = {
  name: IconName | (string & {});
  /** Default active when caller omits `active` prop. */
  active?: boolean;
};

export type PumpIconDefinition = IconName | (string & {}) | CdsIconSpec;
export type PumpIconProp = PumpIconDefinition;

export type CdsIconSize = "xs" | "s" | "m" | "l";

function resolveSpec(icon: PumpIconDefinition): CdsIconSpec {
  if (typeof icon === "string") return { name: icon, active: false };
  if (typeof icon === "object" && icon != null && typeof icon.name === "string" && icon.name.length > 0) {
    return { name: icon.name, active: icon.active ?? false };
  }
  return { name: "questionMark", active: false };
}

function resolveCdsSize(size: IconSizeRole | number | CdsIconSize): {
  cds: CdsIconSize;
  sourcePx: 12 | 16 | 24;
  sizeClass: string;
  inlinePx?: number;
} {
  if (size === "xs" || size === "s" || size === "m" || size === "l") {
    const sourcePx = size === "xs" ? 12 : size === "s" ? 16 : 24;
    return { cds: size, sourcePx, sizeClass: `pump-cds-icon--${size}` };
  }

  if (typeof size === "string") {
    const px = ICON_SIZE[size];
    const sourcePx = px <= 12 ? 12 : px <= 16 ? 16 : 24;
    const cds: CdsIconSize = px <= 12 ? "xs" : px <= 16 ? "s" : px <= 20 ? "m" : "l";
    return { cds, sourcePx, sizeClass: iconSizeClass(size) };
  }

  const sourcePx = size <= 12 ? 12 : size <= 16 ? 16 : 24;
  const cds: CdsIconSize = size <= 12 ? "xs" : size <= 16 ? "s" : size <= 20 ? "m" : "l";
  const sizeClass =
    size === ICON_SIZE.xs
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
  return {
    cds,
    sourcePx,
    sizeClass,
    inlinePx: sizeClass ? undefined : size,
  };
}

type PumpIconProps = {
  /** CDS icon name or `{ name, active? }` from `@/lib/pump-icons`. */
  icon: PumpIconDefinition;
  /** CDS active/filled state — overrides definition default when set. */
  active?: boolean;
  className?: string;
  fixedWidth?: boolean;
  /** Named role, CDS size, or px. Prefer `xs`–`xl` from `ICON_SIZE`. Default: `md` (20). */
  size?: IconSizeRole | number | CdsIconSize;
};

/**
 * Coinbase CDS Icons (`@coinbase/cds-icons`) via icon font + glyphMap.
 * Use `active` for filled/selected variants (nav, favorites, bookmarks).
 */
export function PumpIcon({
  icon,
  active: activeProp,
  className = "",
  fixedWidth = false,
  size = "md",
}: PumpIconProps) {
  const spec = resolveSpec(icon);
  const active = activeProp ?? spec.active ?? false;
  const { sourcePx, sizeClass, inlinePx } = resolveCdsSize(size);
  const glyphKey = `${spec.name}-${sourcePx}-${active ? "active" : "inactive"}`;
  const glyph = glyphMap[glyphKey as keyof typeof glyphMap];

  if (glyph === undefined && process.env.NODE_ENV !== "production") {
    console.error(`[PumpIcon] Missing CDS glyph "${glyphKey}"`);
  }

  const inlineStyle =
    inlinePx != null
      ? ({
          fontSize: inlinePx,
          width: inlinePx,
          height: inlinePx,
          lineHeight: 1,
        } as const)
      : undefined;

  return (
    <span
      className={[
        coinbaseIcons.className,
        "pump-cds-icon",
        /* Back-compat: existing CSS targets material-symbols-rounded for size hooks */
        "material-symbols-rounded",
        active ? "material-symbols-rounded--filled" : "",
        fixedWidth ? "pump-cds-icon--fixed material-symbols-rounded--fixed" : "",
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={inlineStyle}
      aria-hidden
    >
      {glyph ?? ""}
    </span>
  );
}
