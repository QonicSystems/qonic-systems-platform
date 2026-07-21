import { beforeAll, describe, expect, it } from "vitest";
import { MissingEncryptionKeyError, decrypt, encrypt, isEncryptionConfigured, safeEqual, sha256 } from "@/lib/crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(64);
});

describe("encrypt / decrypt", () => {
  it("round-trips a value", () => {
    const secret = "12345678901234567890";
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("round-trips unicode and long values", () => {
    const value = "Ravi Kumar — बैंक खाता — ".repeat(20);
    expect(decrypt(encrypt(value))).toBe(value);
  });

  it("produces different ciphertext each time, so equal values are not linkable", () => {
    // A deterministic scheme would let someone spot two people sharing a value.
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("emits iv:tag:ciphertext", () => {
    expect(encrypt("x").split(":")).toHaveLength(3);
  });

  it("REJECTS tampered ciphertext rather than returning altered plaintext", () => {
    const payload = encrypt("account-number-12345");
    const [iv, tag, data] = payload.split(":");
    // Flip a byte in the ciphertext; GCM's auth tag must catch it.
    const bytes = Buffer.from(data, "base64");
    bytes[0] ^= 0xff;
    expect(() => decrypt([iv, tag, bytes.toString("base64")].join(":"))).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const payload = encrypt("sensitive");
    const [iv, tag, data] = payload.split(":");
    const bytes = Buffer.from(tag, "base64");
    bytes[0] ^= 0xff;
    expect(() => decrypt([iv, bytes.toString("base64"), data].join(":"))).toThrow();
  });

  it.each(["", "notciphertext", "a:b", "a:b:c:d"])("rejects malformed payload %s", (payload) => {
    expect(() => decrypt(payload)).toThrow();
  });

  it("cannot be decrypted with a different key", () => {
    const payload = encrypt("secret");
    process.env.ENCRYPTION_KEY = "f".repeat(64);
    expect(() => decrypt(payload)).toThrow();
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  });
});

describe("key configuration", () => {
  it("refuses to operate without a key rather than falling back to something weaker", () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encrypt("x")).toThrow(MissingEncryptionKeyError);
    process.env.ENCRYPTION_KEY = saved;
  });

  it.each(["short", "z".repeat(64), "0".repeat(63)])("rejects an invalid key %s", (key) => {
    const saved = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = key;
    expect(isEncryptionConfigured()).toBe(false);
    process.env.ENCRYPTION_KEY = saved;
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects different strings", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false on a length mismatch instead of throwing", () => {
    // timingSafeEqual throws on unequal lengths, which would itself be a signal.
    expect(safeEqual("short", "muchlonger")).toBe(false);
  });
});

describe("sha256", () => {
  it("matches the known digest of an empty string", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("is deterministic", () => {
    expect(sha256("ABCDE-12345")).toBe(sha256("ABCDE-12345"));
  });
});
