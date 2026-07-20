import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { addressCacheKey, normalizeAddressParam } from "@/lib/address";
import { addressesWithActiveMarketItem } from "@/lib/db/incentive";
import { buildDisplayUsernameRecord } from "@/lib/user-display";
import { getUsernamesMap } from "@/lib/db/users";
import { resolveDisplayUsername } from "@/lib/username";

const STATUS_BADGE_ITEM_ID = "status_badge";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("addresses")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "addresses query param is required" }, { status: 400 });
  }

  const compact = request.nextUrl.searchParams.get("compact") === "1";
  const addresses = raw
    .split(",")
    .map((value) => normalizeAddressParam(value.trim()))
    .filter((value): value is string => Boolean(value));

  if (addresses.length === 0) {
    return NextResponse.json({ error: "No valid addresses provided" }, { status: 400 });
  }

  try {
    const [usernameMap, displayNames, badgeOwners] = await Promise.all([
      getUsernamesMap(addresses),
      buildDisplayUsernameRecord(addresses, compact),
      addressesWithActiveMarketItem(addresses, STATUS_BADGE_ITEM_ID),
    ]);
    const usernames: Record<string, string | null> = {};
    const statusBadges: Record<string, boolean> = {};
    for (const address of addresses) {
      const key = addressCacheKey(address) ?? address;
      usernames[key] = usernameMap.get(key) ?? null;
      statusBadges[key] = badgeOwners.has(key);
    }

    return NextResponse.json(
      {
        data: {
          displayNames,
          usernames,
          statusBadges,
          resolve: Object.fromEntries(
            addresses.map((address) => {
              const key = addressCacheKey(address) ?? address;
              return [
                key,
                resolveDisplayUsername(address, usernameMap.get(key) ?? null, compact),
              ];
            })
          ),
        },
      },
      { headers: { "Cache-Control": "private, max-age=15" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
