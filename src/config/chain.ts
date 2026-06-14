import { defineChain } from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 97);

export const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://bsc-testnet-rpc.publicnode.com";

export const pumpChain = defineChain({
  id: CHAIN_ID,
  name: "BSC Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "BNB",
    symbol: "BNB",
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "BscScan",
      url: "https://testnet.bscscan.com",
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
