/**
 * Candidates arrive from several places, and the business only cares about
 * three of them: people we sponsor and place on a visa, developers we sourced
 * ourselves, and everyone who applied directly.
 *
 * `Candidate.source` is a free-text label chosen in the add form (and, for the
 * careers site, written by the public application route), so the grouping lives
 * here rather than being re-derived with string comparisons at each call site.
 */
export const RESOURCE_TYPE = {
  GLOBAL: "GLOBAL",
  EMPLOYEE_DEV: "EMPLOYEE_DEV",
  DIRECT: "DIRECT",
} as const;

export type ResourceType = (typeof RESOURCE_TYPE)[keyof typeof RESOURCE_TYPE];

/** The sources each group is stored as, in normalised form. */
const SOURCES: Record<ResourceType, ReadonlyArray<string>> = {
  GLOBAL: ["global visa resource", "global visa", "global"],
  EMPLOYEE_DEV: ["direct linkedin", "linkedin", "internal connection", "employee dev"],
  DIRECT: ["job application", "careers site", "direct"],
};

/**
 * The same source has been written several ways over time — the add form stores
 * "Global Visa Resource", older tooling stored "GLOBAL_VISA_RESOURCE" — so
 * punctuation, case and separators are flattened before comparing rather than
 * each spelling being listed twice.
 */
function normalise(source: string): string {
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resourceTypeOf(source: string | null | undefined): ResourceType {
  const value = normalise(source ?? "");
  if (SOURCES.GLOBAL.includes(value)) return RESOURCE_TYPE.GLOBAL;
  if (SOURCES.EMPLOYEE_DEV.includes(value)) return RESOURCE_TYPE.EMPLOYEE_DEV;
  // An unrecognised source is a direct applicant rather than an error: the
  // careers site and older records both predate this list.
  return RESOURCE_TYPE.DIRECT;
}

/** Short badge wording for the table. The full `source` stays in the tooltip. */
export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  GLOBAL: "Global Visa",
  EMPLOYEE_DEV: "Developer",
  DIRECT: "Direct Applicant",
};

/** Tailwind classes per group, so the badge reads the same in every table. */
export const RESOURCE_TYPE_CLASS: Record<ResourceType, string> = {
  GLOBAL: "bg-amber-50 text-amber-800 border-amber-300",
  EMPLOYEE_DEV: "bg-blue-50 text-blue-800 border-blue-300",
  DIRECT: "bg-slate-100 text-slate-700 border-slate-300",
};

/** Filter tabs, in the order they appear above the candidate tables. */
export const RESOURCE_TYPE_TABS: ReadonlyArray<{ key: ResourceType | "ALL"; label: string }> = [
  { key: "ALL", label: "All Types" },
  { key: RESOURCE_TYPE.GLOBAL, label: RESOURCE_TYPE_LABEL.GLOBAL },
  { key: RESOURCE_TYPE.EMPLOYEE_DEV, label: RESOURCE_TYPE_LABEL.EMPLOYEE_DEV },
  { key: RESOURCE_TYPE.DIRECT, label: RESOURCE_TYPE_LABEL.DIRECT },
];
