import { pumpChain } from "@/config/chain";

/** Card on-ramp — configure Privy funding in dashboard; AppKit on-ramp removed. */
export function openOnRamp() {
  if (typeof window !== "undefined") {
    window.alert(
      `Card on-ramp is not configured yet. Deposit ${pumpChain.nativeCurrency.symbol} to your Pump smart wallet address instead.`
    );
  }
}

export const FUNDING_CHAIN_LABEL = `${pumpChain.name} · ${pumpChain.nativeCurrency.symbol}`;

export const DEPOSIT_WARNINGS = [
  `Send only native ${pumpChain.nativeCurrency.symbol} on ${pumpChain.name} (chain ID ${pumpChain.id}).`,
  "Use your Pump smart wallet address below — not your login email or an external EOA.",
  "Do not send tokens, NFTs, or other assets to this address unless supported.",
  "Deposits from the wrong network or asset type may be lost permanently.",
  "Allow a few minutes for on-chain deposits to appear in your balance.",
] as const;
