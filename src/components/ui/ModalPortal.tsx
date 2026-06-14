"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalPortalProps = {
  open: boolean;
  children: ReactNode;
};

export function ModalPortal({ open, children }: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(children, document.body);
}
