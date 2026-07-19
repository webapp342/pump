import { defineChain } from "viem";
import { isSolanaChainFamily } from "./chain-family";
import { NATIVE_SYMBOL as SOL_NATIVE_SYMBOL } from "@pump/solana-sdk";
import { SOLANA_CLUSTER } from "./solana";
import {
  explorerAddressUrl as solanaExplorerAddressUrl,
  explorerTxUrl as solanaExplorerTxUrl,
} from "./solana-explorer";
import { shortSolanaAddress } from "@pump/solana-sdk";

const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

/** Base Sepolia in .env.example was mistakenly `84` — normalize at runtime. */
function resolveChainId(raw: string | undefined): number {
  const parsed = Number(raw ?? BASE_SEPOLIA_CHAIN_ID);
  if (!Number.isFinite(parsed) || parsed <= 0) return BASE_SEPOLIA_CHAIN_ID;
  if (parsed === 84) return BASE_SEPOLIA_CHAIN_ID;
  return parsed;
}

export const CHAIN_ID = resolveChainId(process.env.NEXT_PUBLIC_CHAIN_ID);

export const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org";

function chainMeta(chainId: number): {
  name: string;
  nativeName: string;
  nativeSymbol: string;
  explorerName: string;
  explorerUrl: string;
} {
  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return {
      name: "Base Sepolia",
      nativeName: "Ether",
      nativeSymbol: "ETH",
      explorerName: "BaseScan",
      explorerUrl: "https://sepolia.basescan.org",
    };
  }
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return {
      name: "Base",
      nativeName: "Ether",
      nativeSymbol: "ETH",
      explorerName: "BaseScan",
      explorerUrl: "https://basescan.org",
    };
  }
  return {
    name: `Chain ${chainId}`,
    nativeName: "Ether",
    nativeSymbol: "ETH",
    explorerName: "Explorer",
    explorerUrl: "https://sepolia.basescan.org",
  };
}

const meta = chainMeta(CHAIN_ID);

function solanaChainDisplayName(): string {
  if (SOLANA_CLUSTER === "mainnet-beta") return "Solana";
  if (SOLANA_CLUSTER === "devnet") return "Solana Devnet";
  if (SOLANA_CLUSTER === "localnet") return "Solana Localnet";
  return "Solana";
}

/** Chain-native ticker for UI (SOL on Solana cutover, ETH/BNB on EVM). */
export const NATIVE_SYMBOL = isSolanaChainFamily ? SOL_NATIVE_SYMBOL : meta.nativeSymbol;
export const NATIVE_NAME = isSolanaChainFamily ? "Solana" : meta.nativeName;
export const CHAIN_DISPLAY_NAME = isSolanaChainFamily ? solanaChainDisplayName() : meta.name;

export const pumpChain = defineChain({
  id: CHAIN_ID,
  name: meta.name,
  nativeCurrency: {
    decimals: 18,
    name: meta.nativeName,
    symbol: meta.nativeSymbol,
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: meta.explorerName,
      url: meta.explorerUrl,
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 17_422_483,
    },
  },
});

export const contracts = {
  memeFactory: process.env.NEXT_PUBLIC_MEME_FACTORY as `0x${string}`,
  bondingCurveManager: process.env.NEXT_PUBLIC_BONDING_CURVE_MANAGER as `0x${string}`,
  airdropManager: process.env.NEXT_PUBLIC_AIRDROP_MANAGER as `0x${string}` | undefined,
  kolMarketEscrow: process.env.NEXT_PUBLIC_KOL_MARKET_ESCROW as `0x${string}` | undefined,
};

export function shortAddress(address: string, compact = false): string {
  if (isSolanaChainFamily) return shortSolanaAddress(address, compact);
  if (compact) return `${address.slice(0, 4)}…${address.slice(-3)}`;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function explorerTxUrl(txHash: string): string {
  if (isSolanaChainFamily) return solanaExplorerTxUrl(txHash);
  return `${pumpChain.blockExplorers.default.url}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  if (isSolanaChainFamily) return solanaExplorerAddressUrl(address);
  return `${pumpChain.blockExplorers.default.url}/address/${address}`;
}

export {
  CHAIN_FAMILY,
  isEvmChainFamily,
  isSolanaChainFamily,
  type ChainFamily,
} from "./chain-family";
