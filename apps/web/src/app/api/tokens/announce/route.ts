import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { createTokenAnnouncement } from "@/lib/db/token-announcements";
import { dispatchFollowerAnnouncementPush } from "@/lib/push/dispatch-announcement";
import { ANNOUNCE_MESSAGE_MAX_LEN } from "@/lib/token-announcements-shared";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: string;
      tokenAddress?: string;
      message?: string;
    };

    const address = normalizeAddressParam(body.address);
    const tokenAddress = normalizeAddressParam(body.tokenAddress);

    if (!address || !tokenAddress) {
      return NextResponse.json(
        { error: "Valid address and tokenAddress are required" },
        { status: 400 }
      );
    }

    if (typeof body.message === "string" && body.message.length > ANNOUNCE_MESSAGE_MAX_LEN * 2) {
      return NextResponse.json(
        { error: `Message must be at most ${ANNOUNCE_MESSAGE_MAX_LEN} characters` },
        { status: 400 }
      );
    }

    const announcement = await createTokenAnnouncement(address, tokenAddress, body.message);

    void dispatchFollowerAnnouncementPush(announcement).catch((error) => {
      console.error("[announce] follower push dispatch failed", error);
    });

    return NextResponse.json({ data: { announcement } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Token not found"
        ? 404
        : message.includes("wait a few minutes")
          ? 429
          : message.includes("unavailable")
            ? 409
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
