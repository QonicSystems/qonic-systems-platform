# QONIC Consulting — Feature Test Guide

Every shipped feature across Phases 1–8, written as **Given / When / Then** so it
can be checked by hand. Scenarios describe behaviour that is actually built and
verified in the suite — not the roadmap's aspirations. Where something is
deliberately *not* built, it is listed under **Not built** at the end of its
phase rather than dressed up as testable.

> **New to the app? Start with [WALKTHROUGH.md](WALKTHROUGH.md)** — a step-by-step
> operator's guide that walks the *whole* business end to end (onboard → hire →
> deliver → bill), with all credentials at the top. This file is the pass/fail
> checklist; the walkthrough is the guided tour.

---

## Setup — do this once

Pick whichever way you prefer to run it:

**A. Local dev (fastest for testing features)** — needs a local Postgres:
```bash
npm run db:setup          # migrate + seed roles, permissions, bootstrap CEO
npm run db:seed:demo      # one demo account per role (dev/test only)
npm run db:seed:holidays  # public holidays, so leave counting is correct
npm run dev               # http://localhost:3000  → sign in at /login
```

**B. Full Docker stack (mirrors production)** — no local Postgres needed; brings
up the app, database, and the Caddy router with all three sites (see DEPLOY.md):
```bash
docker compose -f docker/docker-compose.local.yml up -d --build
# → http://consulting.qonicsystems.localhost   (the app — sign in here)
# → http://qonicsystems.localhost              (the umbrella site)
```
Migrations and role/permission seeding run automatically on first boot. Note the
Docker stack seeds **only the bootstrap CEO**, not the six demo accounts below —
for the full role matrix, use option A (or run `db:seed:demo` inside the app
container: `docker compose -f docker/docker-compose.local.yml exec app npx tsx prisma/seed-demo.ts`).

**Demo accounts** (all share the password `Demo-Passw0rd-2026`):

| Sign in as | Email | Role | Rank |
|---|---|---|---|
| Founder | `founder@qonicsystems.com` | CEO & Founder — super admin | 0 |
| Priya Raman | `cofounder@qonicsystems.com` | Co-Founder | 10 |
| Ananya Sharma | `hr@qonicsystems.com` | Employee, with recruitment overrides | 50 |
| Neha Kulkarni | `lead-dev@qonicsystems.com` | Employee | 50 |
| Rahul Mehta | `backend-dev@qonicsystems.com` | Employee | 50 |
| Sana Iqbal | `cloud-dev@qonicsystems.com` | Employee | 50 |
| Arjun Nair | `developer@qonicsystems.com` | Employee | 50 |

> The separate HR, Accounts and Projects roles were retired in the platform
> refactor; `prisma/seed-demo.ts` now grants the HR account its extra capabilities
> as **per-user overrides** instead. Scenarios below that still say "as HR" mean
> that account.

> All accounts use the parent-company domain **@qonicsystems.com** (Qonic
> Consulting is a vertical of Qonic Systems). In the Docker stack the bootstrap
> CEO is `founder@qonicsystems.com` / `Local-Test-Password-2026`.
>
> The **bootstrap CEO** is created from `BOOTSTRAP_CEO_*` only when the user table
> is empty, and must change its password at first login. The demo seed skips that
> so you can sign straight in. "Rank" is the escalation guard: **lower is more
> senior**, and you may only act on people of a strictly higher rank number.

Legend: 🟢 covered by an automated test · ⚪ manual check only.

---

## Phase 1 — Foundation (auth, sessions, RBAC, admin console)

### 1.1 Single login for every role 🟢
- **Given** I am signed out
- **When** I open `/login` and enter a valid email and password
- **Then** I land in the portal at `/dashboard`, and the same page signs in every
  role — there is no separate admin login.

### 1.2 Wrong credentials don't reveal whether the email exists 🟢
- **Given** I am at `/login`
- **When** I submit a wrong password for a real account, **or** any password for
  an address that does not exist
- **Then** both return the **same** message, "Email or password is incorrect.",
  with no field-level hint — an unknown email is never distinguishable from a
  wrong password.

### 1.3 Portal pages are protected 🟢
- **Given** I am signed out
- **When** I request `/dashboard` (or any portal URL) directly
- **Then** I am redirected to `/login?next=/dashboard`, and after signing in I
  land on the page I originally asked for.

### 1.4 The `next` parameter cannot be an open redirect 🟢
- **Given** I am signed out
- **When** I visit `/login?next=https://evil.com` and sign in
- **Then** I am sent to `/dashboard`, not off-site — only paths beginning with a
  single `/` are honoured.

### 1.5 A CEO capability toggle takes effect on the next request 🟢
- **Given** I am the Founder in **Administration → Roles & Permissions**, and an
  Employee is signed in elsewhere
- **When** I turn **off** a capability for the Employee role
- **Then** the Employee's **very next page load** loses the control and its API
  returns 403 — nothing waits for them to sign out. (This is the whole reason
  sessions live in the database rather than a JWT.)

### 1.6 The CEO can never lock themselves out 🟢
- **Given** I am the Founder (super admin)
- **When** any capability is switched off for my own role
- **Then** I still have it — super-admin bypasses the toggle matrix entirely, so
  the toggles can disable others but never the CEO.

### 1.7 Changing a password ends other sessions ⚪
- **Given** I am signed in on two devices
- **When** I change my password on `/profile/security`
- **Then** the other device is signed out; the device I changed it on stays in.

### 1.8 Every privileged action is audited 🟢
- **Given** I am the Founder
- **When** I change a role toggle, edit a user, or purge the log
- **Then** an entry appears in **Administration → Audit log** naming the actor,
  the action, and the before/after.

### 1.9 Marketing site is unchanged by the portal 🟢
- **Given** the portal exists behind `/login`
- **When** I visit the public pages (`/`, `/about`, `/industries`, `/services`,
  `/careers`, `/contact`, `/privacy`, `/terms`)
- **Then** each returns 200 with the public header/footer, and the contact form
  still submits — no portal chrome leaks in. The header carries a **"Sign In"**
  link to `/login` (and a mobile equivalent); portal-only navigation never appears.

---

## Phase 2 — Contract letters & people management

### 2.1 HR drafts, leadership releases 🟢
- **Given** I am HR at `/contracts/new`
- **When** I draft a letter and submit it for release
- **Then** it moves `DRAFT → PENDING_RELEASE`; **HR cannot release it**, and it
  now awaits the CEO or Co-Founder.

### 2.2 CEO / Co-Founder releases; the PDF appears 🟢
- **Given** a letter is `PENDING_RELEASE` and I am the Founder or Co-Founder
- **When** I release it
- **Then** it becomes `RELEASED`, the subject employee can download the PDF, and
  the letterhead shows **both brands** — Qonic Consulting (the issuing vertical)
  on the left, "A venture of QONIC systems" (the parent) on the right — plus the
  releaser's signature (the CEO's, when the CEO released it). Invoice PDFs carry
  the same two-brand letterhead.

### 2.3 Nobody releases their own letter — including the CEO 🟢
- **Given** a letter whose author/subject is me, sitting at `PENDING_RELEASE`
- **When** I try to release, reject, or revoke it
- **Then** it is refused — segregation of duties holds even for the super admin.

### 2.4 Released wording is frozen 🟢
- **Given** a `RELEASED` letter
- **When** anyone tries to edit its content
- **Then** editing is blocked (only `DRAFT`/`CHANGES_REQUESTED` are editable), and
  two downloads are byte-identical apart from the PDF timestamp/id.

### 2.5 A revoked letter looks revoked 🟢
- **Given** a `RELEASED` letter and I am the Founder (revoke is CEO-only)
- **When** I revoke it
- **Then** the PDF shows a **REVOKED** banner and carries **no signature**, so a
  withdrawn document cannot pass as a live authorisation.

### 2.6 Download is permission-checked 🟢
- **Given** a released letter belonging to another employee
- **When** I (an unrelated Employee) request its PDF URL
- **Then** I get 404 — a letter is visible only to its subject and those with the
  right to view it.

### 2.7 HR may edit only juniors; CEO may edit/deactivate/remove anyone 🟢
- **Given** the people list
- **When** HR opens an Employee vs. a peer-ranked Accounts user
- **Then** HR can edit the Employee but is offered **no** action on the peer;
  the Founder can edit, deactivate, and remove anyone. The table never shows an
  action the server would refuse.

### 2.8 Deactivating blocks sign-in immediately 🟢
- **Given** an active Employee signed in elsewhere
- **When** the Founder deactivates them
- **Then** their sessions are revoked and they cannot sign back in.

### 2.9 Removal is refused when paperwork exists ⚪
- **Given** a user who has contract letters on record
- **When** the Founder tries to remove (not deactivate) them
- **Then** removal is refused — the paperwork is a legal record; deactivate instead.

### 2.10 Nobody escalates their own rank 🟢
- **Given** I hold `user.manage` but am not super admin
- **When** I try to assign a role at or above my own rank, or grant super-admin
- **Then** it is refused — you may only administer strictly-more-junior people and
  assign strictly-more-junior roles.

### 2.11 Profile photo by URL only, `https` only ⚪
- **Given** my profile
- **When** I set a photo to an `http:`, `javascript:`, or `data:` URL
- **Then** it is rejected; only `https` links are stored, and a broken link falls
  back to my initials. **Nothing is uploaded.**

### 2.12 Forgot password can't enumerate accounts ⚪
- **Given** the reset form
- **When** I request a reset for an unknown address
- **Then** the response is identical to a known one; a completed reset (1-hour,
  single-use token) destroys every existing session.

### 2.13 Active-session list 🟢
- **Given** I am signed in on several devices, on `/profile/security`
- **When** I choose "sign out of other devices"
- **Then** the others end and my current session stays alive.

### 2.14 People refuses a Candidate Pool role ⚪
- **Given** Employee, whose `Role.viaCandidatePool` is true
- **When** I try to create a person in it from Administration → People, or edit an
  existing person into it
- **Then** both are refused with a 422 naming the Candidate Pool. The dialogs omit
  the option entirely, but the refusal is server-side — forging the request past
  the dropdown fails the same way.
- **And** an existing Employee is still editable for name, email, phone, job title
  and tech stack, because the guard is gated on the role actually changing.

### 2.15 The CEO creates a role at runtime ⚪
- **Given** Administration → People → Roles
- **When** I create "Legal & Compliance" at rank 20
- **Then** the role exists with a server-derived key, `isSystem: false`,
  `isSuperAdmin: false`, and one disabled toggle per permission — it appears
  immediately as a new column in Roles & Permissions and as an option in the
  People role picker.
- **And** `npm run db:seed` afterwards **leaves it intact**: `pruneRetiredRoles()`
  only deletes `isSystem: true` roles the code no longer defines.
- **And** rank 0 is refused (it is the CEO tier), a colliding key is suffixed
  rather than rejected, and nobody may create a role at or above their own rank.

### 2.16 Deleting a role is permanent ⚪
- **Given** any role nobody holds, built-in included
- **When** I delete it
- **Then** it is gone, and `npm run db:seed` does **not** bring it back — the
  delete writes a `RetiredRole` tombstone the seed consults before recreating
  anything from `SEEDED_ROLES`. Creating the same key again lifts the tombstone.
- **And** a role somebody still holds is refused, naming how many accounts hold
  it — deliberately *not* reassigning them, unlike the deploy seed's unattended
  prune — as is the super-admin role.
- **And** changing a role's rank signs its holders out and notifies them, while a
  rename does not.

---

## Phase 3 — HR operations

### 3.1 Employee records & reporting line ⚪
- **Given** the Founder or HR editing a person
- **When** I set DOB, joining/leaving dates, address, emergency contact, and a
  manager
- **Then** they save, and the manager appears as a reporting line in the directory.

### 3.2 Leave balance moves with the approval 🟢
- **Given** an employee with an Annual balance of 24 and a pending 3-day request
- **When** their approver approves it
- **Then** the balance drops to 21 **in the same transaction** — approval and
  balance can never disagree; a rejected request deducts nothing.

### 3.3 Working days exclude weekends *and* public holidays 🟢
- **Given** `db:seed:holidays` has run
- **When** an employee requests Mon–Fri across Republic Day (26 Jan)
- **Then** 4 days are deducted, not 5.

### 3.4 Bad leave requests are refused 🟢
- **Given** the leave form
- **When** I request a weekend-only range, a range overlapping an existing request,
  or more than my remaining allowance
- **Then** each is rejected with a reason.

### 3.5 Nobody approves their own leave 🟢
- **Given** I am an approver with my own pending request
- **When** I try to approve it
- **Then** it is refused; `leave.approve` covers direct reports, `leave.manage`
  covers everyone, but never oneself.

### 3.6 A decided request can't be re-decided 🟢
- **Given** an already-approved (or rejected) request
- **When** anyone tries to decide it again
- **Then** it is refused, and no second notification is written.

### 3.7 Bank details are encrypted at rest 🟢
- **Given** an employee's bank details are saved
- **When** the row is read directly from the database
- **Then** the value is AES-256-GCM ciphertext; tampering is detected on decrypt
  rather than returning altered plaintext.

**Not built:** attendance / working-hours tracking, onboarding/offboarding checklists.

---

## Phase 4 — Delivery: clients, projects, timesheets

### 4.1 Create a client and project ⚪
- **Given** I hold `client.manage` / `project.manage`
- **When** I create a client (short code, industry, owner) then a project under it
- **Then** the project is namespaced by client code (e.g. `NWT-WH-01`) and comes
  with a "General" task and the manager assigned, so time can be booked at once.

### 4.2 Time only against assigned projects 🟢
- **Given** I am not assigned to a project
- **When** I try to book time to it
- **Then** it is refused — time is accepted only against projects I'm on.

### 4.3 Submitting locks the week; approving locks permanently 🟢
- **Given** a `DRAFT` weekly timesheet
- **When** I submit it, then my manager approves it
- **Then** submission locks it from edits and approval locks it for good;
  a rejection (with a written reason) sends it back to `DRAFT`.

### 4.4 Nobody approves their own timesheet 🟢
- **Given** my own submitted timesheet
- **When** I try to approve it
- **Then** it is refused, whatever I hold — time drives invoicing.

### 4.5 Entry guards 🟢
- **Given** the weekly grid
- **When** I enter a day outside the week, more than 16h on one day, or an
  unparseable duration
- **Then** it is refused. `7.5`, `7:30`, and `450m` all parse to **450 minutes**
  (time is stored as integer minutes).

### 4.6 Deleting a client with history is refused ⚪
- **Given** a client that has projects, jobs, or invoices
- **When** I try to delete it
- **Then** it is refused — archive instead. Removing an assignee is likewise
  blocked once they have booked time.

---

## Phase 5 — Recruitment / ATS

### 5.1 Pipeline moves one step forward at a time 🟢
- **Given** a candidate at `Sourced`
- **When** I try to jump straight to `Offer`
- **Then** it is refused; forward moves are one stage at a time, but moving
  **back** is allowed (candidates genuinely re-interview).

### 5.2 PLACED is unreachable by a stage move 🟢
- **Given** a candidate at `Offer`
- **When** I try to set the stage to `Placed` directly
- **Then** it is refused — placement goes through the placement flow, which
  captures salary and fee.

### 5.3 Scheduling an interview advances the stage 🟢
- **Given** a candidate at `Submitted`
- **When** I schedule an interview (panel, kind, duration)
- **Then** the stage advances to `Interview` automatically; a 1–5 scorecard is
  available afterwards.

### 5.4 Placement fee is stamped 🟢
- **Given** I record a placement
- **When** the client's fee policy later changes
- **Then** the booked fee is unchanged — it was computed and stored at placement.
  Filling every opening auto-closes the requisition.

### 5.5 Rejections need a reason 🟢
- **When** I reject or withdraw a candidate
- **Then** a written reason is required.

### 5.6 Public careers page is a narrow write 🟢
- **Given** the public `/careers` page (unauthenticated)
- **When** an applicant submits against a **published** job with consent ticked
- **Then** exactly one candidate + one application are created; a re-application
  never overwrites a recruiter's notes; **draft/unpublished roles 404 to the public**.

**Not built:** interview scheduling **calendar UI** (the API and scorecard model
exist; the portal exposes the pipeline, not a calendar).

---

## Phase 6 — Finance

### 6.1 Invoice generated from approved time 🟢
- **Given** approved, billable timesheet lines
- **When** I generate an invoice for the client
- **Then** there's one line per person at their assigned rate; **draft time is
  never pulled**, and the billed time is stamped so it can't be invoiced twice.

### 6.2 Voiding releases the time again 🟢
- **Given** an invoice raised from timesheets, with no payment yet
- **When** I void it
- **Then** its hours become billable again; voiding is **blocked once a payment
  exists** — use a credit note instead.

### 6.3 Payments can't exceed the invoice 🟢
- **Given** an invoice
- **When** I record a payment larger than the balance
- **Then** it is refused; status (`Sent → Part paid → Paid`) moves in the same
  transaction as the payment, so an invoice never disagrees with its payments.

### 6.4 Credit notes are capped 🟢
- **Given** an invoice with payments
- **When** I raise credit notes
- **Then** cumulative credits can never exceed the invoice total.

### 6.5 Nobody approves their own expense 🟢
- **Given** my own submitted expense claim
- **When** I try to approve it at `/expenses/approvals`
- **Then** it is refused; future-dated claims are refused, and rejections need a
  reason.

### 6.6 Money is integer minor units 🟢
- **Given** a 7.5-hour line
- **When** the invoice totals
- **Then** the quantity is exactly `750` (hundredths of an hour), money is in
  paise, and each line rounds **once**, at the end.

### 6.7 Revenue report & ageing ⚪
- **Given** invoices, payments, and placements exist
- **When** I open `/reports/revenue`
- **Then** I see billed, collected, outstanding, receivables ageing
  (current / 1-30 / 31-60 / 61-90 / 90+), and fees by recruiter.

### 6.8 Accounting CSV export is injection-safe 🟢
- **When** I export invoices/payments/expenses/time/audit as CSV
- **Then** any cell beginning `=`, `+`, `-`, or `@` is quoted, so a spreadsheet
  can't execute it as a formula.

**Not built:** payroll & payslips, purchase orders, subcontractors.

---

## Phase 7 — Intelligence & reach

### 7.1 Notifications are transactional 🟢
- **Given** a leave/timesheet/contract/expense decision
- **When** the decision is made (and committed)
- **Then** the in-app notification is written **in the same transaction** — a
  rolled-back or re-decided action leaves **no phantom notification**.

### 7.2 Global search is permission-scoped 🟢
- **Given** two users with different permissions
- **When** each searches the same term
- **Then** each sees only records they're allowed to see — every branch (people,
  clients, projects, jobs, candidates, invoices, letters) is gated on the
  searcher's own permissions.

**Not built (needs an external service):** client portal; scheduled report emails.

**Removed:** the Analytics, Utilisation, Capacity and Deal Financials reports.
The Revenue report (§6.7) is the only one that remains, and now lives under
Finance rather than a Reports group of its own.

**Removed:** Administration → Rate Management, along with the `ResourceDeal`
table it maintained and the payout-reclassification override on
`PayoutLedgerEntry`. Payout categories are still computed and frozen when a
timesheet is approved, and **My Earnings** still shows them — there is simply no
longer a screen that can override one after the fact. `ProjectAssignment.rate`
and `.startedOn` survive as columns because invoicing and payout categorisation
still read them, but nothing sets them any more: new assignments fall back to
`Project.defaultRate` and to the assignment's `createdAt`.

---

## Phase 8 — Scale & compliance

### 8.1 TOTP two-factor 🟢
- **Given** `/profile/security`
- **When** I enrol in TOTP (two-step, so an abandoned setup can't lock me out)
  and sign in again
- **Then** a valid 6-digit code is required; the implementation is checked against
  the **official RFC 4226/6238 test vectors**.

### 8.2 Recovery codes are single-use 🟢
- **Given** TOTP is on and I have recovery codes
- **When** I use one, then try the same code again
- **Then** the replay is rejected (codes are stored hashed); failed codes count
  toward lockout, and disabling 2FA requires the **password**, not just a session.

### 8.3 Encrypted fields detect tampering 🟢
- **Given** an encrypted TOTP secret or bank detail
- **When** the ciphertext is altered in the database
- **Then** decryption **fails** rather than returning altered plaintext (AES-256-GCM
  is authenticated).

### 8.4 GDPR export excludes credentials 🟢
- **When** I export a subject's data as JSON
- **Then** it contains their records but **not** the password hash — exporting it
  would create exposure, not satisfy a right.

### 8.5 Erasure anonymises, doesn't delete 🟢
- **Given** a person with financial/contractual history
- **When** the right to erasure is exercised
- **Then** the records survive but no longer identify anyone.

**Not built (needs a provider decision):** SSO (Google/Entra), e-signature
(DocuSign/Zoho), multi-entity/multi-currency, performance reviews / OKRs / PWA.

---

## Running the automated coverage

```bash
npm test           # 282 unit + component tests
npm run test:e2e   # 25 end-to-end (Playwright) — needs: npm run db:setup:test
```

The 🟢 scenarios above map onto those suites; the ⚪ ones are worth a manual pass
because they're either UI-shaped or need seeded business data to be meaningful.
