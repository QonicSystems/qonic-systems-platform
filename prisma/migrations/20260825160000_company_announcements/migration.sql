-- Mandatory, company-wide announcements are distinct from ordinary inbox
-- notifications. Each active person is snapshotted as a recipient at release
-- time and must acknowledge their own receipt before using the portal again.
CREATE TABLE "CompanyAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "releasedById" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyAnnouncementRecipient" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyAnnouncementRecipient_pkey" PRIMARY KEY ("announcementId", "userId")
);

CREATE INDEX "CompanyAnnouncement_releasedAt_idx" ON "CompanyAnnouncement"("releasedAt");
CREATE INDEX "CompanyAnnouncement_releasedById_idx" ON "CompanyAnnouncement"("releasedById");
CREATE INDEX "CompanyAnnouncementRecipient_userId_acknowledgedAt_idx" ON "CompanyAnnouncementRecipient"("userId", "acknowledgedAt");
CREATE INDEX "CompanyAnnouncementRecipient_announcementId_acknowledgedAt_idx" ON "CompanyAnnouncementRecipient"("announcementId", "acknowledgedAt");

ALTER TABLE "CompanyAnnouncement"
  ADD CONSTRAINT "CompanyAnnouncement_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanyAnnouncementRecipient"
  ADD CONSTRAINT "CompanyAnnouncementRecipient_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "CompanyAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyAnnouncementRecipient"
  ADD CONSTRAINT "CompanyAnnouncementRecipient_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
