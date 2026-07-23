import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { AdminEnvFileId } from "@/lib/admin/env-files";
import { resolvePumpRepoRoot } from "@/lib/admin/env-files";

const execFileAsync = promisify(execFile);
const RELOAD_TIMEOUT_MS = 90_000;

export type EnvReloadResult = {
  command: string;
  stdout: string;
  stderr: string;
};

function ecosystemPath(): string {
  return path.join(resolvePumpRepoRoot(), "ecosystem.config.cjs");
}

async function trySystemctlRestart(service: string): Promise<EnvReloadResult | null> {
  try {
    const args = ["restart", service];
    const { stdout, stderr } = await execFileAsync("systemctl", args, {
      timeout: RELOAD_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { command: `systemctl ${args.join(" ")}`, stdout, stderr };
  } catch {
    return null;
  }
}

export async function restartIndexerServices(): Promise<EnvReloadResult> {
  for (const svc of ["pump-indexer-sol-go", "pump-indexer-sol", "pump-indexer"]) {
    const result = await trySystemctlRestart(svc);
    if (result) return result;
  }
  throw new Error("No Solana/EVM indexer systemd unit found to restart");
}

export async function restartPostWipeRealtimeStack(): Promise<EnvReloadResult[]> {
  const eco = ecosystemPath();
  const apps = ["pump-realtime", "pump-ch-flusher"];
  const out: EnvReloadResult[] = [];
  for (const app of apps) {
    const args = ["startOrRestart", eco, "--only", app, "--update-env"];
    const { stdout, stderr } = await execFileAsync("pm2", args, {
      timeout: RELOAD_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
    out.push({ command: `pm2 ${args.join(" ")}`, stdout, stderr });
  }
  return out;
}

export async function reloadEnvService(id: AdminEnvFileId): Promise<EnvReloadResult> {
  const eco = ecosystemPath();

  if (id === "tma") {
    const args = ["startOrRestart", eco, "--only", "pump-tma", "--update-env"];
    const { stdout, stderr } = await execFileAsync("pm2", args, {
      timeout: RELOAD_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { command: `pm2 ${args.join(" ")}`, stdout, stderr };
  }

  if (id === "realtime") {
    const args = ["startOrRestart", eco, "--only", "pump-realtime", "--update-env"];
    const { stdout, stderr } = await execFileAsync("pm2", args, {
      timeout: RELOAD_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { command: `pm2 ${args.join(" ")}`, stdout, stderr };
  }

  if (id === "indexer") {
    return restartIndexerServices();
  }

  throw new Error("Unknown service");
}
