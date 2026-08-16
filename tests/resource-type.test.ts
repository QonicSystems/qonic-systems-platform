import { describe, expect, it } from "vitest";
import {
  RESOURCE_TYPE,
  RESOURCE_TYPE_LABEL,
  RESOURCE_TYPE_TABS,
  resourceTypeOf,
} from "@/lib/ats/resource-type";

/**
 * `Candidate.source` is free text chosen in a dropdown, written by the public
 * careers route, and — in older records — stored as a screaming-snake enum. The
 * candidate pool's filter tabs and badges all key off this one function, so the
 * spellings that exist in real data are pinned here.
 */
describe("candidate resource type", () => {
  it("groups the visa-sponsored sources", () => {
    expect(resourceTypeOf("Global Visa Resource")).toBe(RESOURCE_TYPE.GLOBAL);
    // The shape the e2e suite and older records write.
    expect(resourceTypeOf("GLOBAL_VISA_RESOURCE")).toBe(RESOURCE_TYPE.GLOBAL);
    expect(resourceTypeOf("  global visa resource  ")).toBe(RESOURCE_TYPE.GLOBAL);
  });

  it("groups both developer-sourcing channels as Employee Dev", () => {
    expect(resourceTypeOf("Direct / LinkedIn")).toBe(RESOURCE_TYPE.EMPLOYEE_DEV);
    expect(resourceTypeOf("Internal Connection")).toBe(RESOURCE_TYPE.EMPLOYEE_DEV);
  });

  it("treats applicants and unknown sources as direct", () => {
    expect(resourceTypeOf("Job Application")).toBe(RESOURCE_TYPE.DIRECT);
    expect(resourceTypeOf("Careers site")).toBe(RESOURCE_TYPE.DIRECT);
    expect(resourceTypeOf("Direct")).toBe(RESOURCE_TYPE.DIRECT);
    // An unrecognised source must land somewhere rather than throw: a candidate
    // with an odd source still has to appear in the pool.
    expect(resourceTypeOf("Referred by a client")).toBe(RESOURCE_TYPE.DIRECT);
    expect(resourceTypeOf("")).toBe(RESOURCE_TYPE.DIRECT);
    expect(resourceTypeOf(null)).toBe(RESOURCE_TYPE.DIRECT);
    expect(resourceTypeOf(undefined)).toBe(RESOURCE_TYPE.DIRECT);
  });

  it("never puts a LinkedIn-sourced developer in the visa group", () => {
    // "Direct / LinkedIn" starts with the word Direct, so a substring match
    // would silently misfile every developer sourced that way.
    expect(resourceTypeOf("Direct / LinkedIn")).not.toBe(RESOURCE_TYPE.DIRECT);
  });

  it("offers one filter tab per group, plus All", () => {
    expect(RESOURCE_TYPE_TABS.map((tab) => tab.key)).toEqual([
      "ALL",
      RESOURCE_TYPE.GLOBAL,
      RESOURCE_TYPE.EMPLOYEE_DEV,
      RESOURCE_TYPE.DIRECT,
    ]);
    for (const type of Object.values(RESOURCE_TYPE)) {
      expect(RESOURCE_TYPE_LABEL[type]).toBeTruthy();
    }
  });
});
