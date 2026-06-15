import type { LucideIcon } from "lucide-react";
import type { ElementType, ReactNode } from "react";
import { ICON_STROKE } from "@/lib/icons";

type IconLabelProps = {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  iconClassName?: string;
  /** Hide icon below md — use on tight mobile stat cards */
  hideIconMobile?: boolean;
  as?: ElementType;
};

export function IconLabel({
  icon: Icon,
  children,
  className = "",
  iconClassName = "h-3.5 w-3.5 shrink-0 opacity-75",
  hideIconMobile = false,
  as: Tag = "span",
}: IconLabelProps) {
  const iconCls = `${iconClassName}${hideIconMobile ? " hidden md:block" : ""}`;

  return (
    <Tag className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <Icon className={iconCls} strokeWidth={ICON_STROKE} aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </Tag>
  );
}

export function SectionHeadingIcon({
  icon: Icon,
  children,
  className = "",
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`section-heading inline-flex items-center gap-2 ${className}`}>
      <Icon
        className="h-[1.05em] w-[1.05em] shrink-0 text-pump-accent"
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
      {children}
    </h2>
  );
}

export function TableHeaderLabel({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children: ReactNode;
}) {
  if (!Icon) return <>{children}</>;

  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3 w-3 shrink-0 opacity-70" strokeWidth={ICON_STROKE} aria-hidden />
      {children}
    </span>
  );
}
