"use client";

import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";

/** Reconnect wagmi connector after Telegram login sets the EIP-1193 provider. */
export function PumpWagmiSetup() {
  const { authenticated, scwAddress } = usePumpWallet();
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  useEffect(() => {
    if (!authenticated || !scwAddress || isConnected) return;
    const connector = connectors.find((item) => item.id === "pump-kernel");
    if (!connector) return;
    void connect({ connector });
  }, [authenticated, scwAddress, isConnected, connect, connectors]);

  return null;
}

/** @deprecated Use PumpWagmiSetup */
export const ZeroDevWagmiSetup = PumpWagmiSetup;
