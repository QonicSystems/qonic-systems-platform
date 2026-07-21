import { describe, expect, it } from "vitest";
import { PERMISSIONS, resolvePermissions } from "@/lib/auth/permissions";
import { safeRedirectPath } from "@/lib/auth/session";

const NOW = new Date("2026-07-20T12:00:00Z");
const past = new Date("2026-07-19T12:00:00Z");
const future = new Date("2026-07-21T12:00:00Z");

const staff = { isSuperAdmin: false };
const ceo = { isSuperAdmin: true };

describe("resolvePermissions", () => {
  it("denies everything by default", () => {
    expect(resolvePermissions(staff, [], [], NOW).size).toBe(0);
  });

  it("grants what the role has enabled", () => {
    const result = resolvePermissions(staff, ["portal.access", "directory.view"], [], NOW);
    expect(result.has("portal.access")).toBe(true);
    expect(result.has("contract.release")).toBe(false);
  });

  it("gives the super admin every permission in the catalog, ignoring role rows", () => {
    const result = resolvePermissions(ceo, [], [], NOW);
    expect(result.size).toBe(PERMISSIONS.length);
    for (const permission of PERMISSIONS) expect(result.has(permission.key)).toBe(true);
  });

  it("cannot lock the super admin out, even with a DENY override", () => {
    const result = resolvePermissions(ceo, [], [{ permissionKey: "rbac.manage", effect: "DENY", expiresAt: null }], NOW);
    expect(result.has("rbac.manage")).toBe(true);
  });

  it("adds a permission via an ALLOW override", () => {
    const result = resolvePermissions(staff, [], [{ permissionKey: "contract.release", effect: "ALLOW", expiresAt: null }], NOW);
    expect(result.has("contract.release")).toBe(true);
  });

  it("removes a role-granted permission via a DENY override", () => {
    const result = resolvePermissions(staff, ["contract.release"], [{ permissionKey: "contract.release", effect: "DENY", expiresAt: null }], NOW);
    expect(result.has("contract.release")).toBe(false);
  });

  it("lets DENY beat ALLOW for the same permission", () => {
    const result = resolvePermissions(staff, [], [
      { permissionKey: "contract.release", effect: "ALLOW", expiresAt: null },
      { permissionKey: "contract.release", effect: "DENY", expiresAt: null },
    ], NOW);
    expect(result.has("contract.release")).toBe(false);
  });

  it("ignores an expired ALLOW override", () => {
    const result = resolvePermissions(staff, [], [{ permissionKey: "contract.release", effect: "ALLOW", expiresAt: past }], NOW);
    expect(result.has("contract.release")).toBe(false);
  });

  it("ignores an expired DENY override, restoring the role default", () => {
    const result = resolvePermissions(staff, ["contract.release"], [{ permissionKey: "contract.release", effect: "DENY", expiresAt: past }], NOW);
    expect(result.has("contract.release")).toBe(true);
  });

  it("honours an override that has not expired yet", () => {
    const result = resolvePermissions(staff, [], [{ permissionKey: "contract.release", effect: "ALLOW", expiresAt: future }], NOW);
    expect(result.has("contract.release")).toBe(true);
  });
});

describe("safeRedirectPath", () => {
  it("keeps a same-site absolute path", () => {
    expect(safeRedirectPath("/admin/permissions")).toBe("/admin/permissions");
  });

  it.each([
    ["https://evil.example.com", "absolute URL"],
    ["//evil.example.com", "protocol-relative URL"],
    ["javascript:alert(1)", "javascript scheme"],
    ["", "empty string"],
    [null, "null"],
    [undefined, "undefined"],
  ])("rejects %s (%s)", (value, _reason) => {
    expect(safeRedirectPath(value as string | null | undefined)).toBe("/dashboard");
  });

  it("refuses to bounce into the API surface", () => {
    expect(safeRedirectPath("/api/auth/logout")).toBe("/dashboard");
  });
});
