/**
 * Human-facing reference numbers: invoices, credit notes, contract letters and
 * job requisitions.
 *
 * The format is `<BRAND>-<KIND>-<YEAR>-<NNNN>`, e.g. QNC-INV-2026-0007.
 *
 * The brand prefix lived as a hardcoded string in four separate route files,
 * each with its own copy of the same counter. It is defined once here so a
 * rename is a one-line change and cannot be applied to three places out of four.
 */
export const REFERENCE_PREFIX = "QNC";

/**
 * Prefixes this application has issued references under before.
 *
 * These are NOT rewritten — an invoice number a client has already paid against,
 * or a contract letter someone has signed, is that document's identity. They are
 * listed so the yearly counter can see them: without this, renaming the brand
 * mid-year would restart numbering at 0001 and produce a second "first invoice"
 * for the same year.
 */
export const LEGACY_REFERENCE_PREFIXES = ["AVX"] as const;

/** The document kinds that carry a reference. */
export type ReferenceKind = "INV" | "CN" | "CL" | "JOB";

/** The prefix new references are issued under, e.g. `QNC-INV-2026-`. */
export function referencePrefix(kind: ReferenceKind, year: number): string {
  return `${REFERENCE_PREFIX}-${kind}-${year}-`;
}

/** Every prefix a record of this kind and year could carry, current one first. */
export function referencePrefixes(kind: ReferenceKind, year: number): string[] {
  return [REFERENCE_PREFIX, ...LEGACY_REFERENCE_PREFIXES].map((brand) => `${brand}-${kind}-${year}-`);
}

/**
 * The next reference, continuing from the highest sequence already issued for
 * that kind and year under ANY known prefix.
 *
 * `existing` is the caller's query result rather than a lookup done here,
 * because each kind lives in a different table under a different column name.
 */
export function nextReferenceFrom(
  existing: ReadonlyArray<string>,
  kind: ReferenceKind,
  year: number
): string {
  const prefixes = referencePrefixes(kind, year);
  let highest = 0;

  for (const value of existing) {
    const prefix = prefixes.find((candidate) => value.startsWith(candidate));
    if (!prefix) continue;
    // A malformed tail must not poison the sequence into NaN and reset it to 1.
    const sequence = Number.parseInt(value.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > highest) highest = sequence;
  }

  return `${referencePrefix(kind, year)}${String(highest + 1).padStart(4, "0")}`;
}

/** Prisma `OR` fragment matching every prefix, for the given column. */
export function referenceWhere(column: "number" | "reference", kind: ReferenceKind, year: number) {
  return referencePrefixes(kind, year).map((prefix) => ({ [column]: { startsWith: prefix } }));
}
