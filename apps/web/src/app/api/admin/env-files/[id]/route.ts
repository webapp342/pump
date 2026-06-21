import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminWallet } from "@/lib/auth/admin-access";
import {
  getEnvFileDef,
  readAdminEnvVariables,
  writeAdminEnvVariables,
  type AdminEnvFileId,
} from "@/lib/admin/env-files";
import { isSensitiveEnvKey, extractEnvVariables, parseEnvDocument, type EnvVariableRow } from "@/lib/admin/env-parse";

function parseId(id: string): AdminEnvFileId | null {
  if (id === "tma" || id === "realtime" || id === "indexer") return id;
  return null;
}

function parseVariables(body: unknown): EnvVariableRow[] | null {
  if (!body || typeof body !== "object" || !("variables" in body)) return null;
  const raw = (body as { variables: unknown }).variables;
  if (!Array.isArray(raw)) return null;

  const rows: EnvVariableRow[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const key = (item as { key?: unknown }).key;
    const value = (item as { value?: unknown }).value;
    if (typeof key !== "string" || typeof value !== "string") return null;
    const trimmedKey = key.trim();
    if (!trimmedKey || seen.has(trimmedKey)) return null;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedKey)) return null;
    seen.add(trimmedKey);
    rows.push({
      key: trimmedKey,
      value,
      sensitive: isSensitiveEnvKey(trimmedKey),
      scope: trimmedKey.startsWith("NEXT_PUBLIC_") ? "client" : "server",
    });
  }

  return rows;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await context.params;
  const envId = parseId(id);
  if (!envId || !getEnvFileDef(envId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const file = await readAdminEnvVariables(envId);
    const def = getEnvFileDef(envId)!;
    return NextResponse.json(
      {
        data: {
          id: envId,
          label: def.label,
          description: def.description,
          service: def.service,
          reloadHint: def.reloadHint,
          path: file.path,
          variables: file.variables,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read env file";
    const status = message.includes("ENOENT") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requireAdminWallet(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await context.params;
  const envId = parseId(id);
  if (!envId || !getEnvFileDef(envId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const variables = parseVariables(body);
  if (!variables) {
    return NextResponse.json({ error: "variables must be an array of { key, value }" }, { status: 400 });
  }

  try {
    const result = await writeAdminEnvVariables(envId, variables);
    const def = getEnvFileDef(envId)!;
    return NextResponse.json({
      data: {
        id: envId,
        path: result.path,
        backupPath: result.backupPath,
        reloadHint: def.reloadHint,
        variables: extractEnvVariables(parseEnvDocument(result.content)),
        needsReload: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to write env file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
