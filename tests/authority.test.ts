import { describe, expect, it } from "vitest";
import { canAdminister, canAssignRole, canChangeOwnRole, canEditIdentity } from "@/lib/auth/authority";
import type { AuthContext } from "@/lib/auth/guard";

// Mirrors the seeded ranks: CEO 0, Co-Founder 10, HR/Accounts/Projects 20, Employee 50.
const role = (key: string, rank: number, isSuperAdmin = false) => ({ id: `role-${key}`, key, label: key.toUpperCase(), rank, isSuperAdmin });

const actor = (key: string, rank: number, isSuperAdmin = false, id = `user-${key}`): AuthContext => ({
  user: { id, name: key, email: `${key}@x.com`, phone: null, jobTitle: null, photoUrl: null, mustChangePassword: false },
  role: role(key, rank, isSuperAdmin),
  permissions: new Set(),
  sessionId: "s1",
});

const target = (key: string, rank: number, isSuperAdmin = false, id = `user-${key}`) => ({ id, role: role(key, rank, isSuperAdmin) });

const CEO = actor("ceo", 0, true);
const CO_FOUNDER = actor("co_founder", 10);
const HR = actor("hr", 20);

describe("canAdminister — who may act on whom", () => {
  it("lets the CEO administer everyone", () => {
    for (const person of [target("co_founder", 10), target("hr", 20), target("employee", 50)]) {
      expect(canAdminister(CEO, person).ok).toBe(true);
    }
  });

  it("lets HR administer an Employee", () => {
    expect(canAdminister(HR, target("employee", 50)).ok).toBe(true);
  });

  it("stops HR administering Accounts or Projects — the same rank is not junior", () => {
    expect(canAdminister(HR, target("accounts", 20)).ok).toBe(false);
    expect(canAdminister(HR, target("projects", 20)).ok).toBe(false);
  });

  it("stops HR administering more senior roles", () => {
    expect(canAdminister(HR, target("co_founder", 10)).ok).toBe(false);
    expect(canAdminister(HR, target("ceo", 0, true)).ok).toBe(false);
  });

  it("stops anyone but a super admin touching the super admin", () => {
    const result = canAdminister(CO_FOUNDER, target("ceo", 0, true));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/super admin/i);
  });

  it("refuses self-administration, which would otherwise allow self-promotion", () => {
    const self = canAdminister(HR, target("hr", 20, false, HR.user.id));
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.status).toBe(409);
  });

  it("refuses self-administration even for the CEO", () => {
    expect(canAdminister(CEO, target("ceo", 0, true, CEO.user.id)).ok).toBe(false);
  });
});

describe("canAssignRole — preventing privilege escalation", () => {
  it("lets the CEO assign any role", () => {
    expect(canAssignRole(CEO, role("co_founder", 10)).ok).toBe(true);
    expect(canAssignRole(CEO, role("ceo", 0, true)).ok).toBe(true);
  });

  it("lets HR assign only roles junior to HR", () => {
    expect(canAssignRole(HR, role("employee", 50)).ok).toBe(true);
    expect(canAssignRole(HR, role("accounts", 20)).ok).toBe(false);
    expect(canAssignRole(HR, role("co_founder", 10)).ok).toBe(false);
  });

  it("never lets a non-super-admin grant super-admin", () => {
    const result = canAssignRole(CO_FOUNDER, role("ceo", 0, true));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/super.admin/i);
  });
});

describe("canEditIdentity — self-edit of name/email/phone", () => {
  it("lets you edit your own identity, which canAdminister refuses", () => {
    const self = { id: CEO.user.id, role: CEO.role };
    expect(canAdminister(CEO, self).ok).toBe(false);
    expect(canEditIdentity(CEO, self).ok).toBe(true);
  });

  it("lets a non-super-admin edit their own identity too", () => {
    const self = { id: HR.user.id, role: HR.role };
    expect(canEditIdentity(HR, self).ok).toBe(true);
  });

  it("still applies seniority to everyone else", () => {
    expect(canEditIdentity(HR, target("employee", 50)).ok).toBe(true);
    expect(canEditIdentity(HR, target("co_founder", 10)).ok).toBe(false);
    expect(canEditIdentity(HR, target("ceo", 0, true)).ok).toBe(false);
  });
});

describe("canChangeOwnRole — the escalation guard the self-edit relaxation relies on", () => {
  it("refuses a self role change", () => {
    const self = { id: HR.user.id, role: HR.role };
    const result = canChangeOwnRole(HR, self, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("allows a self edit that leaves the role alone", () => {
    const self = { id: HR.user.id, role: HR.role };
    expect(canChangeOwnRole(HR, self, false).ok).toBe(true);
  });

  it("does not interfere with changing someone else's role", () => {
    expect(canChangeOwnRole(CEO, target("employee", 50), true).ok).toBe(true);
  });

  it("blocks self-escalation even for the super admin", () => {
    const self = { id: CEO.user.id, role: CEO.role };
    expect(canChangeOwnRole(CEO, self, true).ok).toBe(false);
  });
});
