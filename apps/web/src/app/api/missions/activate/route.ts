import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import {
  activateAirdropWeight,
  activateLaunchSpotlight,
  countUsableMarketItems,
} from "@/lib/db/incentive";
import { getAirdropById } from "@/lib/db/airdrops";
import { getTokenByAddress } from "@/lib/db/launchpad";
import {
  AIRDROP_WEIGHT_ITEM_ID,
  LAUNCH_SPOTLIGHT_ITEM_ID,
} from "@/lib/points-perk-effects";

/**
 * POST /api/missions/activate
 * Body:
 * - launch_boost: { address, itemId: "launch_boost", tokenAddress, inventoryId? }
 * - airdrop_weight: { address, itemId: "airdrop_weight", airdropId, inventoryId? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      address?: string;
      itemId?: string;
      tokenAddress?: string;
      airdropId?: string;
      inventoryId?: number;
    };

    const address = normalizeAddressParam(body.address);
    const itemId = body.itemId?.trim();
    if (!address) {
      return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
    }
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    if (itemId === LAUNCH_SPOTLIGHT_ITEM_ID) {
      const tokenAddress = normalizeAddressParam(body.tokenAddress);
      if (!tokenAddress) {
        return NextResponse.json({ error: "tokenAddress is required" }, { status: 400 });
      }

      const token = await getTokenByAddress(tokenAddress);
      if (!token) {
        return NextResponse.json({ error: "Token not found" }, { status: 404 });
      }
      if (token.creatorAddress.toLowerCase() !== address) {
        return NextResponse.json(
          { error: "Only the token creator can pin this launch" },
          { status: 403 }
        );
      }

      const usable = await countUsableMarketItems(address, LAUNCH_SPOTLIGHT_ITEM_ID);
      if (usable < 1) {
        return NextResponse.json(
          { error: "No Launch spotlight perk available" },
          { status: 400 }
        );
      }

      const result = await activateLaunchSpotlight({
        address,
        tokenAddress,
        inventoryId: body.inventoryId ?? null,
      });

      if (!result.ok) {
        const status =
          result.code === "ALREADY_PINNED"
            ? 409
            : result.code === "NO_INVENTORY"
              ? 400
              : result.code === "UNAVAILABLE"
                ? 503
                : 400;
        return NextResponse.json({ error: result.error, code: result.code }, { status });
      }

      return NextResponse.json({
        data: {
          itemId: result.itemId,
          inventoryId: result.inventoryId,
          tokenAddress: result.tokenAddress,
          expiresAt: result.expiresAt,
          remainingSpotlights: Math.max(0, usable - 1),
        },
      });
    }

    if (itemId === AIRDROP_WEIGHT_ITEM_ID) {
      const airdropId = body.airdropId?.trim();
      if (!airdropId) {
        return NextResponse.json({ error: "airdropId is required" }, { status: 400 });
      }

      const airdrop = await getAirdropById(airdropId, address);
      if (!airdrop) {
        return NextResponse.json({ error: "Airdrop not found" }, { status: 404 });
      }
      if (airdrop.status === "CLOSED") {
        return NextResponse.json({ error: "Airdrop is closed" }, { status: 400 });
      }

      const usable = await countUsableMarketItems(address, AIRDROP_WEIGHT_ITEM_ID);
      if (usable < 1) {
        return NextResponse.json(
          { error: "No Airdrop multiplier perk available" },
          { status: 400 }
        );
      }

      const result = await activateAirdropWeight({
        address,
        airdropId,
        inventoryId: body.inventoryId ?? null,
      });

      if (!result.ok) {
        const status =
          result.code === "ALREADY_APPLIED"
            ? 409
            : result.code === "NO_INVENTORY"
              ? 400
              : result.code === "UNAVAILABLE"
                ? 503
                : 400;
        return NextResponse.json({ error: result.error, code: result.code }, { status });
      }

      return NextResponse.json({
        data: {
          itemId: result.itemId,
          inventoryId: result.inventoryId,
          airdropId: result.airdropId,
          remainingMultipliers: Math.max(0, usable - 1),
        },
      });
    }

    return NextResponse.json({ error: "This perk cannot be activated" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
