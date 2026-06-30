"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMobileModalScrollLock } from "@/hooks/useMobileModalScrollLock";

type ModalPortalProps = {
  open: boolean;
  children: ReactNode;
};

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function ModalPortal({ open, children }: ModalPortalProps) {
  const isClient = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  useMobileModalScrollLock(open);

  if (!open || !isClient) return null;

  return createPortal(children, document.body);
}
