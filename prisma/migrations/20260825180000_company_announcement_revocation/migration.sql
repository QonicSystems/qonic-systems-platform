-- A release can be revoked without erasing its acknowledgement record. Only a
-- fully-read, still-released announcement may subsequently be hard-deleted by
-- the CEO; the application keeps an AuditLog entry for either action.
CREATE TYPE "CompanyAnnouncementStatus" AS ENUM ('RELEASED', 'REVOKED');

ALTER TABLE "CompanyAnnouncement"
  ADD COLUMN "status" "CompanyAnnouncementStatus" NOT NULL DEFAULT 'RELEASED',
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT;

CREATE INDEX "CompanyAnnouncement_status_releasedAt_idx" ON "CompanyAnnouncement"("status", "releasedAt");
CREATE INDEX "CompanyAnnouncement_revokedById_idx" ON "CompanyAnnouncement"("revokedById");

ALTER TABLE "CompanyAnnouncement"
  ADD CONSTRAINT "CompanyAnnouncement_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
