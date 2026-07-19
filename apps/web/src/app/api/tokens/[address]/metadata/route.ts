import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, parseEventLogs, type Hash } from "viem";
import { isSolanaChainFamily } from "@/config/chain-family";
import { contracts, pumpChain } from "@/config/chain";
import { resolveSolanaRpcUrl, SOLANA_DB_CHAIN_ID, resolveSolanaCluster, PROGRAM_IDS } from "@pump/solana-sdk";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import { upsertTokenMetadata } from "@/lib/db/launchpad";
import { normalizeAddressParam, normalizeTokenAddress } from "@/lib/address";
import { normalizeSocialLinks, type TokenSocialLinks } from "@/lib/token-social";
import { extractEventsFromLogs } from "@/lib/solana/decode-events";

type RouteContext = { params: Promise<{ address: string }> };

const publicClient = createPublicClient({
  chain: pumpChain,
  transport: http(pumpChain.rpcUrls.default.http[0]),
});

function parseSocialLinksInput(value: unknown): TokenSocialLinks {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const raw = value as Record<string, unknown>;
  return normalizeSocialLinks({
    twitter: typeof raw.twitter === "string" ? raw.twitter : undefined,
    website: typeof raw.website === "string" ? raw.website : undefined,
    telegram: typeof raw.telegram === "string" ? raw.telegram : undefined,
    discord: typeof raw.discord === "string" ? raw.discord : undefined,
  });
}

async function verifySolanaCreateTx(
  mintAddress: string,
  txSignature: string
): Promise<{ creator: string; slot: number } | null> {
  const rpc = resolveSolanaRpcUrl({
    cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? process.env.SOLANA_RPC_URL,
  });
  const conn = new Connection(rpc, "confirmed");
  const tx = await conn.getTransaction(txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta?.logMessages?.length) return null;

  const events = extractEventsFromLogs({
    logs: tx.meta.logMessages,
    signature: txSignature,
    slot: tx.slot,
    programId: PROGRAM_IDS.launchpad,
  });
  const created = events.find((e) => e.name === "TokenCreated" && e.fields);
  if (!created?.fields) return null;
  if (String(created.fields.mint) !== mintAddress) return null;

  return {
    creator: String(created.fields.creator),
    slot: tx.slot,
  };
}

/** POST /api/tokens/[address]/metadata — off-chain profile after create tx. */
export async function POST(request: NextRequest, context: RouteContext) {
  const { address } = await context.params;
  const tokenAddress = normalizeAddressParam(address);
  if (!tokenAddress) {
    return NextResponse.json({ error: "Valid token address required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      txHash?: string;
      name?: string;
      symbol?: string;
      description?: string;
      socialLinks?: unknown;
    };

    const txHash = body.txHash?.trim();
    if (!txHash) {
      return NextResponse.json({ error: "txHash required" }, { status: 400 });
    }

    const description =
      typeof body.description === "string" ? body.description.trim().slice(0, 2000) : null;
    const socialLinks = parseSocialLinksInput(body.socialLinks);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 64) : "Token";
    const symbol = typeof body.symbol === "string" ? body.symbol.trim().slice(0, 16) : "TKN";

    if (isSolanaChainFamily) {
      const verified = await verifySolanaCreateTx(tokenAddress, txHash);
      if (!verified) {
        return NextResponse.json({ error: "Could not verify Solana create transaction" }, { status: 403 });
      }
      const cluster = resolveSolanaCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
      await upsertTokenMetadata({
        address: normalizeTokenAddress(tokenAddress),
        chainId: SOLANA_DB_CHAIN_ID[cluster],
        creatorAddress: verified.creator,
        name,
        symbol,
        launchTxHash: txHash,
        launchBlockNumber: String(verified.slot),
        description,
        socialLinks,
      });
      return NextResponse.json({ ok: true });
    }

    const evmAddress = tokenAddress.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(evmAddress)) {
      return NextResponse.json({ error: "Valid token address required" }, { status: 400 });
    }

    const receipt = await publicClient.getTransactionReceipt({ hash: txHash.toLowerCase() as Hash });
    if (!receipt || receipt.status !== "success") {
      return NextResponse.json({ error: "Create transaction not found or failed" }, { status: 403 });
    }

    const factory = contracts.memeFactory.toLowerCase();
    const factoryLogs = receipt.logs.filter((log) => log.address.toLowerCase() === factory);
    const events = parseEventLogs({
      abi: memeFactoryAbi,
      logs: factoryLogs,
      eventName: "TokenCreated",
    });

    const created = events.find((event) => event.args.token?.toLowerCase() === evmAddress);
    if (!created?.args) {
      return NextResponse.json({ error: "Could not verify create transaction" }, { status: 403 });
    }

    await upsertTokenMetadata({
      address: evmAddress,
      chainId: pumpChain.id,
      creatorAddress: String(created.args.creator).toLowerCase(),
      name: String(created.args.name),
      symbol: String(created.args.symbol),
      launchTxHash: txHash.toLowerCase(),
      launchBlockNumber: receipt.blockNumber.toString(),
      description,
      socialLinks,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[metadata]", err);
    return NextResponse.json({ error: "Failed to save metadata" }, { status: 500 });
  }
}
