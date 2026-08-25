-- Administration → Rate Management is removed, and with it the only code that
-- could ever write these.
--
-- `ResourceDeal` held the client-facing monthly deal value per resource. Its two
-- readers were Rate Management and the Deal Financials report, both now gone, so
-- the table is unreachable rather than merely unused.
--
-- The `PayoutLedgerEntry` override columns were an admin reclassification of a
-- computed payout category, settable only from Rate Management's ledger table.
-- With no writer left they would stay NULL forever, and the "Reclassified" badge
-- on My Earnings could never appear. `category` itself is untouched — it is
-- still computed and written when a timesheet is approved.
--
-- DESTRUCTIVE. Check both before deploying to an environment with real data:
--   SELECT count(*) FROM "ResourceDeal";
--   SELECT count(*) FROM "PayoutLedgerEntry" WHERE "overrideCategory" IS NOT NULL;
-- Any deal amounts or reclassifications still wanted must be exported first. The
-- audit log keeps a record of each override that was applied
-- (action = 'payout.reclassify') and of each deal amount set
-- (entityType = 'ResourceDeal'), but the rows themselves go.

-- DropForeignKey
ALTER TABLE "PayoutLedgerEntry" DROP CONSTRAINT IF EXISTS "PayoutLedgerEntry_overriddenById_fkey";

-- AlterTable
ALTER TABLE "PayoutLedgerEntry"
  DROP COLUMN "overrideCategory",
  DROP COLUMN "overriddenById",
  DROP COLUMN "overriddenAt",
  DROP COLUMN "overrideNote";

-- DropTable
DROP TABLE "ResourceDeal";
