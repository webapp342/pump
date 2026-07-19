import { execFile } from "child_process";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import { getLaunchpadTokenLogoUrl, stripLogoCacheBust, tokenLogoStorageKey } from "@/lib/assets";
import { validateLogoFile } from "@/lib/local-asset-upload";

const execFileAsync = promisify(execFile);

export function isSshAssetsConfigured(): boolean {
  return Boolean(process.env.ASSETS_SSH_HOST?.trim());
}

export async function uploadTokenLogoViaSsh(address: string, file: File): Promise<string> {
  const validationError = validateLogoFile(file);
  if (validationError) throw new Error(validationError);

  const host = process.env.ASSETS_SSH_HOST?.trim();
  if (!host) {
    throw new Error("ASSETS_SSH_HOST is not configured");
  }

  const port = process.env.ASSETS_SSH_PORT?.trim() || "22";
  const user = process.env.ASSETS_SSH_USER?.trim() || "root";
  const remoteDir = process.env.ASSETS_REMOTE_DIR?.trim() || "/var/pump/assets";
  const normalized = tokenLogoStorageKey(address);
  const filename = `${normalized}.png`;
  const remotePath = `${remoteDir}/icons/tokens/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const tmpPath = path.join(tmpdir(), `pump-logo-${normalized}-${Date.now()}.png`);
  await writeFile(tmpPath, buffer);

  const sshTarget = `${user}@${host}`;
  const scpArgs = ["-P", port, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", tmpPath, `${sshTarget}:${remotePath}`];

  try {
    await execFileAsync("scp", scpArgs);
    await execFileAsync("ssh", [
      "-p",
      port,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      sshTarget,
      `mkdir -p ${remoteDir}/icons/tokens && chmod 644 ${remotePath} && (chown www-data:www-data ${remotePath} 2>/dev/null || true)`,
    ]);
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }

  return stripLogoCacheBust(getLaunchpadTokenLogoUrl(normalized));
}
