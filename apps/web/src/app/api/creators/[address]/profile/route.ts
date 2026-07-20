import { PublicKey } from "@solana/web3.js";
import { createPublicClient, formatEther, http } from "viem";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { contracts, pumpChain } from "@/config/chain";
import { isSolanaChainFamily } from "@/config/chain-family";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import { hasActiveMarketItem } from "@/lib/db/incentive";
import { getCreatorProfile, getReferralStats } from "@/lib/db/launchpad";
import {
  fetchPendingCreatorFeesLamports,
  fetchPendingReferrerFeesLamports,
} from "@/lib/solana/pending-fees";
import { getSolanaConnection } from "@/lib/solana/transfer";

const publicClient = createPublicClient({
  chain: pumpChain,
  transport: http(pumpChain.rpcUrls.default.http[0]),
});

const STATUS_BADGE_ITEM_ID = "status_badge";

type RouteContext = { params: Promise<{ address: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { address: addressParam } = await context.params;
  const creatorAddress = normalizeAddressParam(addressParam);
  if (!creatorAddress) {
    return NextResponse.json({ error: "Valid creator address is required" }, { status: 400 });
  }

  try {
    const [profile, referralStats, hasStatusBadge] = await Promise.all([
      getCreatorProfile(creatorAddress),
      getReferralStats(creatorAddress),
      hasActiveMarketItem(creatorAddress, STATUS_BADGE_ITEM_ID),
    ]);
    let bnbBalance = "0";
    let creatorFeesPendingBnb = 0;
    let referralFeesPendingBnb = 0;
    try {
      if (isSolanaChainFamily) {
        const pubkey = new PublicKey(creatorAddress);
        const [lamports, pendingCreator, pendingReferrer] = await Promise.all([
          getSolanaConnection().getBalance(pubkey, "confirmed"),
          fetchPendingCreatorFeesLamports(creatorAddress),
          fetchPendingReferrerFeesLamports(creatorAddress),
        ]);
        bnbBalance = String(lamports / 1e9);
        creatorFeesPendingBnb = Number(pendingCreator) / 1e9;
        referralFeesPendingBnb = Number(pendingReferrer) / 1e9;
      } else {
        const [balanceWei, pendingCreatorWei, pendingReferrerWei] = await Promise.all([
          publicClient.getBalance({ address: creatorAddress as `0x${string}` }),
          publicClient.readContract({
            address: contracts.bondingCurveManager,
            abi: bondingCurveManagerAbi,
            functionName: "pendingCreatorFees",
            args: [creatorAddress as `0x${string}`],
          }),
          publicClient.readContract({
            address: contracts.bondingCurveManager,
            abi: bondingCurveManagerAbi,
            functionName: "pendingReferrerFees",
            args: [creatorAddress as `0x${string}`],
          }),
        ]);
        bnbBalance = formatEther(balanceWei);
        creatorFeesPendingBnb = Number(formatEther(pendingCreatorWei));
        referralFeesPendingBnb = Number(formatEther(pendingReferrerWei));
      }
    } catch {
      // RPC unavailable — profile still useful without live balance / pending fees
    }

    const creatorFeesTotalBnb = profile.creatorFeesClaimedBnb + creatorFeesPendingBnb;
    const referralFeesTotalBnb = referralStats.claimedBnb + referralFeesPendingBnb;

    return NextResponse.json({
      data: {
        ...profile,
        hasStatusBadge,
        bnbBalance,
        creatorFeesPendingBnb,
        creatorFeesTotalBnb,
        referralFeesPendingBnb,
        referralFeesTotalBnb,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
