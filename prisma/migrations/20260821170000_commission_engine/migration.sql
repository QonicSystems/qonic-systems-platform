-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('C2C', 'W2');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'WFO');

-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "workMode" "WorkMode",
ADD COLUMN     "commissionPercent" DOUBLE PRECISION,
ADD COLUMN     "commissionAmount" INTEGER;

-- CreateTable
CREATE TABLE "CommissionRate" (
    "id" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "workMode" "WorkMode",
    "percent" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRate_employmentType_workMode_key" ON "CommissionRate"("employmentType", "workMode");

-- Seed the stated defaults once: C2C 20%, W2 tiered by work mode. Editing
-- these afterward only affects new placements — see Placement.commissionPercent.
INSERT INTO "CommissionRate" ("id", "employmentType", "workMode", "percent", "updatedAt") VALUES
    (gen_random_uuid()::text, 'C2C', NULL, 20, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'W2', 'REMOTE', 15, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'W2', 'HYBRID', 20, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'W2', 'WFO', 25, CURRENT_TIMESTAMP);
