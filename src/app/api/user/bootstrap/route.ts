import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { listSavedAirdropIds } from "@/lib/db/airdrops";
import {
  listFavoriteTokenAddresses,
  listFollowedCreatorAddresses,
} from "@/lib/db/launchpad";
import { getOrAssignUserAvatar } from "@/lib/db/users";

export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  try {
    const [favorites, airdropSaves, creatorFollows, avatarId] = await Promise.all([
      listFavoriteTokenAddresses(address),
      listSavedAirdropIds(address),
      listFollowedCreatorAddresses(address),
      getOrAssignUserAvatar(address),
    ]);

    return NextResponse.json(
      {
        data: {
          address,
          favorites,
          airdropSaves,
          creatorFollows,
          avatarId,
        },
      },
      { headers: { "Cache-Control": "private, max-age=5" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
