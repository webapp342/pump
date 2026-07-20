import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createPublicClient, formatUnits, http, type Address } from "viem";
import { erc20Abi } from "@/lib/abis/erc20";
import { pumpChain, rpcUrl } from "@/config/chain";
import { isSolanaChainFamily } from "@/config/chain-family";
import { addressCacheKey } from "@/lib/address";
import { PUMP_TOKEN_DECIMALS } from "@/lib/solana/amount-scale";
import { getSolanaConnection } from "@/lib/solana/transfer";
import {
  listLaunchpadTokensByCreatorForWalletBalance,
  listLaunchpadTokensForWalletBalance,
} from "@/lib/db/launchpad";

const publicClient = createPublicClient({
  chain: pumpChain,
  transport: http(rpcUrl, { timeout: 15_000 }),
});

const MIN_TOKEN_BALANCE = 1e-9;

function tokenMapKey(address: string): string {
  return addressCacheKey(address) ?? address.trim();
}

export type WalletLaunchpadHolding = {
  tokenAddress: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  tokenBalance: string;
  lastPriceBnb: string;
  estimatedValueBnb: number;
};

/** SPL token balances for one wallet across many mints. */
async function fetchSplTokenBalancesForWallet(
  walletAddress: string,
  tokenAddresses: string[]
): Promise<Map<string, string>> {
  const balances = new Map<string, string>();
  if (tokenAddresses.length === 0) return balances;

  let owner: PublicKey;
  try {
    owner = new PublicKey(walletAddress);
  } catch {
    return balances;
  }

  const conn = getSolanaConnection();
  const chunkSize = 25;

  for (let i = 0; i < tokenAddresses.length; i += chunkSize) {
    const chunk = tokenAddresses.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (tokenAddress) => {
        const key = tokenMapKey(tokenAddress);
        try {
          const mint = new PublicKey(tokenAddress);
          const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
          const bal = await conn.getTokenAccountBalance(ata, "confirmed");
          const raw = bal?.value?.amount ? BigInt(bal.value.amount) : 0n;
          balances.set(key, formatUnits(raw, PUMP_TOKEN_DECIMALS));
        } catch {
          // Omit — UI falls back to indexer balance instead of treating as zero.
        }
      })
    );
  }

  return balances;
}

/** On-chain token balances for many launchpad tokens (ERC20 or SPL). */
export async function fetchOnChainTokenBalancesForWallet(
  walletAddress: string,
  tokenAddresses: string[]
): Promise<Map<string, string>> {
  if (isSolanaChainFamily) {
    return fetchSplTokenBalancesForWallet(walletAddress, tokenAddresses);
  }

  const wallet = walletAddress.toLowerCase() as Address;
  const balances = new Map<string, string>();
  if (tokenAddresses.length === 0) return balances;

  const chunkSize = 50;

  for (let i = 0; i < tokenAddresses.length; i += chunkSize) {
    const chunk = tokenAddresses.slice(i, i + chunkSize);
    const contracts = chunk.map((tokenAddress) => ({
      address: tokenAddress.toLowerCase() as Address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [wallet],
    }));

    let results: { status: "success"; result: bigint }[] | null = null;
    try {
      results = (await publicClient.multicall({
        allowFailure: true,
        contracts,
      })) as { status: "success"; result: bigint }[];
    } catch {
      results = null;
    }

    if (results) {
      chunk.forEach((tokenAddress, index) => {
        const result = results[index];
        const wei = result?.status === "success" ? result.result : 0n;
        balances.set(tokenMapKey(tokenAddress), formatUnits(wei, 18));
      });
      continue;
    }

    await Promise.all(
      chunk.map(async (tokenAddress) => {
        const key = tokenMapKey(tokenAddress);
        try {
          const wei = await publicClient.readContract({
            address: tokenAddress.toLowerCase() as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet],
          });
          balances.set(key, formatUnits(wei, 18));
        } catch {
          balances.set(key, "0");
        }
      })
    );
  }

  return balances;
}

/** SPL token balances for many holders — used to verify indexer holder snapshots. */
export async function fetchSplTokenBalancesForHolders(
  mintAddress: string,
  holderAddresses: string[]
): Promise<Map<string, string>> {
  const balances = new Map<string, string>();
  if (holderAddresses.length === 0) return balances;

  let mint: PublicKey;
  try {
    mint = new PublicKey(mintAddress);
  } catch {
    return balances;
  }

  const conn = getSolanaConnection();
  const chunkSize = 25;

  for (let i = 0; i < holderAddresses.length; i += chunkSize) {
    const chunk = holderAddresses.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (holderAddress) => {
        try {
          const owner = new PublicKey(holderAddress);
          const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
          const bal = await conn.getTokenAccountBalance(ata, "confirmed");
          const raw = bal?.value?.amount ? BigInt(bal.value.amount) : 0n;
          balances.set(holderAddress, formatUnits(raw, PUMP_TOKEN_DECIMALS));
        } catch {
          // Omit — UI falls back to indexer balance instead of treating as zero.
        }
      })
    );
  }

  return balances;
}

/** On-chain token balance per holder — ERC20 or SPL depending on chain family. */
export async function fetchOnChainTokenBalancesForHolders(
  tokenAddress: string,
  holderAddresses: string[]
): Promise<Map<string, string>> {
  if (isSolanaChainFamily) {
    return fetchSplTokenBalancesForHolders(tokenAddress, holderAddresses);
  }

  const token = tokenAddress.toLowerCase() as Address;
  const balances = new Map<string, string>();
  if (holderAddresses.length === 0) return balances;

  const chunkSize = 50;

  for (let i = 0; i < holderAddresses.length; i += chunkSize) {
    const chunk = holderAddresses.slice(i, i + chunkSize);
    const contracts = chunk.map((holderAddress) => ({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [holderAddress.toLowerCase() as Address],
    }));

    let results: { status: "success"; result: bigint }[] | null = null;
    try {
      results = (await publicClient.multicall({
        allowFailure: true,
        contracts,
      })) as { status: "success"; result: bigint }[];
    } catch {
      results = null;
    }

    if (results) {
      chunk.forEach((holderAddress, index) => {
        const result = results[index];
        if (result?.status !== "success") return;
        balances.set(holderAddress.toLowerCase(), formatUnits(result.result, 18));
      });
      continue;
    }

    await Promise.all(
      chunk.map(async (holderAddress) => {
        try {
          const wei = await publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [holderAddress.toLowerCase() as Address],
          });
          balances.set(holderAddress.toLowerCase(), formatUnits(wei, 18));
        } catch {
          // Omit — UI falls back to indexer balance instead of treating as zero.
        }
      })
    );
  }

  return balances;
}

type WalletHoldingsScanOptions = {
  /** Scan only tokens created by this wallet instead of the full launchpad catalog. */
  creatorAddress?: string;
  /** Cap how many launchpad tokens to balanceOf per request. */
  scanLimit?: number;
};

/** On-chain ERC20/SPL balances for launchpad tokens not already covered by indexer positions. */
export async function fetchWalletLaunchpadHoldings(
  walletAddress: string,
  excludeTokenAddresses: Iterable<string>,
  options?: WalletHoldingsScanOptions
): Promise<WalletLaunchpadHolding[]> {
  const exclude = new Set(
    [...excludeTokenAddresses].map((address) => tokenMapKey(address))
  );
  const catalog = options?.creatorAddress
    ? await listLaunchpadTokensByCreatorForWalletBalance(
        options.creatorAddress,
        options.scanLimit
      )
    : await listLaunchpadTokensForWalletBalance();
  const candidates = catalog.filter((token) => !exclude.has(tokenMapKey(token.address)));
  if (candidates.length === 0) return [];

  const balances = await fetchOnChainTokenBalancesForWallet(
    walletAddress,
    candidates.map((token) => token.address)
  );

  const holdings: WalletLaunchpadHolding[] = [];

  for (const token of candidates) {
    const balanceStr = balances.get(tokenMapKey(token.address));
    if (balanceStr == null) continue;
    const balance = Number(balanceStr);
    if (!Number.isFinite(balance) || balance <= MIN_TOKEN_BALANCE) continue;

    const price = Number(token.lastPriceBnb);
    holdings.push({
      tokenAddress: token.address,
      symbol: token.symbol,
      name: token.name,
      logoUrl: token.logoUrl,
      tokenBalance: balanceStr,
      lastPriceBnb: token.lastPriceBnb,
      estimatedValueBnb: balance * price,
    });
  }

  return holdings.sort((a, b) => b.estimatedValueBnb - a.estimatedValueBnb);
}
