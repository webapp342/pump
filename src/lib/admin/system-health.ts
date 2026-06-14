import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ServiceHealthStatus = "healthy" | "degraded" | "down";

export type ServiceHealthCheck = {
  id: string;
  name: string;
  status: ServiceHealthStatus;
  summary: string;
  probe: string;
  detail?: string;
  latencyMs?: number;
  logs?: string[];
  timings?: Record<string, number | null>;
};

export type HostDiskMetric = {
  filesystem: string;
  size: string;
  used: string;
  avail: string;
  usePercent: string;
  mountedOn: string;
};

export type HostMetrics = {
  disk: HostDiskMetric[];
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    availableMb: number;
    usedPercent: number;
  };
  cpu: {
    cores: number;
    usagePercent: number | null;
    load1: number;
    load5: number;
    load15: number;
    loadPercent1: number;
  };
  uptime: string;
};

export type SystemHealthReport = {
  overall: ServiceHealthStatus;
  checkedAt: string;
  host?: string;
  scriptDurationMs?: number;
  hostMetrics?: HostMetrics;
  checks: ServiceHealthCheck[];
};

const DEFAULT_SCRIPT =
  process.env.SYSTEM_HEALTH_SCRIPT ?? "/var/www/pump/tma/deploy/vm/system-health.sh";
const SCRIPT_TIMEOUT_MS = Number(process.env.SYSTEM_HEALTH_TIMEOUT_MS ?? 45_000);

async function scriptExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function collectSystemHealth(): Promise<SystemHealthReport> {
  const scriptPath = DEFAULT_SCRIPT;

  if (!(await scriptExists(scriptPath))) {
    return {
      overall: "down",
      checkedAt: new Date().toISOString(),
      checks: [
        {
          id: "vm_script",
          name: "VM health script",
          status: "down",
          summary: "Health script not found on this host",
          probe: scriptPath,
          detail:
            "Runs on production VM only. Deploy deploy/vm/system-health.sh and chmod +x.",
        },
      ],
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync("bash", [scriptPath], {
      timeout: SCRIPT_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
    });

    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error(stderr.trim() || "Health script returned empty output");
    }

    const report = JSON.parse(trimmed) as SystemHealthReport;
    if (!report.checks?.length) {
      throw new Error("Health script returned no checks");
    }

    return report;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.includes("JSON")
          ? error.message
          : `Health script failed: ${error.message}`
        : "Health script failed";

    return {
      overall: "down",
      checkedAt: new Date().toISOString(),
      checks: [
        {
          id: "vm_script",
          name: "VM health script",
          status: "down",
          summary: message,
          probe: `bash ${scriptPath}`,
        },
      ],
    };
  }
}
