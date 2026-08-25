-- The third built-in role becomes "Developer", the Candidate Pool flag becomes
-- seed-owned, and role deletion goes back to custom roles only.
--
-- Background: `viaCandidatePool` was briefly offered as a checkbox on Create a
-- role. A custom role created with it ticked disappeared from Administration →
-- People (that dropdown hides Candidate Pool roles) *and* became what "Create
-- Employee Account" handed out — so onboarding a developer could silently make
-- them something else entirely. It is now set only by the seed, on Developer.
--
-- Built-in roles are also protected from deletion again. Deleting one was
-- possible for exactly one release; `RetiredRole` existed to stop the seed
-- recreating it, and is now unreachable.

-- 1. Rename the delivery role. `key` is normally never renamed, but this is the
--    same role under a clearer name, and renaming beats leaving `employee` as a
--    key whose label reads "Developer". Users keep their roleId — this is an
--    in-place rename, not a delete-and-recreate.
UPDATE "Role" SET "key" = 'developer' WHERE "key" = 'employee';
UPDATE "Role" SET "label" = 'Developer'
 WHERE "key" = 'developer' AND "label" IN ('Employee', 'Employee (Dev)');

-- 2. Re-create the row if it was deleted while built-ins were deletable. The
--    seed would do this anyway, but only after the tombstone is gone (step 4),
--    and pruneRetiredRoles runs in the same pass — doing it here keeps the two
--    independent. `gen_random_uuid()` is pgcrypto/PG13+; the id shape does not
--    matter, only that it is unique.
INSERT INTO "Role" ("id", "key", "label", "description", "isSuperAdmin", "isSystem", "rank", "viaCandidatePool", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'developer', 'Developer',
       'Engineering and project delivery staff. Onboarded from the Candidate Pool, never from Administration → People.',
       false, true, 50, true, now(), now()
 WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE "key" = 'developer');

-- 3. Only Developer carries the flag. This is the data fix for any custom role
--    created with the checkbox ticked.
UPDATE "Role" SET "viaCandidatePool" = false WHERE "key" <> 'developer';
UPDATE "Role" SET "viaCandidatePool" = true, "isSystem" = true WHERE "key" = 'developer';

-- 4. DropTable — nothing reads or writes it now that built-ins cannot be deleted.
DROP TABLE IF EXISTS "RetiredRole";
