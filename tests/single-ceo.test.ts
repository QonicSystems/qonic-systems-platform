import { describe, expect, it } from "vitest";
import { CEO_SINGLETON_KEY, ceoSingletonValue, mayTransferCeo } from "@/lib/auth/single-ceo";

describe("single CEO singleton value", () => {
  it("marks only the CEO role for the database uniqueness constraint", () => {
    expect(ceoSingletonValue("ceo")).toBe(CEO_SINGLETON_KEY);
    expect(ceoSingletonValue("co_founder")).toBeNull();
    expect(ceoSingletonValue("developer")).toBeNull();
  });

  it("permits a transfer only when the actor is the current CEO", () => {
    expect(mayTransferCeo("ceo-user", "ceo-user")).toBe(true);
    expect(mayTransferCeo("co-founder-user", "ceo-user")).toBe(false);
    expect(mayTransferCeo("ceo-user", null)).toBe(false);
  });
});
