import { NextResponse } from "next/server";
import { getActiveLaunchPins } from "@/lib/db/incentive";

/** Public list of tokens currently in Launch spotlight (24h pin window). */
export async function GET() {
  try {
    const pins = await getActiveLaunchPins();
    const items = [...pins.values()].map((pin) => ({
      tokenAddress: pin.tokenAddress,
      expiresAt: pin.expiresAt,
    }));
    return NextResponse.json({
      data: { pins: items },
      /** Lowercased token → expiresAt for client board sort. */
      byToken: Object.fromEntries(items.map((p) => [p.tokenAddress, p.expiresAt])),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
