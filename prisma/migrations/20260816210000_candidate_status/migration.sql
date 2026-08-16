-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CandidateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "status" "CandidateStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Candidate_status_idx" ON "Candidate"("status");
