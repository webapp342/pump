import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import {
  ANNOUNCE_HOLDINGS_ERROR,
  createTokenAnnouncement,
} from "@/lib/db/token-announcements";
import { dispatchFollowerAnnouncementPush } from "@/lib/push/dispatch-announcement";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: string;
      tokenAddress?: string;
    };

    const address = normalizeAddressParam(body.address);
    const tokenAddress = normalizeAddressParam(body.tokenAddress);

    if (!address || !tokenAddress) {
      return NextResponse.json(
        { error: "Valid address and tokenAddress are required" },
        { status: 400 }
      );
    }

    const announcement = await createTokenAnnouncement(address, tokenAddress);

    void dispatchFollowerAnnouncementPush(announcement).catch((error) => {
      console.error("[announce] follower push dispatch failed", error);
    });

    return NextResponse.json({ data: { announcement } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Token not found"
        ? 404
        : message === ANNOUNCE_HOLDINGS_ERROR
          ? 403
          : message.includes("wait a few minutes")
            ? 429
            : message.includes("unavailable")
              ? 409
              : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
