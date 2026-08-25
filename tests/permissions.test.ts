import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, resolvePermissions, SUPER_ADMIN_ONLY_PERMISSIONS } from "@/lib/auth/permissions";
import { ROLE } from "@/lib/auth/roles";
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

describe("capability catalog", () => {
  const permissionKeys: ReadonlySet<string> = new Set(PERMISSIONS.map((permission) => permission.key));

  it("exposes distinct administration capabilities for every administration workspace", () => {
    expect(PERMISSIONS.filter((permission) => permission.group === "People").map((permission) => permission.key)).toEqual([
      "user.view", "user.manage", "user.deactivate", "user.delete", "user.purge",
    ]);
    expect(PERMISSIONS.filter((permission) => permission.group === "Roles & Permissions").map((permission) => permission.key)).toEqual(["rbac.manage"]);
    expect(PERMISSIONS.filter((permission) => permission.group === "Holidays").map((permission) => permission.key)).toEqual([
      "holiday.view", "holiday.manage",
    ]);
    expect(PERMISSIONS.filter((permission) => permission.group === "Audit Log").map((permission) => permission.key)).toEqual([
      "audit.view", "audit.export", "audit.purge",
    ]);
  });

  it("includes separate export capabilities for financial and audit data", () => {
    expect(permissionKeys.has("finance.export")).toBe(true);
    expect(permissionKeys.has("audit.export")).toBe(true);
  });

  it("registers the CEO-only company announcement release capability", () => {
    const release = PERMISSIONS.find((permission) => permission.key === "announcement.publish");
    expect(release).toMatchObject({ group: "Administration", label: "Release company announcements" });
    expect(SUPER_ADMIN_ONLY_PERMISSIONS.has("announcement.publish")).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE.CO_FOUNDER]).not.toContain("announcement.publish");
  });

  it("keeps every default and CEO-only capability registered in the catalog", () => {
    for (const permissions of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permission of permissions) expect(permissionKeys.has(permission)).toBe(true);
    }
    for (const permission of SUPER_ADMIN_ONLY_PERMISSIONS) expect(permissionKeys.has(permission)).toBe(true);
  });

  it("gives a Co-Founder the current administration and export capabilities", () => {
    const coFounderPermissions = DEFAULT_ROLE_PERMISSIONS[ROLE.CO_FOUNDER];
    expect(coFounderPermissions).toEqual(expect.arrayContaining([
      "holiday.view", "holiday.manage", "audit.view", "audit.export", "finance.export",
    ]));
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
