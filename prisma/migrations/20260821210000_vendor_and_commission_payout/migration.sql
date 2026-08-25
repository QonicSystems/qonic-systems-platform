-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "vendorName" TEXT,
ADD COLUMN     "vendorCommissionPercent" DOUBLE PRECISION,
ADD COLUMN     "vendorCommissionAmount" INTEGER,
ADD COLUMN     "commissionPaidAt" TIMESTAMP(3),
ADD COLUMN     "commissionPayoutRef" TEXT;
