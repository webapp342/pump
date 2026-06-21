import fs from "node:fs/promises";
import path from "node:path";
import {
  applyEnvVariables,
  extractEnvVariables,
  parseEnvDocument,
  type EnvVariableRow,
} from "@/lib/admin/env-parse";

export type AdminEnvFileId = "tma" | "realtime" | "indexer";

export type AdminEnvFileMeta = {
  id: AdminEnvFileId;
  label: string;
  description: string;
  service: string;
  reloadHint: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  modifiedAt: string | null;
};

type EnvFileDef = {
  id: AdminEnvFileId;
  label: string;
  description: string;
  service: string;
  reloadHint: string;
  resolvePath: (repoRoot: string) => string;
};

/** Resolve monorepo root from standalone cwd or explicit override. */
export function resolvePumpRepoRoot(): string {
  if (process.env.PUMP_REPO_ROOT) {
    return path.resolve(process.env.PUMP_REPO_ROOT);
  }

  const cwd = process.cwd().replace(/\\/g, "/");
  const standaloneIdx = cwd.indexOf("/.next/standalone/");
  if (standaloneIdx !== -1) {
    const webRoot = cwd.slice(0, standaloneIdx);
    return path.resolve(webRoot, "../..");
  }

  if (cwd.endsWith("/apps/web") || cwd.includes("/apps/web/")) {
    const appsWebIdx = cwd.lastIndexOf("/apps/web");
    return path.resolve(cwd.slice(0, appsWebIdx));
  }

  return process.cwd();
}

const REGISTRY: EnvFileDef[] = [
  {
    id: "tma",
    label: "Pump Web (TMA)",
    description:
      "Main application: PostgreSQL, Redis, Telegram OIDC, bundler proxy, R2, contract addresses.",
    service: "PM2 · pump-tma",
    reloadHint: "pm2 startOrRestart ecosystem.config.cjs --only pump-tma --update-env",
    resolvePath: (root) => path.join(root, ".env"),
  },
  {
    id: "realtime",
    label: "WebSocket (realtime)",
    description: "pump-realtime: port, Redis pub/sub, allowed origins.",
    service: "PM2 · pump-realtime",
    reloadHint: "pm2 startOrRestart ecosystem.config.cjs --only pump-realtime --update-env",
    resolvePath: (root) => path.join(root, "apps", "realtime", ".env"),
  },
  {
    id: "indexer",
    label: "Indexer + Airdrop keeper",
    description:
      "BSC indexer, MV refresh, Redis publish, airdrop keeper key. Lives outside the git tree on VM.",
    service: "systemd · pump-indexer, pump-airdrop-keeper",
    reloadHint: "systemctl restart pump-indexer pump-airdrop-keeper",
    resolvePath: (root) =>
      process.env.PUMP_INDEXER_ENV_PATH ??
      path.join(path.dirname(root), "Indexer", ".env"),
  },
];

export function getEnvFileDef(id: string): EnvFileDef | null {
  return REGISTRY.find((entry) => entry.id === id) ?? null;
}

export function resolveEnvFilePath(id: AdminEnvFileId): string {
  const def = getEnvFileDef(id);
  if (!def) throw new Error("Unknown env file");
  const resolved = path.resolve(def.resolvePath(resolvePumpRepoRoot()));
  const root = path.resolve(resolvePumpRepoRoot());
  const indexerPath = path.resolve(
    process.env.PUMP_INDEXER_ENV_PATH ?? path.join(path.dirname(root), "Indexer", ".env")
  );

  const allowed = new Set<string>([
    path.resolve(root, ".env"),
    path.resolve(root, "apps", "realtime", ".env"),
    indexerPath,
  ]);

  if (!allowed.has(resolved)) {
    throw new Error("Env path outside allowed registry");
  }

  return resolved;
}

async function statEnvFile(filePath: string): Promise<Pick<AdminEnvFileMeta, "exists" | "sizeBytes" | "modifiedAt">> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return { exists: false, sizeBytes: null, modifiedAt: null };
    }
    return {
      exists: true,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return { exists: false, sizeBytes: null, modifiedAt: null };
  }
}

export async function listAdminEnvFiles(): Promise<AdminEnvFileMeta[]> {
  const root = resolvePumpRepoRoot();
  const rows: AdminEnvFileMeta[] = [];

  for (const def of REGISTRY) {
    const filePath = def.resolvePath(root);
    const stat = await statEnvFile(filePath);
    rows.push({
      id: def.id,
      label: def.label,
      description: def.description,
      service: def.service,
      reloadHint: def.reloadHint,
      path: filePath,
      ...stat,
    });
  }

  return rows;
}

export async function readAdminEnvFile(id: AdminEnvFileId): Promise<{ path: string; content: string }> {
  const filePath = resolveEnvFilePath(id);
  const content = await fs.readFile(filePath, "utf8");
  return { path: filePath, content };
}

export async function readAdminEnvVariables(id: AdminEnvFileId): Promise<{
  path: string;
  content: string;
  variables: EnvVariableRow[];
}> {
  const filePath = resolveEnvFilePath(id);
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  const entries = parseEnvDocument(content);
  return {
    path: filePath,
    content,
    variables: extractEnvVariables(entries),
  };
}

export async function writeAdminEnvVariables(
  id: AdminEnvFileId,
  variables: EnvVariableRow[]
): Promise<{ path: string; backupPath: string | null; content: string }> {
  const filePath = resolveEnvFilePath(id);
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  const entries = content ? parseEnvDocument(content) : [];
  const nextContent = applyEnvVariables(entries, variables);
  const result = await writeAdminEnvFile(id, nextContent);
  return { ...result, content: nextContent };
}

export async function writeAdminEnvFile(
  id: AdminEnvFileId,
  content: string
): Promise<{ path: string; backupPath: string | null }> {
  const filePath = resolveEnvFilePath(id);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  let backupPath: string | null = null;
  try {
    await fs.access(filePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    backupPath = `${filePath}.bak.${stamp}`;
    await fs.copyFile(filePath, backupPath);
  } catch {
    backupPath = null;
  }

  const tmpPath = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmpPath, filePath);

  return { path: filePath, backupPath };
}
