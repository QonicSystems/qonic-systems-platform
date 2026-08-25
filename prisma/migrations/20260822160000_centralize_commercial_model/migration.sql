-- CreateEnum
CREATE TYPE "CompanyExpenseCategory" AS ENUM ('CEO_SALARY', 'COFOUNDER_SALARY', 'MISC_COMPANY_EXPENSE', 'OTHER_OPERATING_EXPENSE');

-- AlterEnum
ALTER TYPE "EmploymentType" ADD VALUE 'FULL_TIME';

-- DropTable (orphaned rate-history tables — superseded by frozen figures on
-- Placement/PayoutLedgerEntry; the retroactive-rate-drift problem these
-- would solve does not otherwise exist in this app. Zero rows, verified.)
DROP TABLE IF EXISTS "AssignmentRate";
DROP TABLE IF EXISTS "DealRate";

-- Undo the short-lived CandidateProfile split. The final recruitment model
-- keeps one Candidate record with its legal/profile data and later adds a
-- separate CandidateMarketingProfile only for multi-technology marketing.
--
-- The original migration dropped CandidateProfile fields without first putting
-- them back on Candidate, while the next migration attempted a separate
-- Candidate → User merge that was immediately contradicted by later migrations
-- still referencing Candidate. Restore the actual final model here, preserving
-- every supported field and each application's candidate relationship.
ALTER TABLE "Candidate"
  ADD COLUMN IF NOT EXISTS "ssn" TEXT,
  ADD COLUMN IF NOT EXISTS "visaType" TEXT,
  ADD COLUMN IF NOT EXISTS "visaStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "visaExpiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "commissionPaid" INTEGER,
  ADD COLUMN IF NOT EXISTS "techStack" TEXT,
  ADD COLUMN IF NOT EXISTS "benchStatus" TEXT DEFAULT 'Available / On Bench',
  ADD COLUMN IF NOT EXISTS "resumeUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "location" TEXT,
  ADD COLUMN IF NOT EXISTS "headline" TEXT,
  ADD COLUMN IF NOT EXISTS "skills" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'Direct',
  ADD COLUMN IF NOT EXISTS "currentSalary" INTEGER,
  ADD COLUMN IF NOT EXISTS "expectedSalary" INTEGER,
  ADD COLUMN IF NOT EXISTS "noticePeriod" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- CandidateProfile was created as one profile per Candidate. DISTINCT ON is a
-- defensive choice for legacy data with duplicates: retain the earliest profile
-- rather than nondeterministically mixing fields from different records.
WITH primary_profile AS (
  SELECT DISTINCT ON ("candidateId") *
  FROM "CandidateProfile"
  ORDER BY "candidateId", "createdAt", "id"
)
UPDATE "Candidate" candidate
SET
  "ssn" = profile."ssn",
  "visaType" = profile."visaType",
  "visaStatus" = profile."visaStatus",
  "visaExpiry" = profile."visaExpiry",
  "address" = profile."address",
  "commissionPaid" = profile."commissionPaid",
  "techStack" = profile."techStack",
  "benchStatus" = COALESCE(profile."benchStatus", candidate."benchStatus"),
  "resumeUrl" = profile."resumeUrl",
  "location" = profile."location",
  "headline" = profile."headline",
  "skills" = profile."skills",
  "source" = COALESCE(profile."source", candidate."source"),
  "currentSalary" = profile."currentSalary",
  "expectedSalary" = profile."expectedSalary",
  "noticePeriod" = profile."noticePeriod",
  "notes" = profile."notes"
FROM primary_profile profile
WHERE candidate.id = profile."candidateId";

UPDATE "Candidate" SET "source" = 'Direct' WHERE "source" IS NULL;
ALTER TABLE "Candidate" ALTER COLUMN "source" SET DEFAULT 'Direct';
ALTER TABLE "Candidate" ALTER COLUMN "source" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Candidate_benchStatus_idx" ON "Candidate"("benchStatus");

ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "candidateId" TEXT;
UPDATE "Application" application
SET "candidateId" = profile."candidateId"
FROM "CandidateProfile" profile
WHERE application."candidateProfileId" = profile.id;
ALTER TABLE "Application" ALTER COLUMN "candidateId" SET NOT NULL;
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS "Application_candidateProfileId_fkey";
DROP INDEX IF EXISTS "Application_jobId_candidateProfileId_key";
ALTER TABLE "Application" DROP COLUMN IF EXISTS "candidateProfileId";
CREATE UNIQUE INDEX IF NOT EXISTS "Application_jobId_candidateId_key" ON "Application"("jobId", "candidateId");
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "CandidateProfile";

-- isDirect/appliedAt were unrelated, unwired WIP columns in one branch of the
-- application. They do not exist in the canonical schema but may exist in an
-- old database, so remove them only when present.
ALTER TABLE "Application"
  DROP COLUMN IF EXISTS "isDirect",
  DROP COLUMN IF EXISTS "appliedAt";

-- AlterTable ProjectAssignment: replace free-text workLocation/engagementModel
-- with the canonical WorkMode/EmploymentType enums (one vocabulary used
-- everywhere). devMonthlyRate/candidateCommissionPercent/vendorCutPercent
-- already exist on this table from prior work — only the enum-typed fields,
-- the placement linkage, and isActive are genuinely new here. Zero
-- non-default rows on the columns being dropped, verified.
ALTER TABLE "ProjectAssignment"
  DROP COLUMN "workLocation",
  DROP COLUMN "engagementModel",
  ADD COLUMN "placementId" TEXT,
  ADD COLUMN "employmentType" "EmploymentType",
  ADD COLUMN "workMode" "WorkMode",
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- candidateCommissionPercent/vendorCutPercent were NOT NULL DEFAULT from
-- prior work — null must mean "no override, fall back to CommissionRate
-- config," not "explicitly zero/twenty," so drop the NOT NULL/DEFAULT and
-- clear the only existing row, which was still at the unconfigured default.
ALTER TABLE "ProjectAssignment" ALTER COLUMN "candidateCommissionPercent" DROP NOT NULL;
ALTER TABLE "ProjectAssignment" ALTER COLUMN "candidateCommissionPercent" DROP DEFAULT;
ALTER TABLE "ProjectAssignment" ALTER COLUMN "vendorCutPercent" DROP NOT NULL;
ALTER TABLE "ProjectAssignment" ALTER COLUMN "vendorCutPercent" DROP DEFAULT;
UPDATE "ProjectAssignment" SET "candidateCommissionPercent" = NULL WHERE "candidateCommissionPercent" = 20.0;
UPDATE "ProjectAssignment" SET "vendorCutPercent" = NULL WHERE "vendorCutPercent" = 0.0;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssignment_placementId_key" ON "ProjectAssignment"("placementId");
CREATE INDEX "ProjectAssignment_employmentType_idx" ON "ProjectAssignment"("employmentType");
CREATE INDEX "ProjectAssignment_workMode_idx" ON "ProjectAssignment"("workMode");
CREATE INDEX "ProjectAssignment_isActive_idx" ON "ProjectAssignment"("isActive");

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Placement: link forward to the Project the hire ends up on —
-- the doc's explicit chain gap (nothing previously connected a Placement to
-- a Project). All other commercial fields already exist on this table.
ALTER TABLE "Placement" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Placement_projectId_idx" ON "Placement"("projectId");
CREATE INDEX "Placement_employmentType_idx" ON "Placement"("employmentType");

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Payment: close the payment-confirmation gap by extending the
-- existing model rather than a parallel table (Payment already has
-- amount/paidOn/reference).
ALTER TABLE "Payment" ADD COLUMN "confirmationSentAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "confirmationRecipient" TEXT;

-- AlterTable CommissionRate: who last changed a global default, for the audit trail.
ALTER TABLE "CommissionRate" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "CommissionRate" ADD CONSTRAINT "CommissionRate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable CompanyExpense: costs that aren't an individual's reimbursement
-- claim (see Expense for that) — projectId null = company-level (CEO/
-- Co-Founder salary, misc operating costs); set = project-level.
CREATE TABLE "CompanyExpense" (
    "id" TEXT NOT NULL,
    "category" "CompanyExpenseCategory" NOT NULL,
    "description" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "incurredOn" DATE NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyExpense_category_idx" ON "CompanyExpense"("category");
CREATE INDEX "CompanyExpense_incurredOn_idx" ON "CompanyExpense"("incurredOn");
CREATE INDEX "CompanyExpense_projectId_idx" ON "CompanyExpense"("projectId");

-- AddForeignKey
ALTER TABLE "CompanyExpense" ADD CONSTRAINT "CompanyExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyExpense" ADD CONSTRAINT "CompanyExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
