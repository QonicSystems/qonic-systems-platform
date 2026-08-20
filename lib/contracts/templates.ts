/**
 * Letter templates.
 *
 * Documents are rendered on demand, so a template's WORDING must never be edited
 * in place once letters have been issued against it — that would retroactively
 * change signed paperwork. Ship a revision as a new key (`…-v2`) and leave the
 * old entry in place so historic letters keep rendering as they were issued.
 */
export type TemplateField = keyof import("@/lib/contracts/payload").ContractPayload;

export type LetterTemplate = {
  key: string;
  label: string;
  /** Heading printed on the document. */
  title: string;
  description: string;
  /** Opening paragraph. `{first}` is replaced with the recipient's first name. */
  intro: string;
  /** Closing paragraph above the signature block. */
  closing: string;
  /** Payload fields this letter actually prints, in order. */
  fields: ReadonlyArray<TemplateField>;
  /** Whether the recipient is asked to acknowledge in the portal. */
  requiresAcknowledgement: boolean;
};

const EMPLOYMENT_FIELDS: ReadonlyArray<TemplateField> = [
  "jobTitle", "employmentType", "startDate", "annualSalary", "location", "reportingTo", "noticePeriod",
];

// Same field set, but monthlyCompensation instead of annualSalary — the
// figure per-day payout is now calculated from (see lib/delivery/payout.ts).
// A new key, not an edit to EMPLOYMENT_FIELDS/standard-employment-v1: that
// template has already been used to issue real letters, and its wording
// (including which fields it prints) must never change under those letters —
// see the file-level comment above.
const EMPLOYMENT_FIELDS_V2: ReadonlyArray<TemplateField> = [
  "jobTitle", "employmentType", "startDate", "monthlyCompensation", "location", "reportingTo", "noticePeriod",
];

export const LETTER_TEMPLATES: ReadonlyArray<LetterTemplate> = [
  {
    key: "standard-employment-v1",
    label: "Employment Contract (Legacy)",
    title: "Contract of Employment",
    description: "Legacy — annual compensation. Superseded by the monthly-compensation version below for new letters.",
    intro: "Dear {first}, we are delighted to confirm your engagement with QONIC Systems Platform. This letter sets out the principal terms of your contract. Please review it carefully and confirm your acceptance in the staff portal.",
    closing: "Acknowledging this letter in the QONIC staff portal constitutes your acceptance of the terms above. This document supersedes any prior representations relating to the role.",
    fields: EMPLOYMENT_FIELDS,
    requiresAcknowledgement: true,
  },
  {
    key: "standard-employment-v2",
    label: "Employment Contract",
    title: "Contract of Employment",
    description: "The standard contract of employment for full-time and part-time developer engagements.",
    intro: "Dear {first}, we are delighted to confirm your engagement with QONIC Systems Platform. This letter sets out the principal terms of your contract. Please review it carefully and confirm your acceptance in the staff portal.",
    closing: "Acknowledging this letter in the QONIC staff portal constitutes your acceptance of the terms above. This document supersedes any prior representations relating to the role.",
    fields: EMPLOYMENT_FIELDS_V2,
    requiresAcknowledgement: true,
  },
  {
    key: "consulting-services-v1",
    label: "Consulting Services Agreement (Legacy)",
    title: "Consulting Agreement",
    description: "Legacy — annual compensation. Superseded by the monthly-compensation version below for new letters.",
    intro: "Dear {first}, this agreement confirms the terms of your consulting engagement with QONIC Systems Platform for client delivery.",
    closing: "Acknowledging this agreement in the QONIC portal confirms your acceptance of the project delivery terms.",
    fields: EMPLOYMENT_FIELDS,
    requiresAcknowledgement: true,
  },
  {
    key: "consulting-services-v2",
    label: "Consulting Services Agreement",
    title: "Consulting Agreement",
    description: "Independent contractor and consulting agreement for project execution.",
    intro: "Dear {first}, this agreement confirms the terms of your consulting engagement with QONIC Systems Platform for client delivery.",
    closing: "Acknowledging this agreement in the QONIC portal confirms your acceptance of the project delivery terms.",
    fields: EMPLOYMENT_FIELDS_V2,
    requiresAcknowledgement: true,
  },
  {
    key: "nda-v1",
    label: "Confidentiality & IP Undertaking",
    title: "Confidentiality & Non-Disclosure Agreement",
    description: "Standalone confidentiality and intellectual property undertaking.",
    intro: "Dear {first}, as part of your engagement with QONIC Systems you will have access to confidential proprietary information and client source code. This undertaking records the obligations that apply to that access.",
    closing: "You agree to keep all confidential information secret both during and after your engagement, to use it solely for the performance of your duties, and to return or destroy it on request.",
    fields: ["jobTitle", "startDate", "location"],
    requiresAcknowledgement: true,
  },
  // Legacy / Historic templates for rendering past letters
  {
    key: "offer-v1",
    label: "Offer Letter (Legacy)",
    title: "Letter of Offer",
    description: "Legacy offer letter.",
    intro: "Dear {first}, following our recent conversations we are pleased to offer you the position described below at QONIC consulting.",
    closing: "This offer is made subject to satisfactory references.",
    fields: EMPLOYMENT_FIELDS,
    requiresAcknowledgement: true,
  },
  {
    key: "increment-v1",
    label: "Increment Letter (Legacy)",
    title: "Salary Revision",
    description: "Legacy salary increment letter.",
    intro: "Dear {first}, in recognition of your contribution we confirm the revision to your terms.",
    closing: "All other terms remain unchanged.",
    fields: ["jobTitle", "startDate", "annualSalary", "reportingTo"],
    requiresAcknowledgement: true,
  },
  {
    key: "experience-v1",
    label: "Experience Letter (Legacy)",
    title: "Certificate of Experience",
    description: "Legacy experience certificate.",
    intro: "To whom it may concern — this is to certify that {first} was employed by QONIC consulting.",
    closing: "This certificate is issued at the employee's request.",
    fields: ["jobTitle", "employmentType", "startDate", "location"],
    requiresAcknowledgement: false,
  },
  {
    key: "relieving-v1",
    label: "Relieving Letter (Legacy)",
    title: "Relieving Letter",
    description: "Legacy relieving letter.",
    intro: "Dear {first}, this letter confirms that you have been relieved of your duties.",
    closing: "We thank you for your service.",
    fields: ["jobTitle", "startDate", "location", "noticePeriod"],
    requiresAcknowledgement: false,
  },
];

export const ACTIVE_LETTER_TEMPLATES: ReadonlyArray<LetterTemplate> = LETTER_TEMPLATES.filter(
  (t) => ["standard-employment-v2", "consulting-services-v2", "nda-v1"].includes(t.key)
);

export const DEFAULT_TEMPLATE_KEY = "standard-employment-v2";

export function findTemplate(key: string): LetterTemplate {
  // Falling back keeps an unknown key rendering rather than 500ing, which matters
  // because letters issued under a retired key must stay readable.
  return LETTER_TEMPLATES.find((template) => template.key === key) ?? LETTER_TEMPLATES[0];
}

export const FIELD_LABELS: Record<TemplateField, string> = {
  jobTitle: "Position",
  employmentType: "Employment type",
  startDate: "Effective date",
  endDate: "Duration / End Date",
  annualSalary: "Annual salary",
  monthlyCompensation: "Monthly compensation",
  currency: "Currency",
  location: "Location",
  reportingTo: "Reporting to",
  noticePeriod: "Notice period",
  additionalTerms: "Additional terms",
};
