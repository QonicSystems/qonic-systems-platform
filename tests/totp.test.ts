import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateBackupCodes, generateCode, generateSecret, hotp, provisioningUri, verifyCode } from "@/lib/auth/totp";

/**
 * The RFC publishes official vectors, so this implementation can be PROVEN
 * correct rather than assumed. If these pass, any standard authenticator app
 * will interoperate.
 */
describe("RFC 4226 — HOTP test vectors", () => {
  // Appendix D, secret "12345678901234567890".
  const secret = Buffer.from("12345678901234567890", "utf8");

  it.each([
    [0, "755224"], [1, "287082"], [2, "359152"], [3, "969429"], [4, "338314"],
    [5, "254676"], [6, "287922"], [7, "162583"], [8, "399871"], [9, "520489"],
  ])("counter %i produces %s", (counter, expected) => {
    expect(hotp(secret, counter)).toBe(expected);
  });
});

describe("RFC 6238 — TOTP test vectors", () => {
  // Appendix B. The SHA-1 seed is the ASCII string "12345678901234567890".
  const secret = base32Encode(Buffer.from("12345678901234567890", "utf8"));

  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("at unix time %i produces %s (8 digits)", (seconds, expected) => {
    expect(generateCode(secret, seconds * 1000, 8)).toBe(expected);
  });

  it("produces the 6-digit prefix an authenticator app shows", () => {
    // The RFC vectors are 8 digits; apps show 6, which is the last 6 of the
    // same truncation — so they must agree on the low-order digits.
    expect(generateCode(secret, 59_000, 6)).toBe("287082");
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const original = Buffer.from("QONIC consulting TOTP", "utf8");
    expect(base32Decode(base32Encode(original)).equals(original)).toBe(true);
  });

  it("matches known encodings", () => {
    expect(base32Encode(Buffer.from("foobar", "utf8"))).toBe("MZXW6YTBOI");
  });

  it("tolerates padding and spacing, as apps display it", () => {
    const spaced = "MZXW 6YTB OI==";
    expect(base32Decode(spaced).toString("utf8")).toBe("foobar");
  });

  it("rejects an invalid character rather than silently mis-decoding", () => {
    expect(() => base32Decode("MZXW1YTB")).toThrow(/invalid base32/i);
  });
});

describe("verifyCode", () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;

  it("accepts the current code", () => {
    expect(verifyCode(secret, generateCode(secret, now), now)).toBe(true);
  });

  it("accepts one step of clock drift either way", () => {
    expect(verifyCode(secret, generateCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyCode(secret, generateCode(secret, now + 30_000), now)).toBe(true);
  });

  it("rejects drift beyond the window", () => {
    expect(verifyCode(secret, generateCode(secret, now - 120_000), now)).toBe(false);
  });

  it("rejects a wrong code", () => {
    expect(verifyCode(secret, "000000", now)).toBe(false);
  });

  it.each(["12345", "1234567", "abcdef", "", "12 34 56 78"])("rejects malformed input %s", (input) => {
    expect(verifyCode(secret, input, now)).toBe(false);
  });

  it("tolerates the spaces a user might paste", () => {
    const code = generateCode(secret, now);
    expect(verifyCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
  });

  it("does not accept another account's code", () => {
    expect(verifyCode(secret, generateCode(generateSecret(), now), now)).toBe(false);
  });
});

describe("enrolment helpers", () => {
  it("builds a scannable otpauth URI", () => {
    const uri = provisioningUri("JBSWY3DPEHPK3PXP", "hr@qonic.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=QONIC+Consulting");
    expect(uri).toContain("digits=6");
  });

  it("generates distinct, formatted backup codes", () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
  });

  it("generates a secret an app can decode", () => {
    expect(() => base32Decode(generateSecret())).not.toThrow();
  });
});
