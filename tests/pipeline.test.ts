import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/guard";
import { PIPELINE, availableStages, canMoveStage, conversionRate, jobAgeing } from "@/lib/ats/pipeline";
import type { ApplicationStage } from "@/lib/generated/prisma/enums";

const actor = (permissions: string[]): AuthContext => ({
  user: { id: "u1", name: "R", email: "r@x.com", phone: null, jobTitle: null, photoUrl: null, mustChangePassword: false },
  role: { id: "r", key: "projects", label: "Projects", isSuperAdmin: false, rank: 20 },
  permissions: new Set(permissions),
  sessionId: "s",
});

const RECRUITER = actor(["candidate.manage", "placement.manage"]);
const VIEWER = actor(["candidate.view"]);

describe("canMoveStage — forward movement", () => {
  it("advances one step at a time", () => {
    expect(canMoveStage(RECRUITER, "SOURCED", "SCREENED").ok).toBe(true);
    expect(canMoveStage(RECRUITER, "SCREENED", "SUBMITTED").ok).toBe(true);
    expect(canMoveStage(RECRUITER, "SUBMITTED", "INTERVIEW").ok).toBe(true);
    expect(canMoveStage(RECRUITER, "INTERVIEW", "OFFER").ok).toBe(true);
  });

  it("refuses to skip a stage, which would hide the history", () => {
    const result = canMoveStage(RECRUITER, "SOURCED", "OFFER");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/first/i);
  });

  it("allows moving BACK, because a candidate can go for another round", () => {
    expect(canMoveStage(RECRUITER, "OFFER", "INTERVIEW").ok).toBe(true);
  });

  it("routes PLACED through the placement flow, not a stage move", () => {
    const result = canMoveStage(RECRUITER, "OFFER", "PLACED");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/record a placement/i);
  });
});

describe("canMoveStage — dropping out", () => {
  it.each(PIPELINE.filter((s) => s !== "PLACED"))("can reject from %s", (stage) => {
    expect(canMoveStage(RECRUITER, stage, "REJECTED").ok).toBe(true);
  });

  it("can withdraw from a live stage", () => {
    expect(canMoveStage(RECRUITER, "INTERVIEW", "WITHDRAWN").ok).toBe(true);
  });

  it.each(["PLACED", "REJECTED", "WITHDRAWN"] as ApplicationStage[])("refuses to move a %s application", (stage) => {
    const result = canMoveStage(RECRUITER, stage, "SCREENED");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});

describe("canMoveStage — permissions", () => {
  it("requires candidate.manage", () => {
    const result = canMoveStage(VIEWER, "SOURCED", "SCREENED");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("refuses a no-op move", () => {
    expect(canMoveStage(RECRUITER, "SOURCED", "SOURCED").ok).toBe(false);
  });
});

describe("availableStages", () => {
  it("offers the next step plus the two exits", () => {
    expect([...availableStages(RECRUITER, "SOURCED")].sort()).toEqual(["REJECTED", "SCREENED", "WITHDRAWN"]);
  });

  it("offers a viewer nothing", () => {
    expect(availableStages(VIEWER, "SOURCED")).toHaveLength(0);
  });

  it("offers nothing from a terminal stage", () => {
    expect(availableStages(RECRUITER, "PLACED")).toHaveLength(0);
  });
});

describe("jobAgeing", () => {
  const created = new Date("2026-06-01T00:00:00.000Z");
  const on = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("counts days open", () => {
    expect(jobAgeing({ status: "OPEN", slaDays: 30, createdAt: created }, on("2026-06-21")).days).toBe(20);
  });

  it("flags a job past its SLA", () => {
    expect(jobAgeing({ status: "OPEN", slaDays: 30, createdAt: created }, on("2026-07-15")).overSla).toBe(true);
  });

  it("does not flag one inside its SLA", () => {
    expect(jobAgeing({ status: "OPEN", slaDays: 30, createdAt: created }, on("2026-06-21")).overSla).toBe(false);
  });

  it("does not flag a job that is no longer open", () => {
    expect(jobAgeing({ status: "FILLED", slaDays: 30, createdAt: created }, on("2026-12-01")).overSla).toBe(false);
  });

  it("does not flag a job with no SLA agreed", () => {
    expect(jobAgeing({ status: "OPEN", slaDays: null, createdAt: created }, on("2027-01-01")).overSla).toBe(false);
  });
});

describe("conversionRate", () => {
  it("computes the share that progressed", () => {
    expect(conversionRate({ SOURCED: 100, SCREENED: 40 }, "SOURCED", "SCREENED")).toBe(0.4);
  });

  it("returns zero rather than dividing by zero", () => {
    expect(conversionRate({ SOURCED: 0, SCREENED: 0 }, "SOURCED", "SCREENED")).toBe(0);
  });

  it("treats a missing stage as zero", () => {
    expect(conversionRate({ SOURCED: 10 }, "SOURCED", "PLACED")).toBe(0);
  });
});
