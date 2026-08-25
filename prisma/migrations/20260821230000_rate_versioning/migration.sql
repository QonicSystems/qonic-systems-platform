-- Rate history became obsolete in a later migration, but this historical
-- migration must still be able to resume when an earlier execution created
-- its table before failing. Every operation below is therefore idempotent.
DO $$
BEGIN
  IF to_regclass(format('%I.%I', current_schema(), 'AssignmentRate')) IS NULL THEN
    CREATE TABLE "AssignmentRate" (
        "id" TEXT NOT NULL,
        "assignmentId" TEXT NOT NULL,
        "rate" INTEGER NOT NULL,
        "effectiveFrom" DATE NOT NULL,
        "effectiveTo" DATE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "AssignmentRate_pkey" PRIMARY KEY ("id")
    );
  END IF;

  CREATE INDEX IF NOT EXISTS "AssignmentRate_assignmentId_effectiveFrom_idx"
    ON "AssignmentRate"("assignmentId", "effectiveFrom");

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AssignmentRate_assignmentId_fkey'
      AND conrelid = to_regclass(format('%I.%I', current_schema(), 'AssignmentRate'))
  ) THEN
    ALTER TABLE "AssignmentRate" ADD CONSTRAINT "AssignmentRate_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "ProjectAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'ProjectAssignment'
      AND column_name = 'rate'
  ) THEN
    -- There was no historical effective-date value for the old current rate.
    -- Preserve the same start-date fallback used by its original migration.
    INSERT INTO "AssignmentRate" ("id", "assignmentId", "rate", "effectiveFrom", "effectiveTo")
    SELECT gen_random_uuid()::text, "id", "rate", COALESCE("startedOn", "createdAt"::date), NULL
    FROM "ProjectAssignment"
    WHERE "rate" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "AssignmentRate"
        WHERE "AssignmentRate"."assignmentId" = "ProjectAssignment"."id"
      );
  END IF;

  ALTER TABLE "ProjectAssignment" DROP COLUMN IF EXISTS "rate";
END $$;

-- ResourceDeal was an experimental Rate Management table. Some early
-- environments were baselined after PayoutLedgerEntry existed but before that
-- table was introduced, despite recording the payout-ledger migration as
-- applied. The rate history was retired in a later migration, so preserving
-- its temporary backfill only when the source table actually exists keeps both
-- histories valid and does not invent commercial data.
DO $$
BEGIN
  IF to_regclass(format('%I.%I', current_schema(), 'ResourceDeal')) IS NOT NULL THEN
    IF to_regclass(format('%I.%I', current_schema(), 'DealRate')) IS NULL THEN
      CREATE TABLE "DealRate" (
          "id" TEXT NOT NULL,
          "dealId" TEXT NOT NULL,
          "monthlyAmount" INTEGER NOT NULL,
          "effectiveFrom" DATE NOT NULL,
          "effectiveTo" DATE,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CONSTRAINT "DealRate_pkey" PRIMARY KEY ("id")
      );
    END IF;

    CREATE INDEX IF NOT EXISTS "DealRate_dealId_effectiveFrom_idx"
      ON "DealRate"("dealId", "effectiveFrom");

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'DealRate_dealId_fkey'
        AND conrelid = to_regclass(format('%I.%I', current_schema(), 'DealRate'))
    ) THEN
      ALTER TABLE "DealRate" ADD CONSTRAINT "DealRate_dealId_fkey"
        FOREIGN KEY ("dealId") REFERENCES "ResourceDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'ResourceDeal'
        AND column_name = 'monthlyAmount'
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'ResourceDeal'
        AND column_name = 'effectiveFrom'
    ) THEN
      INSERT INTO "DealRate" ("id", "dealId", "monthlyAmount", "effectiveFrom", "effectiveTo")
      SELECT gen_random_uuid()::text, "id", "monthlyAmount", "effectiveFrom", NULL
      FROM "ResourceDeal"
      WHERE NOT EXISTS (
        SELECT 1 FROM "DealRate"
        WHERE "DealRate"."dealId" = "ResourceDeal"."id"
      );
    END IF;

    ALTER TABLE "ResourceDeal"
      DROP COLUMN IF EXISTS "monthlyAmount",
      DROP COLUMN IF EXISTS "effectiveFrom";
  END IF;
END $$;
