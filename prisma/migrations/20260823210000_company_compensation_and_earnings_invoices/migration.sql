-- Company compensation is a payable ledger, deliberately separate from client
-- receivable invoices. Amounts remain integer minor units throughout.
CREATE TABLE "CompensationProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "setById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompensationProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompensationProfile_userId_effectiveFrom_key" ON "CompensationProfile"("userId", "effectiveFrom");
CREATE INDEX "CompensationProfile_userId_effectiveFrom_effectiveTo_idx" ON "CompensationProfile"("userId", "effectiveFrom", "effectiveTo");
ALTER TABLE "CompensationProfile" ADD CONSTRAINT "CompensationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompensationProfile" ADD CONSTRAINT "CompensationProfile_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "EarningInvoiceSource" AS ENUM ('DELIVERY_PAYOUT', 'MONTHLY_SALARY');
CREATE TYPE "EarningInvoiceStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'PAID', 'REJECTED', 'VOID');

CREATE TABLE "EarningInvoice" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "EarningInvoiceSource" NOT NULL,
    "status" "EarningInvoiceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "calculation" JSONB NOT NULL,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarningInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EarningInvoice_reference_key" ON "EarningInvoice"("reference");
CREATE UNIQUE INDEX "EarningInvoice_userId_period_currency_key" ON "EarningInvoice"("userId", "period", "currency");
CREATE INDEX "EarningInvoice_status_period_idx" ON "EarningInvoice"("status", "period");
CREATE INDEX "EarningInvoice_userId_period_idx" ON "EarningInvoice"("userId", "period");
ALTER TABLE "EarningInvoice" ADD CONSTRAINT "EarningInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarningInvoice" ADD CONSTRAINT "EarningInvoice_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EarningInvoice" ADD CONSTRAINT "EarningInvoice_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
