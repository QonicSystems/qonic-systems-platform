-- CreateTable
CREATE TABLE IF NOT EXISTS "CandidateProfile" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "technology" TEXT NOT NULL DEFAULT 'General',
    "experienceYears" INTEGER,
    "skills" TEXT,
    "resumeUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'MARKETING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- Add Columns if table already existed
ALTER TABLE "CandidateProfile" ADD COLUMN IF NOT EXISTS "technology" TEXT DEFAULT 'General';
ALTER TABLE "CandidateProfile" ADD COLUMN IF NOT EXISTS "experienceYears" INTEGER;
ALTER TABLE "CandidateProfile" ADD COLUMN IF NOT EXISTS "skills" TEXT;
ALTER TABLE "CandidateProfile" ADD COLUMN IF NOT EXISTS "resumeUrl" TEXT;
ALTER TABLE "CandidateProfile" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'MARKETING';

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateProfile_candidateId_fkey') THEN
        ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "candidateProfileId" TEXT;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Application_candidateProfileId_fkey') THEN
        ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CandidateProfile_candidateId_idx" ON "CandidateProfile"("candidateId");
CREATE INDEX IF NOT EXISTS "CandidateProfile_technology_idx" ON "CandidateProfile"("technology");
