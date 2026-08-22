import { describe, expect, it } from "vitest";
import { dailyRateFor, payoutCategoryFor, payoutLinesFor, workingDaysInMonth } from "@/lib/delivery/payout";

const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("workingDaysInMonth", () => {
  it("counts only Monday–Friday", () => {
    // August 2026: 1st is a Saturday, 31st a Monday — 21 weekdays.
    expect(workingDaysInMonth(utc("2026-08-14"))).toBe(21);
  });

  it("varies month to month rather than assuming a fixed count", () => {
    // February 2026 (28 days, starts on a Sunday) has fewer weekdays than August.
    expect(workingDaysInMonth(utc("2026-02-10"))).not.toBe(workingDaysInMonth(utc("2026-08-14")));
  });
});

describe("dailyRateFor", () => {
  it("divides the monthly figure by that day's actual month working-day count", () => {
    const days = workingDaysInMonth(utc("2026-08-14"));
    expect(dailyRateFor(21000000, utc("2026-08-14"))).toBe(Math.round(21000000 / days)); // ₹2,10,000/mo in minor units
  });

  it("is zero when there is no compensation figure on record", () => {
    expect(dailyRateFor(null, utc("2026-08-14"))).toBe(0);
  });

  it("gives a different daily figure for a month with a different working-day count, same monthly amount", () => {
    const augustRate = dailyRateFor(21000000, utc("2026-08-14"));
    const februaryRate = dailyRateFor(21000000, utc("2026-02-10"));
    expect(augustRate).not.toBe(februaryRate);
  });
});

describe("payoutCategoryFor", () => {
  it("is ACTUAL_PAYOUT on the day the assignment itself began", () => {
    expect(payoutCategoryFor(utc("2026-08-14"), utc("2026-08-14"))).toBe("ACTUAL_PAYOUT");
  });

  it("is ACTUAL_PAYOUT for any day after the assignment began", () => {
    expect(payoutCategoryFor(utc("2026-08-20"), utc("2026-08-14"))).toBe("ACTUAL_PAYOUT");
  });

  it("is BILLED_TO_COMPANY for a day before the assignment began — the backfill case", () => {
    expect(payoutCategoryFor(utc("2026-08-10"), utc("2026-08-14"))).toBe("BILLED_TO_COMPANY");
  });

  it("ignores the time-of-day component of the assignment timestamp", () => {
    expect(payoutCategoryFor(utc("2026-08-14"), new Date("2026-08-14T23:59:00.000Z"))).toBe("ACTUAL_PAYOUT");
  });
});

describe("payoutLinesFor", () => {
  const assignments = [{ projectId: "p1", assignmentStartedAt: utc("2026-08-14") }];
  const monthlyCompensation = 21000000; // ₹2,10,000/mo in minor units
  const expectedDaily = dailyRateFor(monthlyCompensation, utc("2026-08-14"));

  it("produces one line per bookable day, categorised by the assignment start", () => {
    const lines = payoutLinesFor(
      [
        { projectId: "p1", workDate: utc("2026-08-10"), billable: true }, // before assignment start → backfill
        { projectId: "p1", workDate: utc("2026-08-14"), billable: true }, // the start day itself
        { projectId: "p1", workDate: utc("2026-08-20"), billable: true }, // well after
      ],
      assignments,
      monthlyCompensation,
    );

    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.workDate.getTime() === utc("2026-08-10").getTime())?.category).toBe("BILLED_TO_COMPANY");
    expect(lines.find((l) => l.workDate.getTime() === utc("2026-08-14").getTime())?.category).toBe("ACTUAL_PAYOUT");
    expect(lines.find((l) => l.workDate.getTime() === utc("2026-08-20").getTime())?.category).toBe("ACTUAL_PAYOUT");
    expect(lines.every((l) => l.amount === expectedDaily)).toBe(true);
  });

  it("is the same daily rate regardless of which project a day is booked against — it's per-person, not per-project", () => {
    const lines = payoutLinesFor(
      [
        { projectId: "p1", workDate: utc("2026-08-20"), billable: true },
        { projectId: "p2", workDate: utc("2026-08-21"), billable: true },
      ],
      [
        { projectId: "p1", assignmentStartedAt: utc("2026-08-14") },
        { projectId: "p2", assignmentStartedAt: utc("2026-08-01") },
      ],
      monthlyCompensation,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe(lines[1].amount);
  });

  it("skips non-billable entries entirely — no line, not even a zero-amount one", () => {
    const lines = payoutLinesFor(
      [{ projectId: "p1", workDate: utc("2026-08-14"), billable: false }],
      assignments,
      monthlyCompensation,
    );
    expect(lines).toHaveLength(0);
  });

  it("counts a day once regardless of how many billable entries it has — day-based, not hourly", () => {
    const lines = payoutLinesFor(
      [
        { projectId: "p1", workDate: utc("2026-08-14"), billable: true },
        { projectId: "p1", workDate: utc("2026-08-14"), billable: true }, // a second task logged the same day
      ],
      assignments,
      monthlyCompensation,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(expectedDaily); // flat daily rate, not doubled
  });

  it("produces no line for a project with no matching assignment on record", () => {
    const lines = payoutLinesFor(
      [{ projectId: "unknown-project", workDate: utc("2026-08-14"), billable: true }],
      assignments,
      monthlyCompensation,
    );
    expect(lines).toHaveLength(0);
  });

  it("falls back to a zero rate, not a crash, when there is no compensation figure at all", () => {
    const lines = payoutLinesFor(
      [{ projectId: "p1", workDate: utc("2026-08-14"), billable: true }],
      assignments,
      null,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(0);
  });
});
