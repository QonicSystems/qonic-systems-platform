-- Connect candidate sourcing, consent, job procurement, vendor billing, and
-- payment reporting without replacing the pre-existing delivery records.

CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED');
CREATE TYPE "CandidateKind" AS ENUM ('GLOBAL', 'DEVELOPER', 'DIRECT');
CREATE TYPE "CandidateConsentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CONSENTED', 'DECLINED');
CREATE TYPE "CommercialInvoiceKind" AS ENUM ('STANDARD', 'QONIC_TO_VENDOR', 'VENDOR_TO_GLOBAL_CANDIDATE', 'GLOBAL_CANDIDATE_COMMISSION_RECORD');
-- Payment reminders introduced this shared delivery-channel vocabulary first.
-- Keep the commercial-flow migration compatible with databases where that
-- earlier feature was already present.
DO $$ BEGIN
  CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'WHATSAPP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "Vendor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "website" TEXT,
  "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");

CREATE TABLE "CommissionPolicy" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "defaultGlobalCandidateCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "defaultVendorCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionPolicy_pkey" PRIMARY KEY ("id")
);
INSERT INTO "CommissionPolicy" ("id", "defaultGlobalCandidateCommissionPercent", "defaultVendorCommissionPercent", "updatedAt")
VALUES ('default', 20, 20, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "Client"
  ADD COLUMN "vendorId" TEXT,
  ADD COLUMN "globalCandidateId" TEXT,
  ADD COLUMN "employmentType" TEXT,
  ADD COLUMN "workArrangement" TEXT,
  ADD COLUMN "startDate" DATE,
  ADD COLUMN "endDate" DATE,
  ADD COLUMN "actualClientRate" INTEGER,
  ADD COLUMN "rateCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "globalCandidateCommissionPercent" DOUBLE PRECISION,
  ADD COLUMN "vendorCommissionPercent" DOUBLE PRECISION;
ALTER TABLE "Client" ADD CONSTRAINT "Client_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_globalCandidateId_fkey" FOREIGN KEY ("globalCandidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Client_vendorId_idx" ON "Client"("vendorId");
CREATE INDEX "Client_globalCandidateId_idx" ON "Client"("globalCandidateId");

ALTER TABLE "Candidate"
  ADD COLUMN "kind" "CandidateKind" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "consentStatus" "CandidateConsentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "addedById" TEXT;
UPDATE "Candidate"
SET "kind" = CASE
  WHEN lower("source") LIKE '%global%' THEN 'GLOBAL'::"CandidateKind"
  WHEN lower("source") LIKE '%linkedin%' OR lower("source") LIKE '%internal connection%' OR lower("source") LIKE '%employee dev%' THEN 'DEVELOPER'::"CandidateKind"
  ELSE 'DIRECT'::"CandidateKind"
END,
"consentStatus" = CASE WHEN "consentAt" IS NOT NULL THEN 'CONSENTED'::"CandidateConsentStatus" ELSE 'NOT_REQUIRED'::"CandidateConsentStatus" END;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Candidate_kind_consentStatus_idx" ON "Candidate"("kind", "consentStatus");
CREATE INDEX "Candidate_addedById_idx" ON "Candidate"("addedById");

CREATE TABLE "CandidateConsent" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "status" "CandidateConsentStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  CONSTRAINT "CandidateConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CandidateConsent_tokenHash_key" ON "CandidateConsent"("tokenHash");
CREATE INDEX "CandidateConsent_candidateId_requestedAt_idx" ON "CandidateConsent"("candidateId", "requestedAt");
ALTER TABLE "CandidateConsent" ADD CONSTRAINT "CandidateConsent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CandidateMarketingProfile" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "technology" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateMarketingProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CandidateMarketingProfile_candidateId_technology_key" ON "CandidateMarketingProfile"("candidateId", "technology");
CREATE INDEX "CandidateMarketingProfile_technology_isActive_idx" ON "CandidateMarketingProfile"("technology", "isActive");
ALTER TABLE "CandidateMarketingProfile" ADD CONSTRAINT "CandidateMarketingProfile_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD COLUMN "commercialKind" "CommercialInvoiceKind" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "commercialGroupId" TEXT,
  ADD COLUMN "billingRecipient" TEXT,
  ADD COLUMN "grossClientAmount" INTEGER,
  ADD COLUMN "vendorCommissionAmount" INTEGER,
  ADD COLUMN "globalCandidateCommissionAmount" INTEGER,
  ADD COLUMN "qonicRevenueAmount" INTEGER;
CREATE INDEX "Invoice_commercialGroupId_idx" ON "Invoice"("commercialGroupId");
CREATE INDEX "Invoice_commercialKind_idx" ON "Invoice"("commercialKind");

CREATE TABLE "Reminder" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT,
  "clientId" TEXT,
  "channel" "ReminderChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "sentById" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Reminder_vendorId_sentAt_idx" ON "Reminder"("vendorId", "sentAt");
CREATE INDEX "Reminder_clientId_sentAt_idx" ON "Reminder"("clientId", "sentAt");
CREATE INDEX "Reminder_recipient_sentAt_idx" ON "Reminder"("recipient", "sentAt");
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
