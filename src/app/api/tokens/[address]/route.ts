import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchTokenDetailBundle } from "@/lib/token-server";

type RouteContext = { params: Promise<{ address: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { address } = await context.params;

  try {
    const payload = await fetchTokenDetailBundle(address);
    if (!payload) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json(
      { data: payload },
      { headers: { "Cache-Control": "private, max-age=5" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
