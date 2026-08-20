import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/guard";
import { TRANSITIONS, availableTransitions, canEditContent, canTransition, canViewLetter } from "@/lib/contracts/workflow";
import { validateContractPayload } from "@/lib/contracts/payload";
import type { ContractStatus } from "@/lib/generated/prisma/enums";

const actor = (id: string, permissions: string[], isSuperAdmin = false): AuthContext => ({
  user: { id, name: id, email: `${id}@x.com`, phone: null, jobTitle: null, photoUrl: null, mustChangePassword: false, unreadNotificationCount: 0 },
  role: { id: "r", key: id, label: id, isSuperAdmin, rank: 20 },
  permissions: new Set(permissions),
  sessionId: "s",
});

const HR = actor("hr", ["contract.generate", "contract.submit", "contract.view_all"]);
const CEO = actor("ceo", ["contract.release", "contract.revoke", "contract.view_all"], true);
const EMPLOYEE = actor("employee", ["contract.view_own"]);

const letter = (status: ContractStatus, subjectUserId = "employee", authorUserId = "hr") => ({ status, subjectUserId, authorUserId });

describe("canTransition — the happy path", () => {
  it("lets HR submit a draft", () => {
    expect(canTransition(HR, letter("DRAFT"), "PENDING_RELEASE").ok).toBe(true);
  });

  it("lets the CEO release a pending letter", () => {
    expect(canTransition(CEO, letter("PENDING_RELEASE"), "RELEASED").ok).toBe(true);
  });

  it("lets the CEO request changes instead of releasing", () => {
    expect(canTransition(CEO, letter("PENDING_RELEASE"), "CHANGES_REQUESTED").ok).toBe(true);
  });

  it("lets HR resubmit after changes were requested", () => {
    expect(canTransition(HR, letter("CHANGES_REQUESTED"), "PENDING_RELEASE").ok).toBe(true);
  });

  it("lets the subject acknowledge a released letter", () => {
    expect(canTransition(EMPLOYEE, letter("RELEASED"), "ACKNOWLEDGED").ok).toBe(true);
  });
});

describe("canTransition — permission rules", () => {
  it("stops HR releasing, because they lack contract.release", () => {
    const result = canTransition(HR, letter("PENDING_RELEASE"), "RELEASED");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("stops an employee releasing anything", () => {
    expect(canTransition(EMPLOYEE, letter("PENDING_RELEASE", "someone-else"), "RELEASED").ok).toBe(false);
  });

  it("stops a non-subject acknowledging on someone's behalf", () => {
    const result = canTransition(CEO, letter("RELEASED"), "ACKNOWLEDGED");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/only the person/i);
  });
});

describe("canTransition — segregation of duties", () => {
  it("stops anyone releasing their OWN contract letter, even the CEO", () => {
    const ownLetter = letter("PENDING_RELEASE", CEO.user.id, "hr");
    const result = canTransition(CEO, ownLetter, "RELEASED");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/your own contract letter/i);
  });

  it("stops anyone revoking their own letter", () => {
    expect(canTransition(CEO, letter("RELEASED", CEO.user.id), "REVOKED").ok).toBe(false);
  });

  it("stops anyone rejecting their own letter", () => {
    expect(canTransition(CEO, letter("PENDING_RELEASE", CEO.user.id), "CHANGES_REQUESTED").ok).toBe(false);
  });
});

describe("canTransition — illegal state moves", () => {
  it.each([
    ["DRAFT", "RELEASED"],
    ["DRAFT", "ACKNOWLEDGED"],
    ["RELEASED", "DRAFT"],
    ["REVOKED", "RELEASED"],
    ["ACKNOWLEDGED", "PENDING_RELEASE"],
  ] as Array<[ContractStatus, ContractStatus]>)("refuses %s → %s", (from, to) => {
    const result = canTransition(CEO, letter(from), to);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("never allows a transition that is not in the table", () => {
    for (const status of ["DRAFT", "PENDING_RELEASE", "RELEASED", "ACKNOWLEDGED", "REVOKED"] as ContractStatus[]) {
      const allowed = TRANSITIONS.filter((rule) => rule.from === status).map((rule) => rule.to);
      const attempted = canTransition(CEO, letter(status), status); // self-transition
      expect(allowed.includes(status)).toBe(false);
      expect(attempted.ok).toBe(false);
    }
  });
});

describe("availableTransitions", () => {
  it("offers HR only the submit action on a draft", () => {
    expect(availableTransitions(HR, letter("DRAFT")).map((rule) => rule.to)).toEqual(["PENDING_RELEASE"]);
  });

  it("offers the CEO both release and request-changes on a pending letter", () => {
    expect(availableTransitions(CEO, letter("PENDING_RELEASE")).map((rule) => rule.to).sort()).toEqual(["CHANGES_REQUESTED", "RELEASED"]);
  });

  it("offers an employee nothing on a draft they are the subject of", () => {
    expect(availableTransitions(EMPLOYEE, letter("DRAFT"))).toHaveLength(0);
  });
});

describe("visibility and editing", () => {
  it("lets the subject view their own letter", () => {
    expect(canViewLetter(EMPLOYEE, letter("RELEASED"))).toBe(true);
  });

  it("hides other people's letters from an employee", () => {
    expect(canViewLetter(EMPLOYEE, letter("RELEASED", "someone-else", "hr"))).toBe(false);
  });

  it("allows editing only while draft or changes-requested", () => {
    expect(canEditContent(HR, letter("DRAFT"))).toBe(true);
    expect(canEditContent(HR, letter("CHANGES_REQUESTED"))).toBe(true);
    expect(canEditContent(HR, letter("PENDING_RELEASE"))).toBe(false);
    expect(canEditContent(HR, letter("RELEASED"))).toBe(false);
  });

  it("stops an employee editing the terms of their own letter", () => {
    expect(canEditContent(EMPLOYEE, letter("DRAFT"))).toBe(false);
  });
});

describe("validateContractPayload", () => {
  const valid = {
    jobTitle: "Senior Developer", employmentType: "Full-time Contract", startDate: "2026-09-01",
    monthlyCompensation: "150000", currency: "INR", location: "Bengaluru",
    reportingTo: "", noticePeriod: "60 days", additionalTerms: "",
  };

  it("accepts a complete payload", () => {
    expect(validateContractPayload(valid).errors).toEqual({});
  });

  it.each([
    ["jobTitle", ""],
    ["startDate", "not-a-date"],
    ["monthlyCompensation", "lots"],
    ["currency", "XYZ"],
    ["location", ""],
    ["employmentType", "Freelance-ish"],
  ])("rejects a bad %s", (field, value) => {
    const { data, errors } = validateContractPayload({ ...valid, [field]: value });
    expect(data).toBeUndefined();
    expect(errors[field as keyof typeof errors]).toBeDefined();
  });

  it("rejects an impossible calendar date", () => {
    expect(validateContractPayload({ ...valid, startDate: "2026-02-31" }).errors.startDate).toBeDefined();
  });

  it("survives a non-object body", () => {
    expect(validateContractPayload(null).data).toBeUndefined();
  });
});
