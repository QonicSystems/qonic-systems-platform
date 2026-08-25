import { describe, expect, it } from "vitest";
import { COMPANY_ANNOUNCEMENT_LIMITS, isCompanyAnnouncementAudience, mayDeleteCompanyAnnouncement, mayPublishCompanyAnnouncements, parseCompanyAnnouncement } from "@/lib/company-announcements";

describe("company announcement input", () => {
  it("trims valid CEO-authored title and message text", () => {
    expect(parseCompanyAnnouncement({ title: "  Platform maintenance  ", message: "  The portal will be unavailable at 18:00 UTC.  " })).toEqual({
      data: { title: "Platform maintenance", message: "The portal will be unavailable at 18:00 UTC." },
      errors: {},
    });
  });

  it("requires both a title and message instead of releasing blank content", () => {
    expect(parseCompanyAnnouncement({ title: " ", message: "" }).errors).toEqual({
      title: "Enter a short announcement title.",
      message: "Enter the message everyone needs to read.",
    });
  });

  it("caps user-authored text to the documented storage limits", () => {
    const parsed = parseCompanyAnnouncement({
      title: "t".repeat(COMPANY_ANNOUNCEMENT_LIMITS.title + 20),
      message: "m".repeat(COMPANY_ANNOUNCEMENT_LIMITS.message + 20),
    });
    expect(parsed.data?.title).toHaveLength(COMPANY_ANNOUNCEMENT_LIMITS.title);
    expect(parsed.data?.message).toHaveLength(COMPANY_ANNOUNCEMENT_LIMITS.message);
  });
});

describe("company announcement publishing authority", () => {
  it("allows only the current CEO role, never Co-Founder or a custom super-admin-like role", () => {
    expect(mayPublishCompanyAnnouncements({ key: "ceo", isSuperAdmin: true })).toBe(true);
    expect(mayPublishCompanyAnnouncements({ key: "co_founder", isSuperAdmin: false })).toBe(false);
    expect(mayPublishCompanyAnnouncements({ key: "ceo", isSuperAdmin: false })).toBe(false);
    expect(mayPublishCompanyAnnouncements({ key: "executive", isSuperAdmin: true })).toBe(false);
  });
});

describe("company announcement audience", () => {
  const person = { status: "ACTIVE", role: { key: "operations", viaCandidatePool: false }, linkedCandidateId: null };

  it("includes only an active account added through People", () => {
    expect(isCompanyAnnouncementAudience(person)).toBe(true);
  });

  it.each([
    [{ ...person, role: { key: "ceo", viaCandidatePool: false } }, "the CEO publishes but does not receive it"],
    [{ ...person, role: { key: "developer", viaCandidatePool: true } }, "a Developer Candidate-Pool account"],
    [{ ...person, linkedCandidateId: "candidate-global" }, "a legacy linked Candidate account"],
    [{ ...person, status: "ARCHIVED" }, "an archived account"],
  ])("excludes %s", (user, _reason) => {
    expect(isCompanyAnnouncementAudience(user)).toBe(false);
  });
});

describe("company announcement closing controls", () => {
  it("allows deletion only after a live announcement is fully acknowledged", () => {
    expect(mayDeleteCompanyAnnouncement({ status: "RELEASED", recipientCount: 3, acknowledgedCount: 3 })).toBe(true);
    expect(mayDeleteCompanyAnnouncement({ status: "RELEASED", recipientCount: 3, acknowledgedCount: 2 })).toBe(false);
    expect(mayDeleteCompanyAnnouncement({ status: "REVOKED", recipientCount: 3, acknowledgedCount: 3 })).toBe(false);
  });
});
