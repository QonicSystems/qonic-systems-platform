-- The delivery role is renamed from "Employee (Dev)" back to plain "Employee",
-- and "Employee Dev" as a CANDIDATE classification becomes "Developer"
-- (lib/ats/resource-type.ts) — the two were being read as the same thing.
--
-- prisma/seed.ts deliberately never syncs `label` on update: role names are
-- CEO-editable and a redeploy must not overwrite one someone has customised. So
-- changing SEEDED_ROLES alone would leave every existing database on the old
-- name, exactly as happened with 20260817090000_employee_role_label — which
-- this reverses.
--
-- Scoped to the exact previous default so a name since changed on purpose is
-- left alone.
--
-- Cosmetic only. Authorization reads Role.key, isSuperAdmin, rank, and
-- viaCandidatePool, plus the roleId-keyed permission toggles; nothing branches
-- on the label.
UPDATE "Role"
   SET "label" = 'Employee'
 WHERE "key" = 'employee'
   AND "label" = 'Employee (Dev)';
