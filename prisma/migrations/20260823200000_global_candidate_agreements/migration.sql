CREATE TYPE "GlobalCandidateAgreementStatus" AS ENUM ('DRAFT', 'SENT', 'ACKNOWLEDGED', 'DECLINED', 'REVOKED');

CREATE TABLE "GlobalCandidateAgreement" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" "GlobalCandidateAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "acknowledgementTokenHash" TEXT,
    "acknowledgementExpiresAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "responseIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalCandidateAgreement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalCandidateAgreement_reference_key" ON "GlobalCandidateAgreement"("reference");
CREATE UNIQUE INDEX "GlobalCandidateAgreement_acknowledgementTokenHash_key" ON "GlobalCandidateAgreement"("acknowledgementTokenHash");
CREATE INDEX "GlobalCandidateAgreement_candidateId_status_idx" ON "GlobalCandidateAgreement"("candidateId", "status");
CREATE INDEX "GlobalCandidateAgreement_status_releasedAt_idx" ON "GlobalCandidateAgreement"("status", "releasedAt");

ALTER TABLE "GlobalCandidateAgreement"
  ADD CONSTRAINT "GlobalCandidateAgreement_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
