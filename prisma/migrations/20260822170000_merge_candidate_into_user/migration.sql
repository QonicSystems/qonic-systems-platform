-- This migration was an abandoned Candidate → User merge. It conflicted with
-- the next commercial-flow migration, which continues to use Candidate as the
-- source of truth, and with the final schema where a Candidate is not a portal
-- account. The preceding migration restores Candidate and its applications;
-- deliberately leave that valid model intact here.
SELECT 1;
