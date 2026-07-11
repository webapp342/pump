"use client";

import { materialSymbols } from "@/lib/material-symbols-font";

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
};

/** Material Symbols Rounded — use icons from `@/lib/pump-icons`. */
export function PumpIcon({ icon, className = "", fixedWidth = false }: PumpIconProps) {
  const spec = resolveSymbol(icon);

  return (
    <span
      className={[
        materialSymbols.className,
        "material-symbols-rounded",
        spec.filled ? "material-symbols-rounded--filled" : "",
        fixedWidth ? "material-symbols-rounded--fixed" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {spec.name}
    </span>
  );
}
