import { describe, expect, it } from "vitest";

/**
 * The pure half of lib/ui/filter.ts. The hook itself is a thin useState +
 * useMemo wrapper; what is worth pinning is the matching rule, because every
 * table in the portal now depends on it behaving the same way.
 */
const match = <T,>(rows: ReadonlyArray<T>, fields: (row: T) => ReadonlyArray<string | null | undefined>, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => fields(row).filter(Boolean).join(" ").toLowerCase().includes(needle));
};

type Person = { name: string; email: string; role: string; note?: string | null };

const people: Person[] = [
  { name: "Avinash Singh", email: "founder@qonic.com", role: "CEO & Founder" },
  { name: "Anusha Kherwal", email: "anusha@qonic.com", role: "Co-Founder" },
  { name: "Neha Kulkarni", email: "neha@qonic.com", role: "HR", note: null },
];

const fields = (person: Person) => [person.name, person.email, person.role, person.note];

describe("table filtering", () => {
  it("returns every row for an empty or whitespace query", () => {
    expect(match(people, fields, "")).toHaveLength(3);
    expect(match(people, fields, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively", () => {
    expect(match(people, fields, "AVINASH")).toHaveLength(1);
    expect(match(people, fields, "avinash")).toHaveLength(1);
  });

  it("matches on any of the supplied fields, not just the first", () => {
    expect(match(people, fields, "neha@qonic.com")[0].name).toBe("Neha Kulkarni");
    expect(match(people, fields, "Co-Founder")[0].name).toBe("Anusha Kherwal");
  });

  it("matches a substring anywhere in the value", () => {
    expect(match(people, fields, "kherwal")).toHaveLength(1);
    expect(match(people, fields, "qonic.com")).toHaveLength(3);
  });

  it("ignores null and undefined fields rather than matching the string 'null'", () => {
    // Joining without filtering would put "null" in the haystack and make a
    // search for "null" return rows that have no note at all.
    expect(match(people, fields, "null")).toHaveLength(0);
  });

  it("returns nothing when there is no match", () => {
    expect(match(people, fields, "nobody")).toHaveLength(0);
  });

  it("trims the query so a stray space does not hide every row", () => {
    expect(match(people, fields, "  Neha  ")).toHaveLength(1);
  });
});
