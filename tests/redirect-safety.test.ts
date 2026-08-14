import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/session";

/**
 * The `?next=` value survives a successful login and is handed to
 * `router.replace`, so anything that escapes the origin here is a phishing
 * landing page reached *after* the victim genuinely authenticated on the real
 * domain. The prefix checks this replaced looked sufficient and were not.
 */
describe("safeRedirectPath — off-origin values", () => {
  it("rejects the backslash form the old prefix check let through", () => {
    // `/\evil.com` starts with a single "/" and is not "//", but WHATWG treats
    // the backslash as a slash for special schemes, so a browser resolves it to
    // https://evil.com/.
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard");
    expect(new URL("/\\evil.com", "https://portal.example").host).toBe("evil.com");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com/path"],
    ["double backslash", "/\\\\evil.com"],
    ["leading backslash", "\\/evil.com"],
    ["scheme-only", "javascript:alert(1)"],
    ["backslash with path", "/\\evil.com/login"],
  ])("rejects %s", (_label, value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });

  it("uses the supplied fallback rather than a hardcoded one", () => {
    expect(safeRedirectPath("https://evil.com", "/profile")).toBe("/profile");
  });
});

describe("safeRedirectPath — values that must keep working", () => {
  it.each([
    ["/dashboard"],
    ["/timesheets"],
    ["/reports/revenue"],
    ["/profile/security?first=1"],
    ["/leave?tab=requests"],
  ])("passes %s through unchanged", (value) => {
    expect(safeRedirectPath(value)).toBe(value);
  });

  it("falls back for empty and missing values", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
  });

  it("still refuses to bounce into the API surface", () => {
    expect(safeRedirectPath("/api/admin/users")).toBe("/dashboard");
  });

  it("drops any fragment rather than preserving it", () => {
    // Fragments never reach the server and are not needed for a portal path.
    expect(safeRedirectPath("/dashboard#section")).toBe("/dashboard");
  });
});
