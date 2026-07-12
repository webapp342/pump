import { verifyMessage } from "viem";
import type { NextRequest } from "next/server";
import { CHAIN_ID } from "@/config/chain";
import { resolveAdminSiweOrigin } from "@/lib/telegram/public-app-origin";

export type ParsedSiweMessage = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
};

export function buildAdminSiweMessage(params: {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  statement?: string;
}): string {
  const statement = params.statement ?? "Sign in to Pump Console with your operations wallet.";
  return `${params.domain} wants you to sign in with your Ethereum account:\n${params.address}\n\n${statement}\n\nURI: ${params.uri}\nVersion: 1\nChain ID: ${params.chainId}\nNonce: ${params.nonce}\nIssued At: ${params.issuedAt}`;
}

export function parseSiweMessage(message: string): ParsedSiweMessage | null {
  const lines = message.split("\n");
  if (lines.length < 8) return null;

  const header = lines[0]?.match(/^(.+) wants you to sign in with your Ethereum account:$/);
  if (!header) return null;

  const address = lines[1]?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

  const blankIdx = lines.indexOf("");
  if (blankIdx < 2) return null;

  const metaStart = lines.findIndex((line, idx) => idx > blankIdx && line.startsWith("URI: "));
  if (metaStart < 0) return null;

  const statement = lines.slice(blankIdx + 1, metaStart).join("\n").trim();
  const meta: Record<string, string> = {};
  for (const line of lines.slice(metaStart)) {
    const colon = line.indexOf(": ");
    if (colon <= 0) continue;
    meta[line.slice(0, colon)] = line.slice(colon + 2);
  }

  const chainId = Number(meta["Chain ID"]);
  const nonce = meta.Nonce;
  const uri = meta.URI;
  const issuedAt = meta["Issued At"];
  if (!uri || !nonce || !issuedAt || !Number.isFinite(chainId)) return null;

  return {
    domain: header[1],
    address,
    statement,
    uri,
    chainId,
    nonce,
    issuedAt,
  };
}

export function requestOrigin(request: Pick<Request, "headers"> & { nextUrl?: URL }): {
  domain: string;
  uri: string;
} {
  return resolveAdminSiweOrigin(request as NextRequest);
}

export async function verifyAdminSiweMessage(params: {
  message: string;
  signature: `0x${string}`;
  expectedNonce: string;
  expectedDomain: string;
  expectedChainId?: number;
}): Promise<ParsedSiweMessage | null> {
  const parsed = parseSiweMessage(params.message);
  if (!parsed) return null;

  if (parsed.nonce !== params.expectedNonce) return null;
  if (parsed.domain !== params.expectedDomain) return null;

  const chainId = params.expectedChainId ?? CHAIN_ID;
  if (parsed.chainId !== chainId) return null;

  const issuedMs = Date.parse(parsed.issuedAt);
  if (!Number.isFinite(issuedMs) || Math.abs(Date.now() - issuedMs) > 10 * 60 * 1000) {
    return null;
  }

  const valid = await verifyMessage({
    address: parsed.address as `0x${string}`,
    message: params.message,
    signature: params.signature,
  });

  return valid ? parsed : null;
}
