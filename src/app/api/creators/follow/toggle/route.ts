import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { toggleCreatorFollow } from "@/lib/db/launchpad";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: string;
      creatorAddress?: string;
    };

    const address = normalizeAddressParam(body.address);
    const followeeAddress = normalizeAddressParam(body.creatorAddress);

    if (!address || !followeeAddress) {
      return NextResponse.json(
        { error: "Valid address and creatorAddress are required" },
        { status: 400 }
      );
    }

    const following = await toggleCreatorFollow(address, followeeAddress);
    return NextResponse.json({ data: { following } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "User not found" || message === "Cannot follow yourself" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
