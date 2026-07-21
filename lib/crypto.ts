import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Field-level encryption for data that must not be readable straight out of a
 * database dump — bank details and TOTP secrets.
 *
 * AES-256-GCM is authenticated, so tampering is detected on decrypt rather than
 * silently returning altered plaintext. Format is `iv:authTag:ciphertext`, all
 * base64.
 *
 * The key comes from ENCRYPTION_KEY (64 hex characters = 32 bytes). It is
 * deliberately NOT derived from anything else: rotating it must be a conscious
 * act, and losing it must mean losing the ciphertext rather than quietly
 * falling back to something weaker.
 */
const ALGORITHM = "aes-256-gcm";

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("ENCRYPTION_KEY is not configured. Set a 64-character hex value; see .env.example.");
    this.name = "MissingEncryptionKeyError";
  }
}

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-f]{64}$/i.test(raw)) throw new MissingEncryptionKeyError();
  return Buffer.from(raw, "hex");
}

export function isEncryptionConfigured(): boolean {
  return /^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY ?? "");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext.");
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Constant-time comparison, for anything an attacker could probe repeatedly. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
