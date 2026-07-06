import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { completeSocialTask } from "@/lib/db/airdrops";

type RouteContext = { params: Promise<{ id: string; taskId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, taskId } = await context.params;
    const body = (await request.json()) as { address?: string };
    const address = normalizeAddressParam(body.address);
    if (!address) {
      return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
    }

    await completeSocialTask(id, taskId, address);
    return NextResponse.json({ data: { completed: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Airdrop not found" || message === "Qualification period ended" || message === "Qualification has not started" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
