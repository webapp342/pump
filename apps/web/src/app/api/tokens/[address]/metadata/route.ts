import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createPublicClient, http, parseEventLogs, type Hash } from "viem";
import { isSolanaChainFamily } from "@/config/chain-family";
import { contracts, pumpChain } from "@/config/chain";
import { resolveSolanaCluster, SOLANA_DB_CHAIN_ID } from "@pump/solana-sdk";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import { upsertTokenMetadata } from "@/lib/db/launchpad";
import { normalizeAddressParam, normalizeTokenAddress } from "@/lib/address";
import { normalizeSocialLinks, type TokenSocialLinks } from "@/lib/token-social";
import { verifySolanaCreateTx } from "@/lib/solana/verify-create-tx";

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
