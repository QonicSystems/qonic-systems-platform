-- Keep the invoice receivable in its contractual currency while retaining
-- enough immutable information to reconcile an INR bank settlement and its
-- realised exchange difference.
ALTER TABLE "Invoice"
  ADD COLUMN "settlementCurrency" TEXT,
  ADD COLUMN "lockedSettlementRate" DECIMAL(18,6);

ALTER TABLE "Payment"
  ADD COLUMN "settlementAmount" INTEGER,
  ADD COLUMN "settlementCurrency" TEXT,
  ADD COLUMN "realizedFxGainLoss" INTEGER;
