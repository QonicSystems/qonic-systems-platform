# Avenstrix Consulting — Platform Roadmap

Turning the marketing site into the internal operating system for a freelance
consulting and recruitment firm.

**Phases 1–6 are built and verified.** Phases 7–8 are the planned rollout.

---

## Architecture (decided)

| Area | Choice | Why |
|---|---|---|
| App | Standalone Next.js 16, App Router | Self-contained and independently deployable. The sibling Spring Boot backend was evaluated and rejected: different business, and three of the six required roles don't exist in its enum. |
| Database | PostgreSQL + Prisma 7 | Relational fit for roles, permissions, and approval workflows. |
| Auth | Hand-rolled session cookie + DB `Session` table | See below — this is the load-bearing decision. |
| Passwords | argon2id (`@node-rs/argon2`) | OWASP first choice; prebuilt binaries, no node-gyp. |
| Permissions | Catalog → per-role toggles + per-user overrides | The CEO controls role toggles at runtime; overrides handle individual exceptions. |
| Files | **None. Nothing is stored.** | Documents are rendered on demand from database content; profile photos are links to externally hosted images. There is no object storage, no upload endpoint, and no `.storage` folder. See *Documents on the fly* below. |

### Why database sessions, not JWT

The requirement "CEO can enable or disable functionality for other roles" decides
this. With a JWT, a permission revoked at 10:00 stays live in every already-issued
token until it expires. Permissions are therefore resolved from the database on
every request, so a toggle takes effect on the target's **very next page load** —
verified in the test suite.

### Documents on the fly

Every document — contract letters, offer letters, experience letters — is
rendered **at the moment it is requested** from the frozen `payload` and the
versioned `templateKey`. Nothing is written to disk or to an object store.

What makes an issued letter stable is that its *inputs* are immutable: editing is
blocked once a letter leaves `DRAFT`/`CHANGES_REQUESTED`. Verified: two renders
of the same released letter are byte-identical apart from the PDF's embedded
creation timestamp and document ID.

**The one rule this depends on:** never edit a template's wording in place once
letters have been issued against it. Ship a revision as a new key (`…-v2`) and
leave the old entry in `lib/contracts/templates.ts`, or previously issued
paperwork will silently re-render with new wording.

*Trade-off accepted:* because no file is kept, there is no stored hash to prove a
downloaded PDF matches what was approved. If a regulator or client ever needs
that guarantee, the fix is to persist the bytes at release — not to add a hash of
a document that is regenerated each time.

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

## Phase 2 — Contract letters & people management ✅ COMPLETE

**Contract letters** — the HR-drafts → leadership-releases workflow:

- `DRAFT → PENDING_RELEASE → RELEASED → ACKNOWLEDGED`, plus `CHANGES_REQUESTED` and `REVOKED`
- HR drafts and submits; **CEO and Co-Founder release**; CEO alone revokes
- The lifecycle is a **data table** (`lib/contracts/workflow.ts`), not branching logic — every rule is directly testable
- **Segregation of duties: nobody releases, rejects, or revokes their own letter — including the CEO**
- PDF **rendered on demand**, never stored (see *Documents on the fly*); permission-checked on every download
- Immutable `ContractLetterEvent` history with reviewer notes
- **Six letter templates**: employment contract, offer, increment, experience, relieving, confidentiality undertaking — all sharing one workflow engine

**People management** — who may act on whom:

- **CEO: edit, deactivate, and remove any account.** Deactivating revokes every session immediately and blocks sign-in
- **HR: edit only, and only roles junior to HR** — with the seeded ranks that means Employees, not Accounts or Projects
- Enforced by one helper (`lib/auth/authority.ts`) used by both the API and the UI, so the table never offers an action the server would refuse
- Guards: nobody administers themselves; nobody assigns a role at or above their own; only a super admin grants super-admin
- Changing someone's role signs them out so the new access takes effect cleanly
- Removal is refused for anyone with contract letters on record — the paperwork is a legal record; deactivate instead

**Account hygiene** (the remaining Phase 2 items, all now shipped):

- **Profile photo by URL** — a link to an externally hosted image, with graceful fallback to initials when the link breaks. Only `https` is accepted, so a `javascript:` or `data:` URL can never reach an `<img src>`
- **Forgot / reset password** by emailed single-use token (1-hour expiry) — reuses the existing nodemailer setup. Answers identically for unknown addresses so it cannot be used to discover accounts; completing a reset destroys every existing session
- **Active-session list** showing device, IP, and expiry, with "sign out of N other devices" that keeps the current one alive
- ~~Company document vault~~ — **dropped by decision.** Nothing is stored; documents are produced on demand from database content

---

## Phase 3 — HR operations ✅ COMPLETE

- **Employee records**: date of birth, joining/leaving dates, home address, and emergency contact (name, phone, relationship)
- **Org chart** via a `managerId` self-relation, surfaced as a reporting line in the directory
- **Leave management**:
  - Configurable `LeaveType` rows (Annual 24, Sick 12, Casual 8, Unpaid uncapped) — new categories need no migration
  - Per-employee, per-year balances; **the balance moves in the same transaction as the approval**, so the two can never disagree
  - Working days computed excluding weekends; overlapping requests, weekend-only ranges, and over-allowance requests are all refused
  - Approval chain: `leave.approve` covers your direct reports, `leave.manage` covers everyone — and **nobody approves their own leave**
  - Requesters can withdraw a pending request; a decided request cannot be re-decided
- **Six letter templates** reusing the Phase 2 workflow engine, selectable when drafting

### Deferred from Phase 3

- **Public holiday calendar** — leave currently excludes weekends only, so a holiday inside a range still counts as leave. The UI says so explicitly
- Attendance and working-hours tracking
- Onboarding / offboarding checklists
- Bank details (deliberately not added: needs encryption-at-rest design first)

## Phase 4 — Delivery: clients, projects, timesheets ✅ COMPLETE

- **Clients** with a short code, status, industry, and an account owner
- **Projects** namespaced by client code (`NWT-WH-01`), with status, billing model
  (T&M / fixed price / retainer / non-billable), budget, and a default charge-out rate.
  Creating one auto-adds a "General" task and assigns the manager, so time can be booked immediately
- **Timesheets**: a weekly grid, one row per project+task, seven day columns
  - `DRAFT → SUBMITTED → APPROVED`, with `REJECTED` sending the week back for changes
  - **Submitting locks the week; approving locks it permanently**
  - **Nobody approves their own timesheet**, whatever they hold — time drives invoicing, so self-approval would let one person bill unchecked
  - Rejections require a written reason
  - Time is only accepted against projects you are **assigned** to
  - Guards: entries must fall inside their own week, no more than 16h on one day, and durations must parse
- **Utilisation report** over a rolling 4 weeks, per person and per project

### Two decisions worth knowing

**Time is stored as integer minutes, never fractional hours.** Hours as a float
accumulate rounding error across a month and make invoices disagree with
timesheets. The UI accepts `7.5`, `7:30`, or `450m` — all three parse to the same
450 minutes.

**Money is stored in minor units** (paise/cents) for the same reason.

**`billableRatio` and `utilisation` are deliberately different numbers.** The
first asks "of the time booked, how much is chargeable"; the second asks "of a
standard 40-hour week, how much was chargeable". They diverge whenever someone
books more or less than a full week — which is exactly when the distinction matters.

### Phase 4 completion (all previously deferred items now shipped)

- **Editing clients and projects** after creation, including re-coding a project
- **Deleting a client** is refused once it has projects, jobs, or invoices — archive instead
- **Team assignment**: add or remove people at a stated allocation. Removal is blocked once someone has booked time, so history stays intact
- **Milestones** with due dates, amounts, and status
- **Project health** flag (on track / at risk / off track)
- **Capacity report** reading `allocationPercent`, flagging the bench and anyone over-allocated

## Phase 5 — Recruitment / ATS ✅ COMPLETE

- **Jobs** with a reference, client, salary band, openings, placement fee %, and a time-to-fill SLA that flags ageing requisitions
- **Candidates** with CV and LinkedIn **links** (nothing uploaded), skills, source, and a recorded consent timestamp
- **Pipeline**: Sourced → Screened → Submitted → Interview → Offer → Placed, plus Rejected and Withdrawn
  - Expressed as a **data table** (`lib/ats/pipeline.ts`), like the contract workflow
  - **One step at a time forward** — skipping stages would hide the screening that supposedly happened. Moving *back* is allowed, because candidates genuinely go for another round
  - **PLACED is unreachable by a stage move** — it goes through the placement flow, which captures salary and fee
  - Rejections and withdrawals require a written reason
- **Interviews** with panel, kind, duration, and a 1–5 scorecard. Scheduling one advances the stage automatically
- **Placements** compute the fee and **store it**, so a later change to the client's fee policy cannot rewrite booked revenue. Filling every opening auto-closes the requisition
- **Public careers page** with an application form — the one unauthenticated write in the system, deliberately narrow: it can only create a candidate and one application against an already-published job
  - Consent is required
  - A re-application never overwrites a recruiter's existing notes
  - Draft and unpublished roles are **404 to the public**

## Phase 6 — Finance ✅ COMPLETE

- **Invoices** raised manually or **generated from approved timesheets** — one line per person at their assigned rate
  - Only `APPROVED` billable time is pulled; a draft timesheet is not a claim anyone has stood behind
  - Billed hours are **stamped**, so the same time can never be invoiced twice. Voiding an invoice releases them again
  - Draft → Sent → Part paid → Paid, with voiding blocked once a payment exists
- **Payments** recorded against an invoice; over-payment is refused and the status moves in the same transaction as the payment, so an invoice can never disagree with its own payments
- **Invoice PDF** rendered on demand, never stored (same approach as contract letters)
- **Expenses** with category, receipt **link**, optional project and rebillable flag; Draft → Submitted → Approved → Reimbursed
  - **Nobody approves their own claim** — the classic expenses fraud
  - Rejections require a reason; future-dated claims are refused
- **Revenue report**: billed, collected, outstanding, receivables ageing (current / 1-30 / 31-60 / 61-90 / 90+), placements, and fees by recruiter

### Money and time are integers, always

Money is stored in **minor units** (paise) and time in **whole minutes**. Floats
accumulate error across a month of lines and make invoices disagree with their
own components. Invoice quantities are hundredths of an hour, so 7.5h is exactly
750 and a line rounds **once**, at the end.

### Deferred from Phases 5–6

- Interview scheduling UI (the API and model are complete; the portal exposes the pipeline, not a calendar)
- Payroll, salary structures, and payslips
- Purchase orders and subcontractor management
- Accounting export (CSV / Tally / QuickBooks / Xero)
- Credit notes — voiding is blocked once a payment exists, and a credit note is the correct instrument

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

# Locked out? Set any account's password from the command line:
npm run db:set-password -- founder@avenstrixconsulting.com
npm test                # unit + component
npm run test:e2e        # end-to-end
```

The bootstrap CEO comes from `BOOTSTRAP_CEO_*` in `.env` and is created **only
when the user table is empty**. It must change its password at first login.

> **Important:** once any user exists, changing `BOOTSTRAP_CEO_PASSWORD` in `.env`
> has no effect — the seed skips bootstrap entirely. To change a password after
> that, use the account's own security page, the emailed reset, or
> `npm run db:set-password` for lockout recovery.

## Adding a capability later

1. Add an entry to `PERMISSIONS` in `lib/auth/permissions.ts`
2. `npm run db:seed` (idempotent — existing toggles are preserved)
3. Guard the route with `requirePermission("your.key")` or `guardRoute("your.key")`
4. The CEO switches it on per role in **Administration → Roles & Permissions**

## Adding a role later

Create it in the admin console. No migration, no deploy. Give it a `rank` below
the roles it should be allowed to administer.
