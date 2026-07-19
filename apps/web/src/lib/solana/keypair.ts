import nacl from "tweetnacl";
import bs58 from "bs58";

export type SolanaKeypairMaterial = {
  /** Base58 public key (trading address). */
  address: string;
  /** 64-byte secret key (seed+pubkey) as Uint8Array. */
  secretKey: Uint8Array;
  /** Base64 of secretKey for JSON transport to client. */
  secretKeyBase64: string;
};

export function generateSolanaKeypair(): SolanaKeypairMaterial {
  const kp = nacl.sign.keyPair();
  return {
    address: bs58.encode(Buffer.from(kp.publicKey)),
    secretKey: kp.secretKey,
    secretKeyBase64: Buffer.from(kp.secretKey).toString("base64"),
  };
}

export function addressFromSecretKey(secretKey: Uint8Array): string {
  if (secretKey.length !== 64) {
    throw new Error("Solana secret key must be 64 bytes");
  }
  return bs58.encode(Buffer.from(secretKey.subarray(32)));
}

export function secretKeyFromBase64(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 64) {
    throw new Error("Solana secret key must be 64 bytes");
  }
  return new Uint8Array(buf);
}
