-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "linkedUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_linkedUserId_key" ON "Candidate"("linkedUserId");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- This is the last time Candidate<->User is ever linked by matching email
-- strings: it backfills the real relation from whatever the fragile sync job
-- (lib/ats/sync.ts, retired by this migration's application-code companion
-- change) had already been guessing, so existing pairs don't lose their link
-- when the guessing goes away. Only ties an already-active, non-leadership
-- User, matching one of the deliberately narrow patches this session made to
-- the same lookup (app/api/candidates/[id]/route.ts DELETE) so this backfill
-- can't wire a candidate to a CEO/co-founder account.
UPDATE "Candidate" c
   SET "linkedUserId" = u.id
  FROM "User" u
 WHERE lower(trim(c.email)) = lower(trim(u.email))
   AND u.status = 'ACTIVE'
   AND u."roleId" IN (SELECT id FROM "Role" WHERE key NOT IN ('ceo', 'co_founder'))
   AND c."linkedUserId" IS NULL;
