import { SOLANA_CLUSTER } from "@/config/solana";

function explorerBase(): string {
  return "https://solscan.io";
}

export function explorerTxUrl(signature: string): string {
  if (SOLANA_CLUSTER === "devnet") {
    return `${explorerBase()}/tx/${signature}?cluster=devnet`;
  }
  if (SOLANA_CLUSTER === "localnet") {
    return `https://explorer.solana.com/tx/${signature}?cluster=custom`;
  }
  return `${explorerBase()}/tx/${signature}`;
}

export function explorerAddressUrl(address: string): string {
  if (SOLANA_CLUSTER === "devnet") {
    return `${explorerBase()}/account/${address}?cluster=devnet`;
  }
  if (SOLANA_CLUSTER === "localnet") {
    return `https://explorer.solana.com/address/${address}?cluster=custom`;
  }
  return `${explorerBase()}/account/${address}`;
}

export const SOLANA_FUNDING_CHAIN_LABEL =
  SOLANA_CLUSTER === "mainnet-beta"
    ? "Solana · SOL"
    : SOLANA_CLUSTER === "devnet"
      ? "Solana Devnet · SOL"
      : "Solana Local · SOL";
