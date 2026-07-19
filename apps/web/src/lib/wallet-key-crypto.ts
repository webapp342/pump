import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { Hex } from "viem";

const SCRYPT_SALT = "pump-wallet-v1";

function encryptionKey(): Buffer {
  const secret =
    process.env.WALLET_ENCRYPTION_SECRET?.trim() ??
    process.env.EMAIL_WALLET_ENCRYPTION_SECRET?.trim();
  if (!secret || secret === "CHANGE_ME" || secret === "CHANGE_ME_USE_32_PLUS_CHAR_RANDOM_STRING") {
    throw new Error("WALLET_ENCRYPTION_SECRET is required");
  }
  return scryptSync(secret, SCRYPT_SALT, 32);
}

/** AES-256-GCM blob: iv(12) + tag(16) + ciphertext */
export function encryptPrivateKey(privateKey: Hex): string {
  return encryptSecretBytes(Buffer.from(privateKey.slice(2), "hex"));
}

export function decryptPrivateKey(payload: string): Hex {
  const plaintext = decryptSecretBytes(payload);
  return `0x${plaintext.toString("hex")}` as Hex;
}

/** Encrypt arbitrary secret bytes (e.g. Solana 64-byte secret key). */
export function encryptSecretBytes(plaintext: Buffer): string {
  const iv = randomBytes(12);
  const key = encryptionKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecretBytes(payload: string): Buffer {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 29) {
    throw new Error("Invalid encrypted secret payload");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const key = encryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
