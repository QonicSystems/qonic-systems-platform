import { describe, expect, it } from "vitest";
import { orphanedDeliveryEarningInvoiceIds } from "@/lib/finance/delivery-earning-cleanup";

describe("delivery earning cleanup", () => {
  it("removes only a delivery invoice with no remaining payout days for its person, currency, and month", () => {
    const orphaned = orphanedDeliveryEarningInvoiceIds(
      [
        { id: "remove", userId: "developer-a", currency: "INR", period: new Date("2026-08-01T00:00:00.000Z") },
        { id: "keep-currency", userId: "developer-a", currency: "USD", period: new Date("2026-08-01T00:00:00.000Z") },
        { id: "keep-person", userId: "developer-b", currency: "INR", period: new Date("2026-08-01T00:00:00.000Z") },
      ],
      [
        { userId: "developer-a", currency: "USD", workDate: new Date("2026-08-18T00:00:00.000Z") },
        { userId: "developer-b", currency: "INR", workDate: new Date("2026-08-20T00:00:00.000Z") },
      ],
    );

    expect(orphaned).toEqual(["remove"]);
  });

  it("treats a payout in a different calendar month as unrelated", () => {
    const orphaned = orphanedDeliveryEarningInvoiceIds(
      [{ id: "august", userId: "developer-a", currency: "INR", period: new Date("2026-08-01T00:00:00.000Z") }],
      [{ userId: "developer-a", currency: "INR", workDate: new Date("2026-09-01T00:00:00.000Z") }],
    );

    expect(orphaned).toEqual(["august"]);
  });
});
