import { normalizeTokenAddress } from "@/lib/address";

/** Client-side upload after token create tx confirms. */
export async function uploadTokenLogo(params: {
  tokenAddress: string;
  txHash: string;
  file: File;
}): Promise<string> {
  const form = new FormData();
  form.append("tokenAddress", normalizeTokenAddress(params.tokenAddress));
  form.append("txHash", params.txHash.trim());
  form.append("file", params.file);

  const res = await fetch("/api/upload/token-logo", {
    method: "POST",
    body: form,
  });

  const body = (await res.json()) as { logoUrl?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Logo upload failed");
  }
  if (!body.logoUrl) {
    throw new Error("Logo upload returned no URL");
  }
  return body.logoUrl;
}

export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function validateLogoFileClient(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Please select an image file";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "Logo must be 2 MB or smaller";
  }
  return null;
}
