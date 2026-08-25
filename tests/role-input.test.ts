import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/guard";
import {
  ROLE_RANK_MAX,
  ROLE_RANK_MIN,
  mayUseRank,
  roleKeyFrom,
  validateRoleLabel,
  validateRoleRank,
} from "@/lib/auth/role-input";

/** Only `role` is read by mayUseRank; the rest is filler. */
const actor = (rank: number, isSuperAdmin = false): AuthContext =>
  ({ role: { rank, isSuperAdmin } } as unknown as AuthContext);

describe("roleKeyFrom", () => {
  it("slugs a label into a stable key", () => {
    expect(roleKeyFrom("Legal & Compliance")).toBe("legal_compliance");
    expect(roleKeyFrom("Marketing")).toBe("marketing");
    expect(roleKeyFrom("Account Manager")).toBe("account_manager");
  });

  it("never leaves a leading or trailing separator", () => {
    expect(roleKeyFrom("  Legal!  ")).toBe("legal");
    expect(roleKeyFrom("***Ops***")).toBe("ops");
  });

  it("returns empty for a label with nothing to slug", () => {
    // The caller turns this into a field error rather than creating a role with
    // an empty key, which would collide with the next such label.
    expect(roleKeyFrom("!!!")).toBe("");
    expect(roleKeyFrom("   ")).toBe("");
  });

  it("caps length without leaving a trailing underscore", () => {
    const key = roleKeyFrom("A".repeat(30) + " " + "B".repeat(30));
    expect(key.length).toBeLessThanOrEqual(40);
    expect(key.endsWith("_")).toBe(false);
  });
});

describe("validateRoleLabel", () => {
  it("accepts a normal name", () => {
    expect(validateRoleLabel("Legal")).toBeUndefined();
  });

  it("rejects a name that is too short or unsluggable", () => {
    expect(validateRoleLabel("L")).toBeDefined();
    expect(validateRoleLabel("!!!")).toBeDefined();
  });
});

describe("validateRoleRank", () => {
  it("accepts the allowed band", () => {
    expect(validateRoleRank(ROLE_RANK_MIN)).toBeUndefined();
    expect(validateRoleRank(20)).toBeUndefined();
    expect(validateRoleRank(ROLE_RANK_MAX)).toBeUndefined();
  });

  it("refuses rank 0 — that is the CEO tier", () => {
    // A second rank-0 role would outrank every guard in lib/auth/authority.ts
    // while holding none of the super admin's actual rights.
    expect(validateRoleRank(0)).toBeDefined();
  });

  it("refuses out-of-band and non-integer ranks", () => {
    expect(validateRoleRank(-1)).toBeDefined();
    expect(validateRoleRank(ROLE_RANK_MAX + 1)).toBeDefined();
    expect(validateRoleRank(1.5)).toBeDefined();
    expect(validateRoleRank(Number.NaN)).toBeDefined();
  });
});

describe("mayUseRank", () => {
  it("lets a super admin use any allowed rank", () => {
    expect(mayUseRank(actor(0, true), 1)).toBe(true);
    expect(mayUseRank(actor(0, true), 999)).toBe(true);
  });

  it("stops anyone else creating a role at or above their own level", () => {
    // Otherwise a Co-Founder holding rbac.manage could mint a rank-1 role that
    // outranks them in every canAdminister comparison.
    expect(mayUseRank(actor(10), 5)).toBe(false);
    expect(mayUseRank(actor(10), 10)).toBe(false);
    expect(mayUseRank(actor(10), 11)).toBe(true);
  });
});
