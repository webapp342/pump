import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import {
  createAdminTodo,
  isAdminTodoPriority,
  listAdminTodos,
} from "@/lib/db/admin-todos";

export async function GET(request: NextRequest) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const todos = await listAdminTodos();
    return NextResponse.json({ data: { todos } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = requireAdminWallet(request);
  if (!admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      body?: string | null;
      priority?: string;
    };

    const priority = body.priority?.trim();
    if (priority && !isAdminTodoPriority(priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }

    const todo = await createAdminTodo({
      title: body.title ?? "",
      body: body.body,
      priority: priority as "low" | "medium" | "high" | "urgent" | undefined,
      createdBy: admin,
    });

    return NextResponse.json({ data: { todo } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
