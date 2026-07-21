import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { completeAdminLinkTask, getMissionsForAddress } from "@/lib/db/incentive";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { address?: string; taskKey?: string };
    const address = normalizeAddressParam(body.address);
    const taskKey = body.taskKey?.trim();

    if (!address) {
      return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
    }
    if (!taskKey) {
      return NextResponse.json({ error: "taskKey is required" }, { status: 400 });
    }

    const result = await completeAdminLinkTask(address, taskKey);
    if (result.status === "NOT_FOUND") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (result.status === "SKIPPED" && result.pointsAwarded === 0) {
      return NextResponse.json(
        { error: "Task is inactive or already completed" },
        { status: 409 }
      );
    }

    const snapshot = await getMissionsForAddress(address);

    return NextResponse.json({
      data: {
        ...result,
        totalPoints: snapshot.totalPoints,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
