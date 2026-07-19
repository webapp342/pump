"use client";

import { useAccount } from "wagmi";
import { usePumpWallet } from "@/components/wallet/PumpWalletProvider";
import { isSolanaChainFamily } from "@/config/chain-family";

/** Custodial wallet address for the active chain family (base58 on Solana, 0x on EVM). */
export function useActiveWalletAddress() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { walletAddress: solanaAddress, isWalletReady, authenticated } = usePumpWallet();

  if (isSolanaChainFamily) {
    return {
      address: solanaAddress,
      isConnected: Boolean(isWalletReady && authenticated && solanaAddress),
    };
  }

  return {
    address: wagmiAddress,
    isConnected: wagmiConnected,
  };
}
