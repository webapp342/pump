import { defineChain } from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 97);

const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

export const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545";

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
    name: "BSC Testnet",
    nativeName: "BNB",
    nativeSymbol: "BNB",
    explorerName: "BscScan",
    explorerUrl: "https://testnet.bscscan.com",
  };
}

const meta = chainMeta(CHAIN_ID);

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
};

export function shortAddress(address: string, compact = false): string {
  if (compact) return `${address.slice(0, 4)}…${address.slice(-3)}`;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function explorerTxUrl(txHash: string): string {
  return `${pumpChain.blockExplorers.default.url}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${pumpChain.blockExplorers.default.url}/address/${address}`;
}
