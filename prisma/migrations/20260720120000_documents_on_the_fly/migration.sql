-- Documents are rendered on demand from the frozen `payload` + versioned
-- `templateKey`, so no PDF is persisted and these columns are no longer used.
ALTER TABLE "ContractLetter" DROP COLUMN "pdfKey";
ALTER TABLE "ContractLetter" DROP COLUMN "pdfSha256";
