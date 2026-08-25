-- A Qonic workspace has exactly one CEO & Founder principal. The nullable
-- marker permits every non-CEO account while its unique index permits only one
-- row carrying the `ceo` value.
ALTER TABLE "User" ADD COLUMN "ceoSingletonKey" TEXT;

-- Backfill before creating the unique index so the existing CEO remains the
-- sole holder. If historical data contains more than one CEO, the index
-- deliberately refuses to deploy rather than silently choosing one.
UPDATE "User"
SET "ceoSingletonKey" = 'ceo'
WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "key" = 'ceo');

CREATE UNIQUE INDEX "User_ceoSingletonKey_key" ON "User"("ceoSingletonKey");
