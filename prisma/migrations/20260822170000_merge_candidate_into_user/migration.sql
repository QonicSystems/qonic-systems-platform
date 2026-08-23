-- Merge Candidate into User: one row per person, always.
-- See prisma/schema.prisma's User model comment for why (candidate fields
-- live on User behind a reserved, inert "candidate" role) and
-- lib/auth/roles.ts / lib/auth/password.ts for the mechanism.

BEGIN;

-- 1. Reserved system role for pure candidates (no login, no permissions).
--    Also seeded idempotently by prisma/seed.ts; inserted here too so the
--    data move below always has a roleId to reference, regardless of
--    migrate/seed ordering in any environment.
INSERT INTO "Role" (id, key, label, description, "isSuperAdmin", "isSystem", rank, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'candidate', 'Candidate (no login)',
       'Recruitment candidate with no account — set automatically, never assignable by hand. Promoted to Employee (Dev) when hired.',
       false, true, 1000, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE key = 'candidate');

-- 2. Add the merged candidate fields to User (all nullable/defaulted; existing rows need no backfill).
ALTER TABLE "User"
  ADD COLUMN "ssn" TEXT,
  ADD COLUMN "visaType" TEXT,
  ADD COLUMN "visaStatus" TEXT,
  ADD COLUMN "visaExpiry" TIMESTAMP(3),
  ADD COLUMN "commissionPaid" INTEGER,
  ADD COLUMN "benchStatus" TEXT DEFAULT 'Available / On Bench',
  ADD COLUMN "resumeUrl" TEXT,
  ADD COLUMN "linkedinUrl" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "headline" TEXT,
  ADD COLUMN "skills" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "currentSalary" INTEGER,
  ADD COLUMN "expectedSalary" INTEGER,
  ADD COLUMN "noticePeriod" TEXT,
  ADD COLUMN "consentAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "User_benchStatus_idx" ON "User"("benchStatus");
CREATE INDEX "User_source_idx" ON "User"("source");

-- 3a. Candidates already linked to a User (linkedUserId set): merge their
--     candidate-only fields onto the existing User row instead of inserting
--     a new one, then re-point their Application/CandidateProfile rows at
--     that User.id before dropping the old Candidate row.
UPDATE "User" u
SET
  "ssn" = c.ssn, "visaType" = c."visaType", "visaStatus" = c."visaStatus", "visaExpiry" = c."visaExpiry",
  "commissionPaid" = c."commissionPaid", "benchStatus" = c."benchStatus", "resumeUrl" = c."resumeUrl",
  "linkedinUrl" = c."linkedinUrl", "location" = c.location, "headline" = c.headline, "skills" = c.skills,
  "source" = c.source, "currentSalary" = c."currentSalary", "expectedSalary" = c."expectedSalary",
  "noticePeriod" = c."noticePeriod", "consentAt" = c."consentAt", "archivedAt" = c."archivedAt"
FROM "Candidate" c
WHERE c."linkedUserId" = u.id;

UPDATE "Application" a
SET "candidateId" = c."linkedUserId"
FROM "Candidate" c
WHERE a."candidateId" = c.id AND c."linkedUserId" IS NOT NULL;

UPDATE "CandidateProfile" p
SET "candidateId" = c."linkedUserId"
FROM "Candidate" c
WHERE p."candidateId" = c.id AND c."linkedUserId" IS NOT NULL;

DELETE FROM "Candidate" WHERE "linkedUserId" IS NOT NULL;

-- 3b. Every remaining Candidate (never linked to a User) becomes a brand-new
--     User row, reusing the same id — so any Application/CandidateProfile FK
--     pointing at it needs no remapping at all. Sentinel passwordHash + the
--     reserved "candidate" role mean this row can never authenticate or hold
--     a permission (see CANDIDATE_SENTINEL_PASSWORD_HASH).
INSERT INTO "User" (
  id, email, "passwordHash", name, phone, status, "roleId",
  "createdAt", "updatedAt", address, "techStack", notes,
  ssn, "visaType", "visaStatus", "visaExpiry", "commissionPaid", "benchStatus",
  "resumeUrl", "linkedinUrl", location, headline, skills, source,
  "currentSalary", "expectedSalary", "noticePeriod", "consentAt", "archivedAt"
)
SELECT
  c.id, c.email, 'CANDIDATE_NO_LOGIN_YET', c.name, c.phone,
  CASE c.status WHEN 'ARCHIVED' THEN 'ARCHIVED'::"UserStatus" ELSE 'ACTIVE'::"UserStatus" END,
  (SELECT id FROM "Role" WHERE key = 'candidate'),
  c."createdAt", c."updatedAt", c.address, c."techStack", c.notes,
  c.ssn, c."visaType", c."visaStatus", c."visaExpiry", c."commissionPaid", c."benchStatus",
  c."resumeUrl", c."linkedinUrl", c.location, c.headline, c.skills, c.source,
  c."currentSalary", c."expectedSalary", c."noticePeriod", c."consentAt", c."archivedAt"
FROM "Candidate" c;

-- 4. Re-point Application/CandidateProfile FKs at User instead of Candidate.
ALTER TABLE "Application" DROP CONSTRAINT "Application_candidateId_fkey";
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "CandidateProfile" DROP CONSTRAINT "CandidateProfile_candidateId_fkey";
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- 5. Drop the old table and its now-unused enum.
DROP TABLE "Candidate";
DROP TYPE "CandidateStatus";

COMMIT;
