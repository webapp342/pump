import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getLaunchpadTokenLogoUrl, stripLogoCacheBust, tokenLogoStorageKey } from "@/lib/assets";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 2 * 1024 * 1024;

export function validateLogoFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Logo must be PNG, JPEG, WebP, or GIF";
  }
  if (file.size > MAX_BYTES) {
    return "Logo must be 2 MB or smaller";
  }
  return null;
}

function resolveAssetsRoot(): string {
  const configured = process.env.ASSETS_DIR?.trim();
  if (configured) return configured;

  // Local dev fallback — served from Next public/ at /icons/tokens/
  return path.join(process.cwd(), "public");
}

export async function uploadTokenLogoToLocal(address: string, file: File): Promise<string> {
  const validationError = validateLogoFile(file);
  if (validationError) throw new Error(validationError);

  const normalized = tokenLogoStorageKey(address);
  const dir = path.join(resolveAssetsRoot(), "icons", "tokens");
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${normalized}.png`;
  await writeFile(path.join(dir, filename), buffer);

  // Dev fallback (public/) — relative path so Next serves the file locally
  if (!process.env.ASSETS_DIR?.trim()) {
    return `/icons/tokens/${filename}`;
  }

  return stripLogoCacheBust(getLaunchpadTokenLogoUrl(normalized));
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY
  );
}
