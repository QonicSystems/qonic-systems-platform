-- Candidate.source is free text, and the same channel has been written several
-- ways over time: the add form stores "Global Visa Resource", older tooling
-- stored "GLOBAL_VISA_RESOURCE". Anything matching on the exact string (the
-- commission tracker on the invoices page) silently missed the other spelling.
--
-- This collapses each known variant onto the label the add form writes, using
-- the same normalisation as resourceTypeOf() in lib/ats/resource-type.ts:
-- lowercase, non-alphanumerics to spaces, trimmed.
--
-- Only variants with an unambiguous target are rewritten. A generic value such
-- as "Employee Dev" names the group but not which channel it came through, so
-- it is left as-is and continues to be classified in application code.

UPDATE "Candidate" SET "source" = 'Global Visa Resource'
 WHERE "source" <> 'Global Visa Resource'
   AND btrim(lower(regexp_replace("source", '[^a-zA-Z0-9]+', ' ', 'g')))
       IN ('global visa resource', 'global visa');

UPDATE "Candidate" SET "source" = 'Direct / LinkedIn'
 WHERE "source" <> 'Direct / LinkedIn'
   AND btrim(lower(regexp_replace("source", '[^a-zA-Z0-9]+', ' ', 'g')))
       IN ('direct linkedin', 'linkedin');

UPDATE "Candidate" SET "source" = 'Internal Connection'
 WHERE "source" <> 'Internal Connection'
   AND btrim(lower(regexp_replace("source", '[^a-zA-Z0-9]+', ' ', 'g')))
       = 'internal connection';

UPDATE "Candidate" SET "source" = 'Job Application'
 WHERE "source" <> 'Job Application'
   AND btrim(lower(regexp_replace("source", '[^a-zA-Z0-9]+', ' ', 'g')))
       = 'job application';
