import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import { reloadEnvService } from "@/lib/admin/env-reload";
import { getEnvFileDef, type AdminEnvFileId } from "@/lib/admin/env-files";

function parseId(id: string): AdminEnvFileId | null {
  if (id === "tma" || id === "realtime" || id === "indexer") return id;
  return null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await context.params;
  const envId = parseId(id);
  if (!envId || !getEnvFileDef(envId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await reloadEnvService(envId);
    const def = getEnvFileDef(envId)!;
    return NextResponse.json({
      data: {
        id: envId,
        service: def.service,
        command: result.command,
        message: "Services reloaded. Environment variables are now active in running processes.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reload services";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
