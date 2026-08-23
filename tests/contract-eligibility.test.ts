import { describe, expect, it } from "vitest";
import { hasAcceptedContract } from "@/lib/contracts/eligibility";
import type { ContractStatus } from "@/lib/generated/prisma/enums";

describe("hasAcceptedContract", () => {
  it("requires the subject to acknowledge a released contract", () => {
    expect(hasAcceptedContract([{ status: "DRAFT" }])).toBe(false);
    expect(hasAcceptedContract([{ status: "RELEASED" }])).toBe(false);
    expect(hasAcceptedContract([{ status: "ACKNOWLEDGED" }])).toBe(true);
  });

  it("keeps an accepted contract valid when older letters were revoked", () => {
    const letters: Array<{ status: ContractStatus }> = [{ status: "REVOKED" }, { status: "ACKNOWLEDGED" }];
    expect(hasAcceptedContract(letters)).toBe(true);
  });
});
