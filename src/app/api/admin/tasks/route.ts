import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin-access";
import {
  createAdminLinkTask,
  deleteAdminLinkTask,
  listAdminLinkTasks,
  setAdminLinkTaskActive,
} from "@/lib/db/incentive";

function requireAdmin(request: NextRequest): boolean {
  return requireAdminSession(request) != null;
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const tasks = await listAdminLinkTasks();
    return NextResponse.json({ data: { tasks } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      rewardPoints?: number;
      targetUrl?: string;
    };

    const task = await createAdminLinkTask({
      title: body.title ?? "",
      description: body.description,
      rewardPoints: Number(body.rewardPoints),
      targetUrl: body.targetUrl ?? "",
    });

    return NextResponse.json({ data: { task } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("required") || message.includes("must") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { taskKey?: string; isActive?: boolean };
    const taskKey = body.taskKey?.trim();
    if (!taskKey) {
      return NextResponse.json({ error: "taskKey is required" }, { status: 400 });
    }

    const isActive = body.isActive ?? false;
    const updated = await setAdminLinkTaskActive(taskKey, isActive);
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ data: { taskKey, isActive } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { taskKey?: string };
    const taskKey = body.taskKey?.trim();
    if (!taskKey) {
      return NextResponse.json({ error: "taskKey is required" }, { status: 400 });
    }

    const deleted = await deleteAdminLinkTask(taskKey);
    if (!deleted) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ data: { taskKey, deleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
