import { describe, expect, it } from "vitest";
import { missingPreStartWorkdays } from "@/lib/finance/prestart-backfill";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("missingPreStartWorkdays", () => {
  it("flags only the unrecorded project-start weekdays before Actual Start", () => {
    expect(missingPreStartWorkdays({
      projectStart: utc("2026-08-10"),
      actualStart: utc("2026-08-13"),
      today: utc("2026-08-23"),
      recordedDays: new Set(),
    }).map((day) => day.toISOString().slice(0, 10))).toEqual(["2026-08-10", "2026-08-11", "2026-08-12"]);
  });

  it("skips weekends, days with any recorded time, and future dates", () => {
    expect(missingPreStartWorkdays({
      projectStart: utc("2026-08-07"),
      actualStart: utc("2026-08-17"),
      today: utc("2026-08-12"),
      recordedDays: new Set(["2026-08-10"]),
    }).map((day) => day.toISOString().slice(0, 10))).toEqual(["2026-08-07", "2026-08-11", "2026-08-12"]);
  });

  it("does not flag a project that began on or after Actual Start", () => {
    expect(missingPreStartWorkdays({
      projectStart: utc("2026-08-13"),
      actualStart: utc("2026-08-13"),
      today: utc("2026-08-23"),
      recordedDays: new Set(),
    })).toEqual([]);
  });
});
