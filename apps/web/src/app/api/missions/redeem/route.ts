import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeAddressParam } from "@/lib/address";
import { redeemMarketItem, getMissionsForAddress, getPointsInventory } from "@/lib/db/incentive";
import { POINTS_MARKET_CATALOG } from "@/lib/points-market-catalog";
import { POINTS_TIERS } from "@/lib/points-levels";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      address?: string;
      itemId?: string;
      redeemKey?: string;
    };
    const address = normalizeAddressParam(body.address);
    const itemId = body.itemId?.trim();
    const redeemKey = body.redeemKey?.trim() || `redeem:${itemId}:${address}:${randomUUID()}`;

    if (!address) {
      return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
    }
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    const item = POINTS_MARKET_CATALOG.find((entry) => entry.id === itemId);
    if (!item) {
      return NextResponse.json({ error: "Unknown market item" }, { status: 404 });
    }
    if (item.comingSoon) {
      return NextResponse.json({ error: "This perk is coming soon" }, { status: 400 });
    }

    const snapshot = await getMissionsForAddress(address);
    const tierIndex = POINTS_TIERS.findIndex((t) => t.id === item.unlockTier);
    const lifetime = snapshot.lifetimePoints;
    let userTierIndex = 0;
    for (let i = POINTS_TIERS.length - 1; i >= 0; i--) {
      if (lifetime >= POINTS_TIERS[i].minPoints) {
        userTierIndex = i;
        break;
      }
    }
    if (userTierIndex < tierIndex) {
      return NextResponse.json(
        { error: `Requires ${POINTS_TIERS[tierIndex]?.name ?? item.unlockTier} level` },
        { status: 403 }
      );
    }

    if (item.stackable === false) {
      const owned = await getPointsInventory(address);
      if (owned.some((row) => row.itemId === item.id)) {
        return NextResponse.json({ error: "Already owned" }, { status: 409 });
      }
    }

    const result = await redeemMarketItem({
      address,
      itemId: item.id,
      costPts: item.costPts,
      redeemKey,
      metadata: { title: item.title, source: "points_market" },
    });

    if (result.status === "INSUFFICIENT") {
      return NextResponse.json({ error: "Not enough XP" }, { status: 400 });
    }
    if (result.status === "UNAVAILABLE") {
      return NextResponse.json(
        { error: result.error ?? "Redeem unavailable" },
        { status: 503 }
      );
    }
    if (result.status === "ERROR") {
      return NextResponse.json({ error: result.error ?? "Redeem failed" }, { status: 500 });
    }

    const nextSnapshot = await getMissionsForAddress(address);

    return NextResponse.json({
      data: {
        status: result.status,
        pointsSpent: result.pointsSpent,
        inventoryId: result.inventoryId,
        totalPoints: nextSnapshot.totalPoints,
        lifetimePoints: nextSnapshot.lifetimePoints,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
