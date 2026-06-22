import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { deleteAdminTodo, isAdminTodoPriority, updateAdminTodo } from "@/lib/db/admin-todos";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      title?: string;
      body?: string | null;
      priority?: string;
      isCompleted?: boolean;
      sortOrder?: number;
    };

    if (body.priority !== undefined && !isAdminTodoPriority(body.priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }

    const todo = await updateAdminTodo(id, {
      title: body.title,
      body: body.body,
      priority: body.priority as "low" | "medium" | "high" | "urgent" | undefined,
      isCompleted: body.isCompleted,
      sortOrder: body.sortOrder,
    });

    if (!todo) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    return NextResponse.json({ data: { todo } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { id } = await context.params;
    const deleted = await deleteAdminTodo(id);
    if (!deleted) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    return NextResponse.json({ data: { id, deleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
