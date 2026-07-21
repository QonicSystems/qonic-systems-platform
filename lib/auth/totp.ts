import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

/**
 * TOTP (RFC 6238) over HMAC-SHA1, which is what Google Authenticator, 1Password,
 * and Authy all implement.
 *
 * Written here rather than pulled from a package: it is about sixty lines of
 * well-specified arithmetic, and the RFC publishes official test vectors, so it
 * can be proven correct instead of trusted. See tests/totp.test.ts.
 */
const DIGITS = 6;
const PERIOD_SECONDS = 30;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  // Padding and spacing are cosmetic; authenticator apps display groups of four.
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error("Invalid base32 character in TOTP secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/** The HOTP truncation from RFC 4226, which TOTP builds on. */
export function hotp(secret: Buffer, counter: number, digits = DIGITS, algorithm = "sha1"): string {
  const buffer = Buffer.alloc(8);
  // The counter is a 64-bit big-endian integer; JS numbers are safe to 2^53, far
  // beyond any realistic time step, so splitting into two 32-bit halves is fine.
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac(algorithm, secret).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function generateCode(secretBase32: string, atMs: number = Date.now(), digits = DIGITS, algorithm = "sha1"): string {
  return hotp(base32Decode(secretBase32), Math.floor(atMs / 1000 / PERIOD_SECONDS), digits, algorithm);
}

/**
 * Verifies a submitted code.
 *
 * `window` allows one step either side by default, which absorbs ordinary clock
 * drift between the phone and the server. Widening it materially weakens the
 * factor, so it is a parameter rather than something callers guess at.
 */
export function verifyCode(secretBase32: string, submitted: string, atMs: number = Date.now(), window = 1): boolean {
  const cleaned = submitted.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;

  const counter = Math.floor(atMs / 1000 / PERIOD_SECONDS);
  const secret = base32Decode(secretBase32);
  for (let drift = -window; drift <= window; drift += 1) {
    // Constant-time compare: a timing oracle here would let an attacker
    // discover digits one at a time.
    if (safeEqual(hotp(secret, counter + drift), cleaned)) return true;
  }
  return false;
}

/** The `otpauth://` URI an authenticator app scans. */
export function provisioningUri(secretBase32: string, account: string, issuer = "QONIC Consulting"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Recovery codes for when the phone is lost. Shown once, stored hashed. */
export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 characters
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
