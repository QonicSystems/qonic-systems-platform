-- Accounts in a `viaCandidatePool` role are created from the Candidate Pool
-- (add the candidate, then create their employee account), never from
-- Administration → People, so the account always has a candidate record and a
-- contract letter behind it.
--
-- A column rather than a hardcoded role key in application code, because roles
-- are rows the CEO creates at runtime — a new delivery role has to be markable
-- without a deploy.

-- AlterTable
ALTER TABLE "Role" ADD COLUMN "viaCandidatePool" BOOLEAN NOT NULL DEFAULT false;

-- Employee (Dev) is the one seeded role this applies to today. A no-op on any
-- database whose key differs, which would leave the restriction unenforced —
-- check `SELECT key, label FROM "Role"` per environment before deploying.
UPDATE "Role" SET "viaCandidatePool" = true WHERE "key" = 'employee';
