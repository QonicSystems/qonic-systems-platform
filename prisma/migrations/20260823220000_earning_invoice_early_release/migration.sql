-- A founder-authorised early release permits one urgent invoice in the current
-- open month. Developers can subsequently raise a supplemental invoice after
-- close for delivery approved after that early invoice.
CREATE TABLE "EarningInvoiceEarlyRelease" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "EarningInvoiceEarlyRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EarningInvoiceEarlyRelease_userId_period_currency_key" ON "EarningInvoiceEarlyRelease"("userId", "period", "currency");
CREATE INDEX "EarningInvoiceEarlyRelease_period_usedAt_idx" ON "EarningInvoiceEarlyRelease"("period", "usedAt");
CREATE INDEX "EarningInvoiceEarlyRelease_grantedById_idx" ON "EarningInvoiceEarlyRelease"("grantedById");

ALTER TABLE "EarningInvoiceEarlyRelease" ADD CONSTRAINT "EarningInvoiceEarlyRelease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarningInvoiceEarlyRelease" ADD CONSTRAINT "EarningInvoiceEarlyRelease_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EarningInvoice" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "EarningInvoice" ADD COLUMN "earlyReleaseId" TEXT;
DROP INDEX "EarningInvoice_userId_period_currency_key";
CREATE UNIQUE INDEX "EarningInvoice_userId_period_currency_sequence_key" ON "EarningInvoice"("userId", "period", "currency", "sequence");
CREATE INDEX "EarningInvoice_earlyReleaseId_idx" ON "EarningInvoice"("earlyReleaseId");
ALTER TABLE "EarningInvoice" ADD CONSTRAINT "EarningInvoice_earlyReleaseId_fkey" FOREIGN KEY ("earlyReleaseId") REFERENCES "EarningInvoiceEarlyRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
