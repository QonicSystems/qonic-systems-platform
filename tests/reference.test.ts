import { describe, expect, it } from "vitest";
import {
  LEGACY_REFERENCE_PREFIXES,
  REFERENCE_PREFIX,
  nextReferenceFrom,
  referencePrefix,
  referencePrefixes,
  referenceWhere,
} from "@/lib/reference";

/**
 * Reference numbers are the identity of an invoice a client has paid against and
 * a contract letter someone has signed, so the rename from AVX to QNC changes
 * what is ISSUED NEXT and never what already exists.
 *
 * The subtle part is the counter: it reads every prefix the app has ever used,
 * because scoping it to the new one alone would restart numbering at 0001 and
 * produce a second "first invoice" for the same year.
 */
describe("reference numbering", () => {
  it("issues new references under the current brand", () => {
    expect(REFERENCE_PREFIX).toBe("QNC");
    expect(referencePrefix("INV", 2026)).toBe("QNC-INV-2026-");
    expect(nextReferenceFrom([], "INV", 2026)).toBe("QNC-INV-2026-0001");
    expect(nextReferenceFrom(["AVX-EI-2026-0003"], "EI", 2026)).toBe("QNC-EI-2026-0004");
  });

  it("continues the sequence across the rename instead of restarting it", () => {
    const existing = ["AVX-INV-2026-0001", "AVX-INV-2026-0002", "AVX-INV-2026-0007"];
    expect(nextReferenceFrom(existing, "INV", 2026)).toBe("QNC-INV-2026-0008");
  });

  it("keeps counting once both prefixes are present", () => {
    const existing = ["AVX-INV-2026-0007", "QNC-INV-2026-0008"];
    expect(nextReferenceFrom(existing, "INV", 2026)).toBe("QNC-INV-2026-0009");
  });

  it("takes the highest sequence, not the last row", () => {
    // findMany gives no ordering guarantee, so order must not matter.
    expect(nextReferenceFrom(["QNC-INV-2026-0009", "QNC-INV-2026-0003"], "INV", 2026)).toBe("QNC-INV-2026-0010");
  });

  it("ignores other years and other kinds", () => {
    const noise = ["QNC-INV-2025-0099", "QNC-CN-2026-0042", "QNC-JOB-2026-0500"];
    expect(nextReferenceFrom(noise, "INV", 2026)).toBe("QNC-INV-2026-0001");
  });

  it("survives a malformed tail rather than resetting to 0001", () => {
    // Number("") is 0 and Number("oops") is NaN; either silently rolling the
    // counter back would hand out a duplicate number.
    expect(nextReferenceFrom(["QNC-INV-2026-0005", "QNC-INV-2026-oops"], "INV", 2026)).toBe("QNC-INV-2026-0006");
    expect(nextReferenceFrom(["QNC-INV-2026-0005", "QNC-INV-2026-"], "INV", 2026)).toBe("QNC-INV-2026-0006");
  });

  it("pads to four digits and keeps going past a thousand", () => {
    expect(nextReferenceFrom(["QNC-INV-2026-0099"], "INV", 2026)).toBe("QNC-INV-2026-0100");
    expect(nextReferenceFrom(["QNC-INV-2026-9999"], "INV", 2026)).toBe("QNC-INV-2026-10000");
  });

  it("matches every prefix when querying, current one first", () => {
    expect(referencePrefixes("CL", 2026)).toEqual(["QNC-CL-2026-", "AVX-CL-2026-"]);
    expect(referenceWhere("reference", "CL", 2026)).toEqual([
      { reference: { startsWith: "QNC-CL-2026-" } },
      { reference: { startsWith: "AVX-CL-2026-" } },
    ]);
  });

  it("still knows the old brand so historic records stay findable", () => {
    expect(LEGACY_REFERENCE_PREFIXES).toContain("AVX");
    expect(LEGACY_REFERENCE_PREFIXES).not.toContain(REFERENCE_PREFIX);
  });
});
