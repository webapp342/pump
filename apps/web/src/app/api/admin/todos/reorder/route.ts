import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { reorderAdminTodos } from "@/lib/db/admin-todos";

export async function POST(request: NextRequest) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { orderedIds?: string[] };
    const orderedIds = body.orderedIds?.filter((id) => /^\d+$/.test(id)) ?? [];
    if (!orderedIds.length) {
      return NextResponse.json({ error: "orderedIds is required" }, { status: 400 });
    }

    const todos = await reorderAdminTodos(orderedIds);
    return NextResponse.json({ data: { todos } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
