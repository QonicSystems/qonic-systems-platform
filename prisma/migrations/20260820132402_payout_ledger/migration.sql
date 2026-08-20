-- CreateEnum
CREATE TYPE "PayoutCategory" AS ENUM ('ACTUAL_PAYOUT', 'BILLED_TO_COMPANY');

-- AlterTable
ALTER TABLE "Candidate" ALTER COLUMN "benchStatus" SET DEFAULT 'Available / On Bench';

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "PayoutLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "category" "PayoutCategory" NOT NULL,
    "overrideCategory" "PayoutCategory",
    "overriddenById" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "overrideNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceDeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutLedgerEntry_userId_workDate_idx" ON "PayoutLedgerEntry"("userId", "workDate");

-- CreateIndex
CREATE INDEX "PayoutLedgerEntry_projectId_idx" ON "PayoutLedgerEntry"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutLedgerEntry_userId_projectId_workDate_key" ON "PayoutLedgerEntry"("userId", "projectId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceDeal_userId_projectId_key" ON "ResourceDeal"("userId", "projectId");

-- CreateIndex
CREATE INDEX "Candidate_benchStatus_idx" ON "Candidate"("benchStatus");

-- AddForeignKey
ALTER TABLE "PayoutLedgerEntry" ADD CONSTRAINT "PayoutLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutLedgerEntry" ADD CONSTRAINT "PayoutLedgerEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutLedgerEntry" ADD CONSTRAINT "PayoutLedgerEntry_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutLedgerEntry" ADD CONSTRAINT "PayoutLedgerEntry_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceDeal" ADD CONSTRAINT "ResourceDeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceDeal" ADD CONSTRAINT "ResourceDeal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
