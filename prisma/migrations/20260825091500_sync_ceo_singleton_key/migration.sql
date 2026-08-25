-- Keep User.ceoSingletonKey derived from the role even for direct database
-- writes. The unique index created by the preceding migration then prevents
-- two rows from ever holding the CEO role concurrently.
CREATE OR REPLACE FUNCTION "syncUserCeoSingletonKey"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."roleId" IN (SELECT "id" FROM "Role" WHERE "key" = 'ceo') THEN
    NEW."ceoSingletonKey" := 'ceo';
  ELSE
    NEW."ceoSingletonKey" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_sync_ceo_singleton_key"
BEFORE INSERT OR UPDATE OF "roleId", "ceoSingletonKey" ON "User"
FOR EACH ROW EXECUTE FUNCTION "syncUserCeoSingletonKey"();
