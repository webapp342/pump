import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { buildDisplayUsernameRecord } from "@/lib/user-display";
import { getUsernamesMap } from "@/lib/db/users";
import { resolveDisplayUsername } from "@/lib/username";

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
    const usernameMap = await getUsernamesMap(addresses);
    const displayNames = await buildDisplayUsernameRecord(addresses, compact);
    const usernames: Record<string, string | null> = {};
    for (const address of addresses) {
      const key = address.toLowerCase();
      usernames[key] = usernameMap.get(key) ?? null;
    }

    return NextResponse.json(
      {
        data: {
          displayNames,
          usernames,
          resolve: Object.fromEntries(
            addresses.map((address) => [
              address.toLowerCase(),
              resolveDisplayUsername(address, usernameMap.get(address.toLowerCase()) ?? null, compact),
            ])
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
