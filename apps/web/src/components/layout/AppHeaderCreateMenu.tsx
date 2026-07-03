"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PumpIcon, faChevronDown, faPlus } from "@/lib/icons";

const CREATE_OPTIONS = [
  { href: "/create", label: "Token", description: "Launch a meme on the bonding curve" },
  { href: "/airdrops/create", label: "Airdrop", description: "Fund and run a reward campaign" },
] as const;

type AppHeaderCreateMenuProps = {
  pathname: string;
};

export function AppHeaderCreateMenu({ pathname }: AppHeaderCreateMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isCreateRoute =
    pathname.startsWith("/create") || pathname.startsWith("/airdrops/create");

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="app-header-create-menu relative">
      <button
        type="button"
        className={`app-header-create-btn${isCreateRoute ? " app-header-create-btn--active" : ""}${
          open ? " app-header-create-btn--open" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <PumpIcon icon={faPlus} className="app-header-create-btn__icon shrink-0" />
        Create
        <PumpIcon icon={faChevronDown} className="app-header-create-btn__chevron shrink-0" aria-hidden />
      </button>

      {open ? (
        <div className="app-header-create-menu__panel" role="menu">
          {CREATE_OPTIONS.map(({ href, label, description }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                role="menuitem"
                className={
                  active
                    ? "app-header-create-menu__item app-header-create-menu__item--active"
                    : "app-header-create-menu__item"
                }
                onClick={() => setOpen(false)}
              >
                <span className="app-header-create-menu__label">{label}</span>
                <span className="app-header-create-menu__desc">{description}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
