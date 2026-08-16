-- The employee role is defined in lib/auth/roles.ts as "Employee (Dev)", but
-- was seeded as plain "Employee" before that label changed. prisma/seed.ts
-- deliberately never syncs `label` on update — role names are CEO-editable and
-- a redeploy must not overwrite a customised one — so every database seeded
-- before the rename kept the old value. That is why environments disagreed:
-- one showed "Employee", another "Employee (Dev)".
--
-- A one-time correction, scoped to the exact previous default so that a name
-- someone has since changed on purpose is left untouched.
--
-- Cosmetic only. Authorization reads Role.key, isSuperAdmin, and rank, plus the
-- roleId-keyed permission toggles; no code compares or branches on the label.
UPDATE "Role"
   SET "label" = 'Employee (Dev)'
 WHERE "key" = 'employee'
   AND "label" = 'Employee';
