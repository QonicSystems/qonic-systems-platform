import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/guard";
import { canDecideLeave, parseDate, validateLeaveInput, workingDaysBetween } from "@/lib/leave/leave";

const actor = (id: string, permissions: string[]): AuthContext => ({
  user: { id, name: id, email: `${id}@x.com`, phone: null, jobTitle: null, photoUrl: null, mustChangePassword: false },
  role: { id: "r", key: id, label: id, isSuperAdmin: false, rank: 20 },
  permissions: new Set(permissions),
  sessionId: "s",
});

const MANAGER = actor("manager", ["leave.request", "leave.approve"]);
const HR = actor("hr", ["leave.request", "leave.approve", "leave.manage"]);
const PEER = actor("peer", ["leave.request"]);

const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("parseDate", () => {
  it("accepts a real date", () => {
    expect(parseDate("2026-09-01")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rejects an impossible date rather than rolling it over", () => {
    // Date.parse("2026-02-31") silently becomes 3 March, which would book the
    // wrong days off.
    expect(parseDate("2026-02-31")).toBeNull();
  });

  it.each(["not-a-date", "2026-13-01", "2026-00-10", "26-01-01", ""])("rejects %s", (value) => {
    expect(parseDate(value)).toBeNull();
  });
});

describe("workingDaysBetween", () => {
  it("counts a single weekday as one day", () => {
    expect(workingDaysBetween(utc("2026-07-20"), utc("2026-07-20"))).toBe(1); // Monday
  });

  it("counts a full Monday-to-Friday week as five", () => {
    expect(workingDaysBetween(utc("2026-07-20"), utc("2026-07-24"))).toBe(5);
  });

  it("excludes the weekend from a Monday-to-Monday span", () => {
    expect(workingDaysBetween(utc("2026-07-20"), utc("2026-07-27"))).toBe(6);
  });

  it("returns zero for a weekend-only range", () => {
    expect(workingDaysBetween(utc("2026-07-25"), utc("2026-07-26"))).toBe(0); // Sat–Sun
  });
});

describe("validateLeaveInput", () => {
  const valid = { leaveTypeId: "type-1", startDate: "2026-07-20", endDate: "2026-07-24", reason: "Holiday" };

  it("accepts a valid request and computes working days", () => {
    const { data, errors } = validateLeaveInput(valid);
    expect(errors).toEqual({});
    expect(data?.days).toBe(5);
  });

  it("requires a leave type", () => {
    expect(validateLeaveInput({ ...valid, leaveTypeId: "" }).errors.leaveTypeId).toBeDefined();
  });

  it("rejects an end date before the start", () => {
    expect(validateLeaveInput({ ...valid, endDate: "2026-07-19" }).errors.endDate).toBeDefined();
  });

  it("rejects a range containing no working days", () => {
    const { data, errors } = validateLeaveInput({ ...valid, startDate: "2026-07-25", endDate: "2026-07-26" });
    expect(data).toBeUndefined();
    expect(errors.startDate).toMatch(/no working days/i);
  });

  it("survives a non-object body", () => {
    expect(validateLeaveInput(null).data).toBeUndefined();
  });
});

describe("canDecideLeave", () => {
  const pending = { userId: "employee", status: "PENDING" };

  it("lets a manager decide their own report's request", () => {
    expect(canDecideLeave(MANAGER, pending, MANAGER.user.id).ok).toBe(true);
  });

  it("stops a manager deciding for someone who does not report to them", () => {
    const result = canDecideLeave(MANAGER, pending, "someone-else");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("lets leave.manage decide for anyone", () => {
    expect(canDecideLeave(HR, pending, "someone-else").ok).toBe(true);
  });

  it("stops a colleague with no approval rights", () => {
    expect(canDecideLeave(PEER, pending, null).ok).toBe(false);
  });

  it("stops anyone approving their own leave, even with leave.manage", () => {
    const own = { userId: HR.user.id, status: "PENDING" };
    const result = canDecideLeave(HR, own, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/your own leave/i);
  });

  it("refuses to re-decide a request that is already settled", () => {
    const result = canDecideLeave(HR, { userId: "employee", status: "APPROVED" }, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});
