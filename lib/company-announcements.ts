import { ROLE } from "@/lib/auth/roles";
import type { Prisma } from "@/lib/generated/prisma/client";

export const COMPANY_ANNOUNCEMENT_LIMITS = {
  title: 140,
  message: 5_000,
} as const;

export type CompanyAnnouncementInput = {
  title: string;
  message: string;
};

export type CompanyAnnouncementErrors = Partial<Record<keyof CompanyAnnouncementInput, string>>;
export type CompanyAnnouncementStatus = "RELEASED" | "REVOKED";

type AnnouncementPublisherRole = {
  key: string;
  isSuperAdmin: boolean;
};

export type CompanyAnnouncementAudienceUser = {
  status: string;
  role: { key: string; viaCandidatePool: boolean };
  /** Any Candidate link means the account originated in Candidate Pool. */
  linkedCandidateId: string | null;
};

/**
 * Mandatory company announcements are for active People accounts only. The
 * CEO releases the message and therefore never receives it; Candidate Pool
 * users (Developers and any legacy Global Candidate account) are also outside
 * this People-only audience.
 */
export function isCompanyAnnouncementAudience(user: CompanyAnnouncementAudienceUser): boolean {
  return user.status === "ACTIVE"
    && user.role.key !== ROLE.CEO
    && !user.role.viaCandidatePool
    && user.linkedCandidateId === null;
}

/** Prisma form of the exact same eligibility policy, used for recipient snapshots. */
export const companyAnnouncementAudienceWhere = {
  status: "ACTIVE",
  role: { key: { not: ROLE.CEO }, viaCandidatePool: false },
  linkedCandidate: { is: null },
} satisfies Prisma.UserWhereInput;

/** A read announcement can be removed; a live unread one must be revoked instead. */
export function mayDeleteCompanyAnnouncement(announcement: {
  status: CompanyAnnouncementStatus;
  recipientCount: number;
  acknowledgedCount: number;
}): boolean {
  return announcement.status === "RELEASED" && announcement.acknowledgedCount >= announcement.recipientCount;
}

/**
 * Publishing is intentionally not delegated through the general permission
 * matrix. The capability is shown there for governance, but the final check is
 * always the one, current CEO account — never a Co-Founder or a custom role.
 */
export function mayPublishCompanyAnnouncements(role: AnnouncementPublisherRole): boolean {
  return role.key === ROLE.CEO && role.isSuperAdmin;
}

/** Validate and normalise the two pieces of CEO-authored announcement text. */
export function parseCompanyAnnouncement(input: unknown): { data?: CompanyAnnouncementInput; errors: CompanyAnnouncementErrors } {
  const raw = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
  const title = String(raw.title ?? "").trim().slice(0, COMPANY_ANNOUNCEMENT_LIMITS.title);
  const message = String(raw.message ?? "").trim().slice(0, COMPANY_ANNOUNCEMENT_LIMITS.message);
  const errors: CompanyAnnouncementErrors = {};

  if (title.length < 2) errors.title = "Enter a short announcement title.";
  if (message.length < 2) errors.message = "Enter the message everyone needs to read.";

  return Object.keys(errors).length > 0 ? { errors } : { data: { title, message }, errors };
}
