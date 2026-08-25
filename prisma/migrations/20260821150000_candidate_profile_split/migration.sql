-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ssn" TEXT,
    "visaType" TEXT,
    "visaStatus" TEXT,
    "visaExpiry" TIMESTAMP(3),
    "address" TEXT,
    "commissionPaid" INTEGER,
    "techStack" TEXT,
    "benchStatus" TEXT DEFAULT 'Available / On Bench',
    "resumeUrl" TEXT,
    "location" TEXT,
    "headline" TEXT,
    "skills" TEXT,
    "source" TEXT NOT NULL DEFAULT 'Direct',
    "currentSalary" INTEGER,
    "expectedSalary" INTEGER,
    "noticePeriod" TEXT,
    "notes" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- This is the only migration that ever splits Candidate this way: every
-- existing Candidate row becomes exactly one Person (Candidate, now leaner)
-- plus exactly one CandidateProfile carrying everything that used to live on
-- it — a 1:1 backfill, so nothing existing loses any data.
INSERT INTO "CandidateProfile" (
    "id", "candidateId", "label", "ssn", "visaType", "visaStatus", "visaExpiry", "address",
    "commissionPaid", "techStack", "benchStatus", "resumeUrl", "location", "headline", "skills",
    "source", "currentSalary", "expectedSalary", "noticePeriod", "notes", "status", "archivedAt",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text, "id", COALESCE(NULLIF("headline", ''), 'Primary profile'), "ssn", "visaType",
    "visaStatus", "visaExpiry", "address", "commissionPaid", "techStack", "benchStatus", "resumeUrl",
    "location", "headline", "skills", "source", "currentSalary", "expectedSalary", "noticePeriod", "notes",
    "status", "archivedAt", "createdAt", "updatedAt"
FROM "Candidate";

-- AlterTable: Application gets the new FK column, nullable first so it can
-- be backfilled before the NOT NULL constraint is added.
ALTER TABLE "Application" ADD COLUMN     "candidateProfileId" TEXT;

UPDATE "Application" a
   SET "candidateProfileId" = cp.id
  FROM "CandidateProfile" cp
 WHERE cp."candidateId" = a."candidateId";

ALTER TABLE "Application" ALTER COLUMN "candidateProfileId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_candidateId_fkey";

-- DropIndex (old per-candidate uniqueness)
DROP INDEX "Application_jobId_candidateId_key";

-- AlterTable: candidateId is fully superseded by candidateProfileId now.
ALTER TABLE "Application" DROP COLUMN "candidateId";

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_candidateProfileId_key" ON "Application"("jobId", "candidateProfileId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CandidateProfile_candidateId_idx" ON "CandidateProfile"("candidateId");
CREATE INDEX "CandidateProfile_benchStatus_idx" ON "CandidateProfile"("benchStatus");
CREATE INDEX "CandidateProfile_status_idx" ON "CandidateProfile"("status");

-- DropIndex (moved to CandidateProfile above)
DROP INDEX "Candidate_benchStatus_idx";

-- AlterTable: Candidate keeps only person-level identity fields now —
-- everything else was carried into CandidateProfile above.
ALTER TABLE "Candidate"
    DROP COLUMN "ssn",
    DROP COLUMN "visaType",
    DROP COLUMN "visaStatus",
    DROP COLUMN "visaExpiry",
    DROP COLUMN "address",
    DROP COLUMN "commissionPaid",
    DROP COLUMN "techStack",
    DROP COLUMN "benchStatus",
    DROP COLUMN "resumeUrl",
    DROP COLUMN "location",
    DROP COLUMN "headline",
    DROP COLUMN "skills",
    DROP COLUMN "source",
    DROP COLUMN "currentSalary",
    DROP COLUMN "expectedSalary",
    DROP COLUMN "noticePeriod",
    DROP COLUMN "notes";
