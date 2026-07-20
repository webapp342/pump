import { createPublicClient, formatEther, http, type Address } from "viem";
import { pumpAirdropManagerAbi } from "@/lib/abis/pump-airdrop-manager";
import { launchpadTreasuryAbi } from "@/lib/abis/launchpad-treasury";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import { TREASURY_ADDRESS } from "@/config/admin";
import { contracts, pumpChain, rpcUrl } from "@/config/chain";
import { isSolanaChainFamily } from "@/config/chain-family";
import { getAdminProtocolSnapshotSolana } from "@/lib/admin-solana-onchain";

const publicClient = createPublicClient({
  chain: pumpChain,
  transport: http(rpcUrl, { timeout: 20_000 }),
});

export type OnChainAirdropState = {
  remainderSwept: boolean;
  remainingWei: bigint;
  totalFundedWei: bigint;
  totalClaimedWei: bigint;
  claimEnd: number;
  status: number;
};

export async function readAirdropOnChain(onChainId: string): Promise<OnChainAirdropState | null> {
  if (isSolanaChainFamily) return null;
  if (!contracts.airdropManager) return null;

  const [state, remainingWei] = await Promise.all([
    publicClient.readContract({
      address: contracts.airdropManager,
      abi: pumpAirdropManagerAbi,
      functionName: "airdrops",
      args: [BigInt(onChainId)],
    }),
    publicClient.readContract({
      address: contracts.airdropManager,
      abi: pumpAirdropManagerAbi,
      functionName: "remainingBalance",
      args: [BigInt(onChainId)],
    }),
  ]);

  return {
    remainderSwept: state[13],
    remainingWei,
    totalFundedWei: state[3],
    totalClaimedWei: state[5],
    claimEnd: Number(state[11]),
    status: state[12],
  };
}

export async function getAdminProtocolSnapshot() {
  if (isSolanaChainFamily) {
    return getAdminProtocolSnapshotSolana();
  }

  const manager = contracts.airdropManager;
  const factory = contracts.memeFactory;
  const bonding = contracts.bondingCurveManager;

  const [
    memeTreasury,
    memeOwner,
    memeCreateFee,
    memeMinInitialBuyWei,
    curveTreasury,
    curveOwner,
    curveProtocolFeeBps,
    curveCreatorFeeShareBps,
    curveReferrerShareBps,
    airdropAdmin,
    airdropTreasury,
    airdropCreateFee,
    managerBalance,
    curveBalance,
    curveEmergencyHalt,
  ] = await Promise.all([
    publicClient.readContract({
      address: factory,
      abi: memeFactoryAbi,
      functionName: "treasury",
    }),
    publicClient.readContract({
      address: factory,
      abi: memeFactoryAbi,
      functionName: "owner",
    }),
    publicClient.readContract({
      address: factory,
      abi: memeFactoryAbi,
      functionName: "createFee",
    }),
    publicClient.readContract({
      address: factory,
      abi: memeFactoryAbi,
      functionName: "minInitialBuyWei",
    }),
    publicClient.readContract({
      address: bonding,
      abi: bondingCurveManagerAbi,
      functionName: "treasury",
    }),
    publicClient.readContract({
      address: bonding,
      abi: bondingCurveManagerAbi,
      functionName: "owner",
    }),
    publicClient.readContract({
      address: bonding,
      abi: bondingCurveManagerAbi,
      functionName: "protocolFeeBps",
    }),
    publicClient.readContract({
      address: bonding,
      abi: bondingCurveManagerAbi,
      functionName: "creatorFeeShareBps",
    }),
    publicClient.readContract({
      address: bonding,
      abi: bondingCurveManagerAbi,
      functionName: "referrerShareBps",
    }),
    manager
      ? publicClient.readContract({
          address: manager,
          abi: pumpAirdropManagerAbi,
          functionName: "admin",
        })
      : Promise.resolve(null),
    manager
      ? publicClient.readContract({
          address: manager,
          abi: pumpAirdropManagerAbi,
          functionName: "treasury",
        })
      : Promise.resolve(null),
    manager
      ? publicClient.readContract({
          address: manager,
          abi: pumpAirdropManagerAbi,
          functionName: "createFee",
        })
      : Promise.resolve(0n),
    manager ? publicClient.getBalance({ address: manager }) : Promise.resolve(0n),
    publicClient.getBalance({ address: bonding }),
    publicClient.readContract({
      address: bonding,
      abi: bondingCurveManagerAbi,
      functionName: "emergencyHalt",
    }),
  ]);

  const treasuryContract = (TREASURY_ADDRESS ?? memeTreasury) as Address;
  const treasuryAddress = treasuryContract.toLowerCase();
  const [treasuryBalance, treasuryOwner] = await Promise.all([
    publicClient.getBalance({ address: treasuryContract }),
    publicClient.readContract({
      address: treasuryContract,
      abi: launchpadTreasuryAbi,
      functionName: "owner",
    }),
  ]);

  return {
    memeFactory: {
      address: factory,
      owner: memeOwner as Address,
      treasury: treasuryContract,
      createFeeBnb: formatEther(memeCreateFee),
      minInitialBuyBnb: formatEther(memeMinInitialBuyWei),
    },
    bondingCurveManager: {
      address: bonding,
      owner: curveOwner as Address,
      treasury: curveTreasury as Address,
      protocolFeeBps: Number(curveProtocolFeeBps),
      creatorFeeShareBps: Number(curveCreatorFeeShareBps),
      referrerShareBps: Number(curveReferrerShareBps),
      contractBalanceBnb: formatEther(curveBalance),
      emergencyHalt: Boolean(curveEmergencyHalt),
    },
    airdropManager: manager
      ? {
          address: manager,
          admin: airdropAdmin as Address,
          treasury: airdropTreasury as Address,
          createFeeBnb: formatEther(airdropCreateFee),
          contractBalanceBnb: formatEther(managerBalance),
        }
      : null,
    treasury: {
      address: treasuryAddress,
      owner: (treasuryOwner as Address).toLowerCase(),
      balanceBnb: formatEther(treasuryBalance),
    },
  };
}
