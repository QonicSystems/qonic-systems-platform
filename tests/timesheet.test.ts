import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/guard";
import {
  canDecideTimesheet, canEditTimesheet, canSubmitTimesheet,
  formatDuration, isDayBookable, parseDuration, projectBookingStart, weekDays, weekStartOf, canRecallTimesheet,
} from "@/lib/delivery/timesheet";
import { toMinorUnits, validateClient, validateProject } from "@/lib/delivery/validate";

const actor = (id: string, permissions: string[]): AuthContext => ({
  user: { id, name: id, email: `${id}@x.com`, phone: null, jobTitle: null, photoUrl: null, mustChangePassword: false, unreadNotificationCount: 0 },
  role: { id: "r", key: id, label: id, isSuperAdmin: false, rank: 20 },
  permissions: new Set(permissions),
  sessionId: "s",
});

const EMPLOYEE = actor("employee", ["timesheet.submit"]);
const MANAGER = actor("manager", ["timesheet.submit", "timesheet.approve"]);
const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("weekStartOf", () => {
  it("returns the same Monday for every day of that week", () => {
    // 2026-07-20 is a Monday.
    for (const day of ["2026-07-20", "2026-07-22", "2026-07-25"]) {
      expect(weekStartOf(utc(day)).toISOString().slice(0, 10)).toBe("2026-07-20");
    }
  });

  it("treats Sunday as the END of its week, not the start", () => {
    // A naive getUTCDay() implementation puts Sunday in the following week.
    expect(weekStartOf(utc("2026-07-26")).toISOString().slice(0, 10)).toBe("2026-07-20");
  });

  it("produces seven consecutive days", () => {
    const days = weekDays(weekStartOf(utc("2026-07-22"))).map((d) => d.toISOString().slice(0, 10));
    expect(days).toEqual(["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"]);
  });
});

describe("isDayBookable", () => {
  const today = utc("2026-08-20"); // a Thursday

  it("is not bookable when no project booking boundary is known", () => {
    expect(isDayBookable(utc("2026-08-20"), today, null)).toBe(false);
  });

  it("is bookable today", () => {
    expect(isDayBookable(utc("2026-08-20"), today, utc("2026-01-01"))).toBe(true);
  });

  it("is not bookable for any day after today", () => {
    expect(isDayBookable(utc("2026-08-21"), today, utc("2026-01-01"))).toBe(false);
  });

  it("is bookable on the Project Start Date", () => {
    expect(isDayBookable(utc("2026-08-14"), today, utc("2026-08-14"))).toBe(true);
  });

  it("is not bookable before the Project Start Date, even within the same week", () => {
    // Project started Friday the 14th — Monday-Thursday of that same week are still locked.
    expect(isDayBookable(utc("2026-08-10"), today, utc("2026-08-14"))).toBe(false);
  });

  it("ignores the time-of-day component of the project start timestamp", () => {
    expect(isDayBookable(utc("2026-08-14"), today, new Date("2026-08-14T23:59:00.000Z"))).toBe(true);
  });

  it("uses the project start even when a Developer's payout start is later", () => {
    const projectStart = utc("2026-08-10");
    const developerPayoutStart = utc("2026-08-13");
    expect(isDayBookable(utc("2026-08-10"), today, projectStart)).toBe(true);
    expect(developerPayoutStart.getTime()).toBeGreaterThan(projectStart.getTime());
  });

  it("falls back to the assignment creation date only for legacy projects without a start date", () => {
    expect(projectBookingStart(null, utc("2026-08-13")).toISOString().slice(0, 10)).toBe("2026-08-13");
    expect(projectBookingStart(utc("2026-08-10"), utc("2026-08-13")).toISOString().slice(0, 10)).toBe("2026-08-10");
  });
});

describe("parseDuration", () => {
  it.each([
    ["7.5", 450], ["7,5", 450], ["8", 480], ["8h", 480],
    ["7:30", 450], ["0:15", 15], ["450m", 450], ["", 0], ["   ", 0],
  ])("parses %s to %i minutes", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["abc", "7:75", "-3", "1.2.3", "12:"])("rejects %s", (input) => {
    expect(parseDuration(input)).toBeNull();
  });

  it("round-trips through formatDuration", () => {
    expect(formatDuration(parseDuration("7:30")!)).toBe("7h 30m");
    expect(formatDuration(parseDuration("8")!)).toBe("8h");
    expect(formatDuration(0)).toBe("—");
  });
});

describe("canEditTimesheet", () => {
  it.each(["DRAFT", "REJECTED"] as const)("allows editing your own %s week", (status) => {
    expect(canEditTimesheet(EMPLOYEE, { userId: EMPLOYEE.user.id, status })).toBe(true);
  });

  it.each(["SUBMITTED", "APPROVED"] as const)("locks your own %s week", (status) => {
    expect(canEditTimesheet(EMPLOYEE, { userId: EMPLOYEE.user.id, status })).toBe(false);
  });

  it("does not let a plain employee edit someone else's week, even a draft", () => {
    expect(canEditTimesheet(EMPLOYEE, { userId: "someone-else", status: "DRAFT" })).toBe(false);
  });

  it("lets an approver backfill another person's still-open week — the offboarding handover path", () => {
    expect(canEditTimesheet(MANAGER, { userId: EMPLOYEE.user.id, status: "DRAFT" })).toBe(true);
    expect(canEditTimesheet(MANAGER, { userId: EMPLOYEE.user.id, status: "REJECTED" })).toBe(true);
  });

  it("an approver still cannot touch a week that is already submitted or approved", () => {
    expect(canEditTimesheet(MANAGER, { userId: EMPLOYEE.user.id, status: "SUBMITTED" })).toBe(false);
    expect(canEditTimesheet(MANAGER, { userId: EMPLOYEE.user.id, status: "APPROVED" })).toBe(false);
  });
});

describe("canSubmitTimesheet", () => {
  it("submits a draft that has time on it", () => {
    expect(canSubmitTimesheet(EMPLOYEE, { userId: EMPLOYEE.user.id, status: "DRAFT" }, 480).ok).toBe(true);
  });

  it("refuses an empty week", () => {
    const result = canSubmitTimesheet(EMPLOYEE, { userId: EMPLOYEE.user.id, status: "DRAFT" }, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/add some time/i);
  });

  it("refuses to resubmit an already-submitted week", () => {
    expect(canSubmitTimesheet(EMPLOYEE, { userId: EMPLOYEE.user.id, status: "SUBMITTED" }, 480).ok).toBe(false);
  });

  it("refuses to submit on someone else's behalf", () => {
    expect(canSubmitTimesheet(MANAGER, { userId: EMPLOYEE.user.id, status: "DRAFT" }, 480).ok).toBe(false);
  });
});

describe("canDecideTimesheet", () => {
  it("lets an approver decide a submitted week", () => {
    expect(canDecideTimesheet(MANAGER, { userId: EMPLOYEE.user.id, status: "SUBMITTED" }).ok).toBe(true);
  });

  it("stops someone approving their OWN timesheet", () => {
    const result = canDecideTimesheet(MANAGER, { userId: MANAGER.user.id, status: "SUBMITTED" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/your own timesheet/i);
  });

  it("stops an employee without the approve permission", () => {
    expect(canDecideTimesheet(EMPLOYEE, { userId: "someone", status: "SUBMITTED" }).ok).toBe(false);
  });

  it.each(["DRAFT", "APPROVED", "REJECTED"] as const)("refuses to decide a %s week", (status) => {
    const result = canDecideTimesheet(MANAGER, { userId: EMPLOYEE.user.id, status });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});

describe("money handling", () => {
  it("converts to minor units without floating-point drift", () => {
    expect(toMinorUnits("1250.50")).toBe(125050);
    expect(toMinorUnits("0.10")).toBe(10);
    expect(toMinorUnits("")).toBeNull();
  });

  it("rejects a non-numeric amount", () => {
    expect(Number.isNaN(toMinorUnits("lots") as number)).toBe(true);
  });
});

describe("validateClient", () => {
  const valid = { name: "Acme Corp", code: "ACME", status: "ACTIVE", industry: "", website: "", ownerId: "", notes: "" };

  it("accepts a valid client", () => {
    expect(validateClient(valid).errors).toEqual({});
  });

  it("uppercases the code", () => {
    expect(validateClient({ ...valid, code: "acme" }).data?.code).toBe("ACME");
  });

  it.each([["name", ""], ["code", "a"], ["code", "TOOLONGACODE"], ["status", "NOPE"], ["website", "acme.com"]])(
    "rejects a bad %s", (field, value) => {
      expect(validateClient({ ...valid, [field]: value }).errors[field as "name"]).toBeDefined();
    });
});

describe("validateProject", () => {
  const valid = {
    name: "Website Rebuild", code: "WEB-01", clientId: "c1", status: "ACTIVE", billing: "TIME_AND_MATERIALS",
    budgetAmount: "250000", budgetCurrency: "INR", defaultRate: "3500", startDate: "", endDate: "", managerId: "", notes: "",
  };

  it("accepts a valid project", () => {
    expect(validateProject(valid).errors).toEqual({});
  });

  it("rejects an end date before the start", () => {
    expect(validateProject({ ...valid, startDate: "2026-09-01", endDate: "2026-08-01" }).errors.endDate).toBeDefined();
  });

  it("requires a client", () => {
    expect(validateProject({ ...valid, clientId: "" }).errors.clientId).toBeDefined();
  });

  it("rejects an unknown billing model", () => {
    expect(validateProject({ ...valid, billing: "BARTER" }).errors.billing).toBeDefined();
  });
});

/**
 * Recall: pulling a submitted week back to draft.
 *
 * Submitting was one-way — EDITABLE_STATUSES covers DRAFT and REJECTED only —
 * so a week sent in with a typo could only be fixed by an approver rejecting it,
 * which put a spurious rejection on the record.
 */
describe("recalling a submitted timesheet", () => {
  const owner = { user: { id: "u1" }, permissions: new Set(["timesheet.submit"]) } as never;
  const other = { user: { id: "u2" }, permissions: new Set(["timesheet.submit"]) } as never;
  const noPerm = { user: { id: "u1" }, permissions: new Set<string>() } as never;

  it("lets the owner pull back a week that is still awaiting approval", () => {
    expect(canRecallTimesheet(owner, { userId: "u1", status: "SUBMITTED" })).toEqual({ ok: true });
  });

  it("refuses once the week has been approved", () => {
    const result = canRecallTimesheet(owner, { userId: "u1", status: "APPROVED" });
    expect(result.ok).toBe(false);
    // Approved time is immutable; rejection is the route back, not recall.
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("refuses a week that was never submitted", () => {
    for (const status of ["DRAFT", "REJECTED"] as const) {
      const result = canRecallTimesheet(owner, { userId: "u1", status });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(409);
    }
  });

  it("refuses someone else's timesheet", () => {
    const result = canRecallTimesheet(other, { userId: "u1", status: "SUBMITTED" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("refuses without permission to record time", () => {
    const result = canRecallTimesheet(noPerm, { userId: "u1", status: "SUBMITTED" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});
