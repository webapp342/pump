import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getLaunchpadTokenLogoUrl, stripLogoCacheBust, tokenLogoStorageKey } from "@/lib/assets";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 2 * 1024 * 1024;

let client: S3Client | null = null;

function getR2Client(): S3Client {
  if (client) return client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured");
  }

  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return client;
}

export function getTokenLogoObjectKey(address: string): string {
  return `icons/tokens/${tokenLogoStorageKey(address)}.png`;
}

export function validateLogoFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Logo must be PNG, JPEG, WebP, or GIF";
  }
  if (file.size > MAX_BYTES) {
    return "Logo must be 2 MB or smaller";
  }
  return null;
}

export async function uploadTokenLogoToR2(address: string, file: File): Promise<string> {
  const validationError = validateLogoFile(file);
  if (validationError) throw new Error(validationError);

  const bucket = process.env.R2_BUCKET_NAME ?? "zugswap-assets";

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = getTokenLogoObjectKey(address);

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return stripLogoCacheBust(getLaunchpadTokenLogoUrl(address));
}
