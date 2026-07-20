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

export const LETTER_TEMPLATES: ReadonlyArray<LetterTemplate> = [
  {
    key: "standard-employment-v1",
    label: "Employment Contract",
    title: "Contract of Employment",
    description: "The standard contract of employment for a new or continuing engagement.",
    intro: "Dear {first}, we are delighted to confirm your engagement with Avenstrix Consulting. This letter sets out the principal terms of your employment. Please review it carefully and confirm your acceptance in the staff portal.",
    closing: "Acknowledging this letter in the Avenstrix staff portal constitutes your acceptance of the terms above. This document supersedes any prior representations relating to the role.",
    fields: EMPLOYMENT_FIELDS,
    requiresAcknowledgement: true,
  },
  {
    key: "offer-v1",
    label: "Offer Letter",
    title: "Letter of Offer",
    description: "Extends a formal offer before the contract of employment is issued.",
    intro: "Dear {first}, following our recent conversations we are pleased to offer you the position described below at Avenstrix Consulting. We were impressed by your experience and would be glad to welcome you to the team.",
    closing: "This offer is made subject to satisfactory references and any pre-employment checks required for the role. Please confirm your acceptance in the staff portal, after which a full contract of employment will follow.",
    fields: EMPLOYMENT_FIELDS,
    requiresAcknowledgement: true,
  },
  {
    key: "increment-v1",
    label: "Increment Letter",
    title: "Salary Revision",
    description: "Confirms a revision to salary, title, or both.",
    intro: "Dear {first}, in recognition of your contribution to Avenstrix Consulting we are pleased to confirm the following revision to your terms, effective from the date shown below.",
    closing: "All other terms of your employment remain unchanged. Please acknowledge this letter in the staff portal.",
    fields: ["jobTitle", "startDate", "annualSalary", "reportingTo"],
    requiresAcknowledgement: true,
  },
  {
    key: "experience-v1",
    label: "Experience Letter",
    title: "Certificate of Experience",
    description: "Confirms a period of service. Issued on request, usually after leaving.",
    intro: "To whom it may concern — this is to certify that {first} was employed by Avenstrix Consulting in the capacity set out below, and that the details recorded here are accurate according to our records.",
    closing: "We confirm that their conduct and performance during this period were satisfactory. This certificate is issued at the employee's request and carries no further obligation on either party.",
    fields: ["jobTitle", "employmentType", "startDate", "location"],
    requiresAcknowledgement: false,
  },
  {
    key: "relieving-v1",
    label: "Relieving Letter",
    title: "Relieving Letter",
    description: "Confirms that an employee has been formally relieved of their duties.",
    intro: "Dear {first}, this letter confirms that you have been relieved of your duties at Avenstrix Consulting with effect from the date shown below, and that you have completed the handover required of you.",
    closing: "We confirm that no dues remain outstanding on either side. We thank you for your service and wish you every success in your next role.",
    fields: ["jobTitle", "startDate", "location", "noticePeriod"],
    requiresAcknowledgement: false,
  },
  {
    key: "nda-v1",
    label: "Confidentiality Undertaking",
    title: "Confidentiality Undertaking",
    description: "A standalone confidentiality agreement covering client and company information.",
    intro: "Dear {first}, as part of your engagement with Avenstrix Consulting you will have access to confidential information belonging to the firm and to its clients. This undertaking records the obligations that apply to that access.",
    closing: "You agree to keep all confidential information secret both during and after your engagement, to use it solely for the performance of your duties, and to return or destroy it on request. Acknowledging this letter in the staff portal records your agreement.",
    fields: ["jobTitle", "startDate", "location"],
    requiresAcknowledgement: true,
  },
];

export const DEFAULT_TEMPLATE_KEY = "standard-employment-v1";

export function findTemplate(key: string): LetterTemplate {
  // Falling back keeps an unknown key rendering rather than 500ing, which matters
  // because letters issued under a retired key must stay readable.
  return LETTER_TEMPLATES.find((template) => template.key === key) ?? LETTER_TEMPLATES[0];
}

export const FIELD_LABELS: Record<TemplateField, string> = {
  jobTitle: "Position",
  employmentType: "Employment type",
  startDate: "Effective date",
  annualSalary: "Annual salary",
  currency: "Currency",
  location: "Location",
  reportingTo: "Reporting to",
  noticePeriod: "Notice period",
  additionalTerms: "Additional terms",
};
