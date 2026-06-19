"use client";

import { useCallback } from "react";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";

export function useOpenConnectModal() {
  const { login } = usePumpWallet();

  const openConnectModal = useCallback(() => {
    login();
  }, [login]);

  return { openConnectModal };
}
