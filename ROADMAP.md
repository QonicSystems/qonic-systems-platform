# Avenstrix Consulting — Platform Roadmap

Turning the marketing site into the internal operating system for a freelance
consulting and recruitment firm.

**Phase 1 is built and verified.** Phases 2–8 are the planned rollout.

---

## Architecture (decided)

| Area | Choice | Why |
|---|---|---|
| App | Standalone Next.js 16, App Router | Self-contained and independently deployable. The sibling Spring Boot backend was evaluated and rejected: different business, and three of the six required roles don't exist in its enum. |
| Database | PostgreSQL + Prisma 7 | Relational fit for roles, permissions, and approval workflows. |
| Auth | Hand-rolled session cookie + DB `Session` table | See below — this is the load-bearing decision. |
| Passwords | argon2id (`@node-rs/argon2`) | OWASP first choice; prebuilt binaries, no node-gyp. |
| Permissions | Catalog → per-role toggles + per-user overrides | The CEO controls role toggles at runtime; overrides handle individual exceptions. |
| Files | Private object storage, presigned URLs | Deliberately *not* base64-in-a-column. |

### Why database sessions, not JWT

The requirement "CEO can enable or disable functionality for other roles" decides
this. With a JWT, a permission revoked at 10:00 stays live in every already-issued
token until it expires. Permissions are therefore resolved from the database on
every request, so a toggle takes effect on the target's **very next page load** —
verified in the test suite.

### Why roles are rows, not an enum

A new role ("Legal", "Marketing") is a database row plus some toggles — no
migration, no deploy. Application code branches on **permissions**, never role
names. The only legitimate role checks are `isSuperAdmin` (the CEO bypass) and
`rank` (the privilege-escalation guard).

---

## Phase 1 — Foundation ✅ COMPLETE

- Postgres + Prisma, connection singleton, initial migration
- 13-permission catalog, 6 seeded roles, idempotent seed that **never resets the CEO's customised toggles**
- Bootstrap CEO from env vars, forced password change at first login
- **One login page** at `/login` for every role
- Session cookie (`httpOnly`, `sameSite=lax`, 8h idle / 30d absolute), sha256-hashed at rest
- `middleware.ts` optimistic gate + `requireAuth` / `requirePermission` / `guardRoute` as the real boundary
- Portal shell with permission-filtered navigation, dashboard, team directory
- Profiles: name, phone, job title, change password (revokes all other sessions)
- **Admin console with the CEO's role × capability toggle matrix**, people list, audit log
- Audit logging on every auth and RBAC mutation
- Route-group restructure — all seven marketing URLs unchanged

**Roles seeded:** CEO & Founder (super admin, rank 0) · Co-Founder (10) · HR (20) · Accounts (20) · Projects (20) · Employee (50)

---

## Phase 2 — Contract letters & account hygiene

The HR-drafts → leadership-releases workflow. Permissions for this are **already
seeded and toggleable**; only the workflow and UI remain.

- `ContractLetter` model with `DRAFT → PENDING_RELEASE → RELEASED` (plus `CHANGES_REQUESTED`, `ACKNOWLEDGED`, `REVOKED`)
- HR drafts and submits; **CEO and Co-Founder release**; CEO alone revokes
- Hard invariant: nobody releases their own letter, including the CEO
- PDF generated **only at release** (a legal artifact must stay byte-stable), stored privately, served via 60-second presigned URL
- Employee acknowledgement; immutable `ContractLetterEvent` trail
- Profile photo upload (presigned PUT, ≤5 MB, type allowlist)
- Forgot/reset password by emailed token — reuses the existing nodemailer setup
- Login rate limiting is in place; add active-session list and "sign out everywhere"
- Company document vault with permission-scoped folders

## Phase 3 — HR operations

- Full employee records: emergency contacts, bank details (encrypted at rest), tenure
- Leave management: types, balances, accrual, approval chain, team calendar
- Attendance, working hours, holiday calendar
- Onboarding and offboarding checklists with task assignment
- Org chart via a `managerId` self-relation
- More letter templates — offer, relieving, experience, increment, NDA — reusing the Phase 2 workflow engine

## Phase 4 — Delivery: clients, projects, timesheets

- `Client` and `ClientContact`, account ownership
- `Project`: status, budget, billing model (T&M / fixed / retainer), team allocation
- Tasks, milestones, project health flags
- **Timesheets**: weekly entry, billable split, submit → approve → lock
- Utilization and bench reporting, capacity planning

## Phase 5 — Recruitment / ATS *(core to a recruitment firm)*

- `Job` requisitions tied to a client, with intake brief and SLA
- `Candidate`: resume in object storage, parsed skills, source, GDPR consent flags
- Configurable pipeline: Sourced → Screened → Submitted → Interview → Offer → Placed → Rejected
- Interview scheduling, scorecards, panel assignment
- Candidate–job matching, dedupe, talent-pool search
- Placement records feeding revenue and recruiter commission
- **Public careers page + application intake** — the first place marketing and portal join

## Phase 6 — Finance

- Invoicing generated from timesheets and placements, tax lines, PDF via the Phase 2 pipeline
- Payment tracking, AR aging, dunning reminders
- Expense submission with receipts and approval chain
- Payroll: salary structures, monthly runs, payslip PDFs, statutory deductions
- Recruiter commission and incentives; POs and subcontractors
- Accounting export (CSV / Tally / QuickBooks / Xero)

## Phase 7 — Intelligence & reach

- Analytics: revenue, margin, time-to-fill, pipeline conversion, utilization, attrition
- Per-role configurable dashboards, scheduled report emails
- **Client portal** — external, heavily permission-scoped: submitted candidates, interview status, timesheet approval, invoices
- Notifications: in-app inbox, email digests, Slack/Teams webhooks
- Global search across candidates, clients, projects, documents

## Phase 8 — Scale & compliance

- SSO (Google Workspace / Microsoft Entra) — the DB-session design makes this migration straightforward
- TOTP MFA, enforced for super-admin and finance roles
- Data retention, GDPR export/erasure, consent tracking
- Immutable audit export, segregation-of-duties reports
- E-signature (DocuSign / Zoho Sign) for contract letters
- Public REST/webhook API for job boards and VMS integrations
- Multi-entity, multi-currency, localization
- Performance reviews, OKRs, training and certification tracking
- PWA, or reuse of the `shutterpact-mobile` patterns

---

## Running it

```bash
npm run db:setup        # migrate + seed roles, permissions, bootstrap CEO
npm run db:seed:demo    # optional: one demo account per role (dev/test only)
npm run dev             # http://localhost:3000  → sign in at /login

npm run db:setup:test   # prepare the disposable e2e database (once)
npm test                # unit + component
npm run test:e2e        # end-to-end
```

The bootstrap CEO comes from `BOOTSTRAP_CEO_*` in `.env` and is created **only
when the user table is empty**. It must change its password at first login.

## Adding a capability later

1. Add an entry to `PERMISSIONS` in `lib/auth/permissions.ts`
2. `npm run db:seed` (idempotent — existing toggles are preserved)
3. Guard the route with `requirePermission("your.key")` or `guardRoute("your.key")`
4. The CEO switches it on per role in **Administration → Roles & Permissions**

## Adding a role later

Create it in the admin console. No migration, no deploy. Give it a `rank` below
the roles it should be allowed to administer.
