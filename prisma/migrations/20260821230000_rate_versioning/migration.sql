-- CreateTable
CREATE TABLE "AssignmentRate" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "rate" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentRate_assignmentId_effectiveFrom_idx" ON "AssignmentRate"("assignmentId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "AssignmentRate" ADD CONSTRAINT "AssignmentRate_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProjectAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every assignment with a rate on record becomes one still-open
-- period. There's no record of when that CURRENT rate value first applied
-- (it was always just overwritten in place), so the best honest starting
-- point is the same "when did this person actually begin" signal already
-- established elsewhere in this app — startedOn, falling back to the row's
-- own createdAt exactly like every other consumer of that fallback chain.
INSERT INTO "AssignmentRate" ("id", "assignmentId", "rate", "effectiveFrom", "effectiveTo")
SELECT gen_random_uuid()::text, "id", "rate", COALESCE("startedOn", "createdAt"::date), NULL
FROM "ProjectAssignment"
WHERE "rate" IS NOT NULL;

-- AlterTable
ALTER TABLE "ProjectAssignment" DROP COLUMN "rate";

-- CreateTable
CREATE TABLE "DealRate" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealRate_dealId_effectiveFrom_idx" ON "DealRate"("dealId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "DealRate" ADD CONSTRAINT "DealRate_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "ResourceDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: unlike AssignmentRate, ResourceDeal already had a real
-- effectiveFrom on each row, so this is an exact carry-over, not a guess.
INSERT INTO "DealRate" ("id", "dealId", "monthlyAmount", "effectiveFrom", "effectiveTo")
SELECT gen_random_uuid()::text, "id", "monthlyAmount", "effectiveFrom", NULL
FROM "ResourceDeal";

-- AlterTable
ALTER TABLE "ResourceDeal" DROP COLUMN "monthlyAmount",
DROP COLUMN "effectiveFrom";
