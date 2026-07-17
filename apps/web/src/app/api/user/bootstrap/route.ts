import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { listSavedAirdropIds } from "@/lib/db/airdrops";
import { hasActiveMarketItem } from "@/lib/db/incentive";
import {
  listFavoriteTokenAddresses,
  listFollowedCreatorAddresses,
} from "@/lib/db/launchpad";
import { getUserProfile } from "@/lib/db/users";
import { resolveDisplayUsername } from "@/lib/username";

const STATUS_BADGE_ITEM_ID = "status_badge";

export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  try {
    const [favorites, airdropSaves, creatorFollows, profile, hasStatusBadge] =
      await Promise.all([
        listFavoriteTokenAddresses(address),
        listSavedAirdropIds(address),
        listFollowedCreatorAddresses(address),
        getUserProfile(address),
        hasActiveMarketItem(address, STATUS_BADGE_ITEM_ID),
      ]);

    return NextResponse.json(
      {
        data: {
          address,
          favorites,
          airdropSaves,
          creatorFollows,
          avatarId: profile.avatarId,
          username: profile.username,
          displayUsername: resolveDisplayUsername(address, profile.username),
          hasStatusBadge,
        },
      },
      { headers: { "Cache-Control": "private, max-age=5" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
