import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { loadWalletSessionFromRequest } from "@/lib/auth/wallet-session";
import { sessionOwnsWalletAddress } from "@/lib/auth/session-wallet-address";
import { hasActiveMarketItem } from "@/lib/db/incentive";
import {
  getUserProfile,
  isUsernameAvailable,
  updateUserProfile,
} from "@/lib/db/users";
import { USER_AVATAR_IDS } from "@/lib/user-avatars";
import {
  InvalidUsernameError,
  UsernameTakenError,
  resolveDisplayUsername,
  validateUsername,
} from "@/lib/username";

const STATUS_BADGE_ITEM_ID = "status_badge";

export async function GET(request: NextRequest) {
  const address = normalizeAddressParam(request.nextUrl.searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "Valid address query param is required" }, { status: 400 });
  }

  const usernameCheck = request.nextUrl.searchParams.get("username");
  if (usernameCheck != null) {
    const validation = validateUsername(usernameCheck);
    if (!validation.ok) {
      return NextResponse.json({
        data: { available: false, reason: validation.error },
      });
    }

    const available = await isUsernameAvailable(validation.username, address);
    return NextResponse.json({
      data: {
        available,
        reason: available ? null : "Username is already taken",
      },
    });
  }

  try {
    const [profile, hasStatusBadge] = await Promise.all([
      getUserProfile(address),
      hasActiveMarketItem(address, STATUS_BADGE_ITEM_ID),
    ]);
    return NextResponse.json({
      data: {
        ...profile,
        hasStatusBadge,
        displayUsername: resolveDisplayUsername(address, profile.username),
        catalog: USER_AVATAR_IDS,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await loadWalletSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      address?: string;
      avatarId?: string;
      username?: string | null;
    };
    const address = normalizeAddressParam(body.address);
    if (!address) {
      return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
    }

    if (!(await sessionOwnsWalletAddress(request, body.address))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (body.avatarId == null && body.username === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const profile = await updateUserProfile(address, {
      avatarId: body.avatarId?.trim(),
      username: body.username,
    });

    return NextResponse.json({
      data: {
        ...profile,
        displayUsername: resolveDisplayUsername(address, profile.username),
      },
    });
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InvalidUsernameError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Invalid avatar" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
