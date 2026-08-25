import { describe, expect, it } from "vitest";
import { filterRows } from "@/lib/ui/filter";

type Person = { name: string; email: string; role: string; note?: string | null };

const people: Person[] = [
  { name: "Avinash Singh", email: "founder@qonic.com", role: "CEO & Founder" },
  { name: "Anusha Kherwal", email: "anusha@qonic.com", role: "Co-Founder" },
  { name: "Neha Kulkarni", email: "neha@qonic.com", role: "HR", note: null },
];

const fields = (person: Person) => [person.name, person.email, person.role, person.note];

describe("table filtering", () => {
  it("returns every row for an empty or whitespace query", () => {
    expect(filterRows(people, fields, "")).toHaveLength(3);
    expect(filterRows(people, fields, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively", () => {
    expect(filterRows(people, fields, "AVINASH")).toHaveLength(1);
    expect(filterRows(people, fields, "avinash")).toHaveLength(1);
  });

  it("matches on any of the supplied fields, not just the first", () => {
    expect(filterRows(people, fields, "neha@qonic.com")[0].name).toBe("Neha Kulkarni");
    expect(filterRows(people, fields, "Co-Founder")[0].name).toBe("Anusha Kherwal");
  });

  it("matches a substring anywhere in the value", () => {
    expect(filterRows(people, fields, "kherwal")).toHaveLength(1);
    expect(filterRows(people, fields, "qonic.com")).toHaveLength(3);
  });

  it("ignores null and undefined fields rather than matching the string 'null'", () => {
    // Joining without filtering would put "null" in the haystack and make a
    // search for "null" return rows that have no note at all.
    expect(filterRows(people, fields, "null")).toHaveLength(0);
  });

  it("returns nothing when there is no match", () => {
    expect(filterRows(people, fields, "nobody")).toHaveLength(0);
  });

  it("trims the query so a stray space does not hide every row", () => {
    expect(filterRows(people, fields, "  Neha  ")).toHaveLength(1);
  });
});
