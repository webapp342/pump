import { modal } from "@reown/appkit/react";
import { pumpChain } from "@/config/chain";
import "@/lib/appkit";

export function openOnRamp() {
  void modal?.open({ view: "OnRampProviders" });
}

export const FUNDING_CHAIN_LABEL = `${pumpChain.name} · ${pumpChain.nativeCurrency.symbol}`;

export const DEPOSIT_WARNINGS = [
  `Send only native ${pumpChain.nativeCurrency.symbol} on ${pumpChain.name} (chain ID ${pumpChain.id}).`,
  "Do not send tokens, NFTs, or other assets to this address.",
  "Deposits from the wrong network or asset type may be lost permanently.",
  "Confirm the destination network in your exchange or sending wallet before you submit.",
  "Allow a few minutes for on-chain deposits to appear in your balance.",
] as const;
