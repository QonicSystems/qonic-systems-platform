-- The current application schema and invoice/revenue queries retain the
-- per-assignment charge-out rate. A historical rate-management migration
-- removed the column while its later consumer code still expects it.
--
-- Existing per-assignment values could not survive that old migration, so this
-- restores the nullable override column. Callers already fall back to
-- Project.defaultRate whenever it is NULL, preserving correct billing for all
-- existing assignments while allowing future per-person overrides.
ALTER TABLE "ProjectAssignment" ADD COLUMN IF NOT EXISTS "rate" INTEGER;
