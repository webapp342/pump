"use client";

import { useCallback } from "react";
import { useAppKit } from "@reown/appkit/react";

export function useOpenConnectModal() {
  const { open } = useAppKit();

  const openConnectModal = useCallback(() => {
    open();
  }, [open]);

  return { openConnectModal };
}
