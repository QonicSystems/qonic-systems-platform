-- Company announcements are for accounts deliberately added through People.
-- The CEO publishes them but does not receive them; Candidate-Pool accounts
-- (Developers and Global Candidates) are not People recipients either.
--
-- The first Candidate→User backfill predates immutable candidate kinds and
-- linked a few Global Candidate profiles to same-email Developer users. A
-- Global Candidate must never hold a Qonic portal account, so preserve the
-- historical User row by archiving it, end its sessions, and remove the bad
-- link rather than deleting business history.
DELETE FROM "CompanyAnnouncementRecipient" AS receipt
USING "User" AS person
LEFT JOIN "Role" AS role ON role."id" = person."roleId"
LEFT JOIN "Candidate" AS candidate ON candidate."linkedUserId" = person."id"
WHERE receipt."userId" = person."id"
  AND (
    person."status" <> 'ACTIVE'
    OR role."key" = 'ceo'
    OR role."viaCandidatePool" = TRUE
    OR candidate."id" IS NOT NULL
  );

DELETE FROM "Session" AS session
USING "Candidate" AS candidate
WHERE candidate."kind" = 'GLOBAL'
  AND candidate."linkedUserId" IS NOT NULL
  AND session."userId" = candidate."linkedUserId";

UPDATE "User" AS person
SET "status" = 'ARCHIVED',
    "leftOn" = COALESCE(person."leftOn", CURRENT_TIMESTAMP)
FROM "Candidate" AS candidate
WHERE candidate."kind" = 'GLOBAL'
  AND candidate."linkedUserId" = person."id"
  AND person."status" = 'ACTIVE';

UPDATE "Candidate"
SET "linkedUserId" = NULL
WHERE "kind" = 'GLOBAL'
  AND "linkedUserId" IS NOT NULL;
