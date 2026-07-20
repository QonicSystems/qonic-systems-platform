import { describe, expect, it } from "vitest";
import { validateLoginPayload } from "@/lib/auth/login";
import { describePasswordProblem, hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashSessionToken, createSessionToken } from "@/lib/auth/session";

describe("validateLoginPayload", () => {
  it("accepts a valid pair and lowercases the email", () => {
    const { data, errors } = validateLoginPayload({ email: "  Founder@QONIC.com ", password: "secret" });
    expect(errors).toEqual({});
    expect(data).toEqual({ email: "founder@qonic.com", password: "secret" });
  });

  it("rejects a malformed email", () => {
    const { data, errors } = validateLoginPayload({ email: "not-an-email", password: "secret" });
    expect(data).toBeUndefined();
    expect(errors.email).toBeDefined();
  });

  it("rejects a missing password", () => {
    const { errors } = validateLoginPayload({ email: "a@b.com", password: "" });
    expect(errors.password).toBeDefined();
  });

  it("does not trim the password — leading/trailing spaces are significant", () => {
    const { data } = validateLoginPayload({ email: "a@b.com", password: "  spaced  " });
    expect(data?.password).toBe("  spaced  ");
  });

  it("survives a non-object body", () => {
    expect(validateLoginPayload(null).data).toBeUndefined();
    expect(validateLoginPayload("nope").data).toBeUndefined();
  });
});

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("Correct-Horse-1");
    expect(await verifyPassword(hash, "Correct-Horse-1")).toBe(true);
  }, 20_000);

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Correct-Horse-1");
    expect(await verifyPassword(hash, "Wrong-Horse-1")).toBe(false);
  }, 20_000);

  it("produces a different hash each time (salted)", async () => {
    const [a, b] = await Promise.all([hashPassword("Same-Password-1"), hashPassword("Same-Password-1")]);
    expect(a).not.toBe(b);
  }, 20_000);

  it("treats a malformed stored hash as a wrong password rather than throwing", async () => {
    expect(await verifyPassword("not-a-real-hash", "anything")).toBe(false);
  });
});

describe("describePasswordProblem", () => {
  it("accepts a strong password", () => {
    expect(describePasswordProblem("Str0ngEnough!")).toBeUndefined();
  });

  it.each([
    ["Sh0rt!", "too short"],
    ["alllowercase1", "no uppercase"],
    ["ALLUPPERCASE1", "no lowercase"],
    ["NoDigitsHereAtAll", "no number"],
  ])("rejects %s (%s)", (password, _reason) => {
    expect(describePasswordProblem(password)).toBeDefined();
  });
});

describe("session tokens", () => {
  it("hashes deterministically, so a cookie can be looked up", () => {
    expect(hashSessionToken("abc")).toBe(hashSessionToken("abc"));
  });

  it("never stores the raw token", () => {
    const token = createSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(token)).toHaveLength(64); // sha256 hex
  });

  it("generates a distinct token each call", () => {
    expect(createSessionToken()).not.toBe(createSessionToken());
  });
});
