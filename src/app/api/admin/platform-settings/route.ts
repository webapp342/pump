import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-access";
import { readMinInitialBuyBnb } from "@/lib/meme-factory-onchain";

function requireAdmin(request: NextRequest): boolean {
  return requireAdminSession(request) != null;
}

/** Read-only: min initial buy is enforced on MemeFactory (on-chain). */
export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const minInitialBuyBnb = await readMinInitialBuyBnb();
    return NextResponse.json(
      { data: { minInitialBuyBnb, source: "on-chain" } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Deprecated — use Admin → Min initial buy modal (setMinInitialBuyWei). */
export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "Min initial buy is on-chain only. Use Admin → Treasury & fees → Min initial buy (setMinInitialBuyWei).",
    },
    { status: 410 }
  );
}
