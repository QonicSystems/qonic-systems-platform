-- CreateEnum
CREATE TYPE "CompanyExpenseCategory" AS ENUM ('CEO_SALARY', 'COFOUNDER_SALARY', 'MISC_COMPANY_EXPENSE', 'OTHER_OPERATING_EXPENSE');

-- AlterEnum
ALTER TYPE "EmploymentType" ADD VALUE 'FULL_TIME';

-- DropTable (orphaned rate-history tables — superseded by frozen figures on
-- Placement/PayoutLedgerEntry; the retroactive-rate-drift problem these
-- would solve does not otherwise exist in this app. Zero rows, verified.)
DROP TABLE "AssignmentRate";
DROP TABLE "DealRate";

-- AlterTable CandidateProfile: trim to only what genuinely varies per
-- technology. Identity/legal fields stay on Candidate itself. Zero rows,
-- verified — nothing to migrate.
ALTER TABLE "CandidateProfile"
  DROP COLUMN "ssn",
  DROP COLUMN "visaType",
  DROP COLUMN "visaStatus",
  DROP COLUMN "visaExpiry",
  DROP COLUMN "address",
  DROP COLUMN "commissionPaid",
  DROP COLUMN "techStack",
  DROP COLUMN "location",
  DROP COLUMN "currentSalary",
  DROP COLUMN "expectedSalary",
  DROP COLUMN "noticePeriod";

-- AlterTable Application: candidateProfileId is descriptive metadata, not a
-- second identity/dedup key — the real dedup rule stays candidateId+jobId
-- (restored in the prior migration). isDirect/appliedAt were unrelated,
-- unwired WIP. Zero non-default rows, verified.
DROP INDEX "Application_jobId_candidateProfileId_key";
ALTER TABLE "Application"
  DROP COLUMN "isDirect",
  DROP COLUMN "appliedAt";

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
