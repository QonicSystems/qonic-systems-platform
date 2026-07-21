# QONIC — Complete Operator's Walkthrough

A step-by-step tour of the whole platform, the way a CEO would actually run it:
onboard the team, draft and release contracts, hire through the pipeline, deliver
projects, bill clients, and check the numbers. Follow it top to bottom as one
connected story, or jump to any part.

> This is the **how to use it** guide. Its companion, [FEATURE.md](FEATURE.md), is
> the **how to verify it** guide — the same features as pass/fail Given/When/Then
> checks. Nothing here replaces that; they sit side by side.

---

## 🔑 Credentials — everything you need to sign in

**All six accounts use the password:** `Demo-Passw0rd-2026`

| Sign in as | Email | Role | Can do… |
|---|---|---|---|
| **You (CEO)** | `founder@qonicsystems.com` | CEO & Founder | **Everything** (super admin) |
| Priya | `cofounder@qonicsystems.com` | Co-Founder | Release contracts, most operations |
| Neha | `hr@qonicsystems.com` | HR | People, leave, draft contracts |
| Rahul | `accounts@qonicsystems.com` | Accounts | Invoices, payments, expenses |
| Sana | `projects@qonicsystems.com` | Projects | Clients, projects, timesheet approval |
| Arjun | `developer@qonicsystems.com` | Employee | Own timesheet, leave, profile |

**Where to sign in:**
- Docker stack (what's running now): **http://consulting.qonicsystems.localhost** → *Sign In*
- Local dev: **http://localhost:3000**

**Tip:** to see the whole flow, open **two browser windows** — a normal one signed
in as the CEO, and an Incognito/private one signed in as HR or the Employee. Then
you can watch an action by one role appear for another (a submitted timesheet
showing up for its approver, a released letter appearing for the employee, etc.).

> **How these accounts got here:** the CEO is the bootstrap account; the other five
> are demo accounts. In a real production deployment only the CEO exists at first —
> **you create everyone else through the app**, which is exactly Part 2 below.

---

## The layout — where things live

After signing in you land on the **Dashboard**. The top navigation is grouped:

| Menu | Contains | For |
|---|---|---|
| **Dashboard** | Your access summary | Everyone |
| **My Work** | Timesheets · Leave · Expenses · Contract Letters | Your own records |
| **Delivery** | Clients · Projects · Timesheets | Running client work |
| **Recruitment** | Jobs · Candidates | Hiring |
| **Finance** | Invoices · Expense Claims | Money |
| **Reports** | Analytics · Utilisation · Capacity · Revenue | The numbers |
| **Directory** | The team | Everyone |
| **Administration** | People · Roles & Permissions · Audit log | CEO / super admin |

Top-right: a **global search** (only ever shows what your role may see), a
**notifications** bell, and your **profile** menu (avatar).

> **The golden rule of this app: it branches on *permissions*, not job titles.**
> What you can see and do is the set of capabilities switched on for your role —
> which the CEO controls at runtime (Part 1). Your Dashboard always lists exactly
> what you currently hold under **"Your access."**

---

## Part 1 — The CEO's control room

**Sign in as the CEO** (`founder@qonicsystems.com`).

### 1.1 First look
Your Dashboard shows headline counts and a grid of capability cards under
**"Your access"** — as super admin you hold them all, and they can never be
switched off for you.

### 1.2 The permission matrix — switch features on and off
Open **Administration → Roles & Permissions** (`/admin/permissions`).

This is the heart of the "CEO can enable or disable functionality" requirement.
You see a grid of **roles × capabilities**, each a toggle.

**Try it:** turn **off** a capability for the Employee role (e.g. "Record time"),
then — in your Incognito window signed in as Arjun the Employee — reload. The
Timesheets control is gone and the API refuses it. **It takes effect on his very
next page load**, not whenever his session expires. Turn it back on when done.

### 1.3 The audit log
Open **Administration → Audit log** (`/admin/audit`). Every privileged action —
your toggle just now, every user edit, every contract release — is recorded with
who/when/before/after. As super admin you also get a **Purge log** button
(high-friction: it needs your password and a typed confirmation, and keeps a
minimum retention window).

---

## Part 2 — HR: build the team

Now you'll add people. In real life HR does this; the CEO can too.
**Sign in as HR** (`hr@qonicsystems.com`) — or stay as CEO.

### 2.1 Add an employee
Open **Administration → People** (`/admin/users`) → **add a user**. Create:

- Name: **Anusha Kherwal**, email `anusha@qonicsystems.com`, role **Employee**
- Job title, phone, and a **photo URL** (a link to an `https` image — nothing is
  uploaded; a broken link just falls back to initials)

> **Rank guard in action:** HR can create and edit people *junior* to HR, but not
> peers or seniors. As HR you can edit Anusha (Employee); you'll find no edit
> action on Rahul (Accounts, same rank) — the table only ever offers what the
> server would actually allow. Only the **CEO** can edit/deactivate/**remove** anyone.

### 2.2 Fill in the employee record
Open Anusha's profile and add the HR details: date of birth, joining date, home
address, **emergency contact**, a **manager** (this builds the org chart / reporting
line shown in the Directory), and **bank details** (stored **encrypted** — if you
looked in the database you'd see ciphertext, not the account number).

### 2.3 Leave management
Open **My Work → Leave** (`/leave`).

- **As the Employee (Arjun):** request leave — say Mon–Fri next week. Weekends
  **and public holidays** are excluded automatically (a week spanning a holiday
  deducts 4 days, not 5). Overlapping or over-allowance requests are refused.
- **As the approver (HR/manager):** approve it. The **balance drops in the same
  transaction as the approval** — the two can never disagree. **Nobody approves
  their own leave.** A decided request can't be re-decided.

---

## Part 3 — Contract letters (HR drafts → leadership releases)

This is the signature workflow: **HR prepares, leadership signs off, nobody signs
their own.**

### 3.1 HR drafts
**As HR**, open **My Work → Contract Letters** (`/contracts`) → **new**
(`/contracts/new`).

- Pick a **template** (employment contract, offer, increment, experience,
  relieving, or confidentiality — six share one engine)
- Choose the subject (**Anusha**), fill the details (title, start date, salary…)
- Save as **DRAFT**, then **Submit for release** → it becomes **PENDING_RELEASE**.

HR **cannot** release it — it now waits for leadership.

### 3.2 CEO / Co-Founder releases
**As the CEO** (or Co-Founder), open the letter. You can **Request changes** (back
to HR) or **Release** it → **RELEASED**.

- **Segregation of duties:** you can't release a letter where you're the author or
  the subject — not even as CEO.
- On release the PDF becomes available. Its letterhead now shows **both brands** —
  **Qonic Consulting** (left) and **"A venture of QONIC systems"** (right) — plus
  the **releaser's signature** (the CEO's signature image, when the CEO released it).

### 3.3 Employee acknowledges & downloads
**As the Employee**, open Contract Letters — you see only **your own** letters.
Open the released one, **Acknowledge** it (→ ACKNOWLEDGED), and **Download** the PDF.

- Its wording is **frozen** — editing is blocked once released; two downloads are
  byte-identical. A **revoked** letter (CEO only) shows a REVOKED banner and carries
  **no signature**.

---

## Part 4 — Recruitment: hire through the pipeline

**Sign in as CEO or Projects/Recruiter.** Menu: **Recruitment**.

### 4.1 Open a job requisition
**Jobs** (`/jobs`) → create one: reference, client, salary band, number of
openings, placement fee %, and a time-to-fill SLA (ageing requisitions get
flagged). **Publish** it to make it live on the public careers page.

### 4.2 Add candidates and move them along
**Candidates** (`/candidates`) → add **Jordan Lee**: CV and LinkedIn **links**
(nothing uploaded), skills, source, and a recorded **consent** timestamp.

Open the candidate's application and walk the **pipeline**:

`Sourced → Screened → Submitted → Interview → Offer → Placed` (plus Rejected / Withdrawn)

- **One step forward at a time** — you can't skip Screened to make it look like
  vetting happened. Moving **back** is allowed (candidates re-interview).
- **Scheduling an interview** (panel, kind, duration) advances the stage
  automatically, and you can leave a **1–5 scorecard** afterwards.
- Rejections/withdrawals need a written **reason**.

### 4.3 Record the placement
**PLACED is not a stage move** — it goes through the **placement** flow, which
captures the salary and computes the **fee**. The fee is **stamped** (a later
change to the client's fee policy can't rewrite booked revenue). Filling every
opening **auto-closes** the requisition.

### 4.4 The public side
Open the umbrella's careers path (the public `/careers` page on the marketing
site). An outside applicant can submit against a **published** job (consent
required) — that's the one place the public can write, and it can only ever create
a candidate + one application. Draft/unpublished roles are 404 to the public.

---

## Part 5 — Delivery: clients, projects, timesheets

**Sign in as Projects (Sana) or CEO.** Menu: **Delivery**.

### 5.1 Create a client and a project
- **Clients** (`/clients`) → new: **Northwind Corporate** — short code (e.g. `NWT`),
  industry, and an **account owner**.
- **Projects** (`/projects`) → new under Northwind: **Warehouse Modernisation**.
  It's namespaced by client code (e.g. `NWT-WH-01`), with a status, **billing model**
  (T&M / fixed / retainer / non-billable), budget, and a default **charge-out rate**.
  Creating it auto-adds a "General" task and assigns the manager, so time can be
  booked immediately.
- **Assign the team:** add **Anusha** at a stated allocation %.

### 5.2 The Employee logs time
**As Anusha**, open **My Work → Timesheets** (`/timesheets`). Fill the weekly grid
(one row per project+task, seven day columns) against the Northwind project.

- You can only book time to projects you're **assigned** to.
- `7.5`, `7:30`, and `450m` all mean the same **450 minutes** (time is stored as
  whole minutes, never fractional hours).
- Guards: entries must fall inside the week, ≤ 16h on a day, durations must parse.
- **Submit** → the week **locks** (`DRAFT → SUBMITTED`).

### 5.3 The manager approves
**As the manager (Sana/CEO)**, open the submitted week and **Approve** it
(`→ APPROVED`, locked permanently) or **Reject** with a written reason (back to
DRAFT). **Nobody approves their own timesheet** — time drives billing.

### 5.4 See utilisation & capacity
**Reports → Utilisation** and **Capacity**. Note **billable ratio** ("of time
booked, how much is chargeable") and **utilisation** ("of a 40-hour week, how much
was chargeable") are deliberately **different numbers**; the Capacity report flags
the bench and anyone over-allocated.

---

## Part 6 — Finance: bill the client, pay the team

**Sign in as Accounts (Rahul) or CEO.** Menu: **Finance**.

### 6.1 Invoice from approved time
**Invoices** (`/invoices`) → generate from **approved** timesheets for Northwind.

- One line per person at their assigned rate. **Only APPROVED billable time** is
  pulled — a draft timesheet is nobody's claim yet.
- The billed hours are **stamped**, so the same time can't be invoiced twice.
- The invoice PDF carries the same **two-brand letterhead** as the letters.
- Lifecycle: **Draft → Sent → Part paid → Paid**.

### 6.2 Record payment
Record a payment against the invoice. **Over-payment is refused**, and the status
moves in the **same transaction** as the payment — an invoice can never disagree
with its own payments. **Voiding** releases the billed time again, but is **blocked
once a payment exists** — use a **credit note** instead (cumulative credits can
never exceed the invoice total).

### 6.3 Expenses
**As an Employee**, open **My Work → Expenses** (`/expenses`) → submit a claim
(category, receipt **link**, optional project, rebillable flag). Future-dated
claims are refused.

**As an approver**, open **Finance → Expense Claims** (`/expenses/approvals`) and
approve → reimburse. **Nobody approves their own claim** (the classic expense
fraud); rejections need a reason.

### 6.4 The revenue picture
**Reports → Revenue** (`/reports/revenue`): billed, collected, outstanding,
**receivables ageing** (current / 1-30 / 31-60 / 61-90 / 90+), placements, and fees
by recruiter. Accounting **CSV export** is available and injection-guarded (a cell
starting `=`, `+`, `-`, `@` is quoted, so a spreadsheet can't run it).

---

## Part 7 — Intelligence & reach

- **Notifications** (🔔): written in the *same transaction* as the event they
  describe, so a rolled-back or re-decided action never leaves a phantom "your
  leave was approved."
- **Global search** (top bar): searches people, clients, projects, jobs, candidates,
  invoices, and letters — but **every result is gated on your own permissions**, so
  it can't leak what your role shouldn't see. (Sign in as the Employee and search
  the same term the CEO did — you'll get far less.)
- **Reports → Analytics** (`/reports/analytics`): median time-to-fill, the
  recruitment funnel with stage-to-stage conversion, revenue mix, billable share,
  and rolling-year attrition.

---

## Part 8 — Security & compliance

- **Two-factor (TOTP):** **Profile → Security** (`/profile/security`). Enrol
  (two-step, so an abandoned setup can't lock you out), scan the QR into an
  authenticator, and confirm. You get single-use **recovery codes** (a spent code
  is rejected on replay). Disabling 2FA requires your **password**.
- **Active sessions:** the same page lists your devices with "sign out of other
  devices" (keeps your current one). Changing your password also ends other sessions.
- **GDPR:** export a person's data as JSON (**excludes** the password hash), and the
  right to erasure **anonymises** rather than deletes — financial and contractual
  records survive but no longer identify anyone.

---

## 🎬 The golden path — one connected story

If you only do one run-through, do this. It exercises the whole loop and every role.

1. **CEO** → confirm your access on the Dashboard; peek at the permission matrix.
2. **HR** → add employee **Anusha**; fill her record; set her manager.
3. **Employee (Anusha)** → request a day of leave. **HR** → approve it.
4. **HR** → draft Anusha's **employment contract**; submit it.
5. **CEO** → **release** it. **Anusha** → acknowledge and **download the PDF**
   (note both brands + the signature).
6. **Projects** → create client **Northwind Corporate** and project **Warehouse
   Modernisation**; assign Anusha.
7. **Anusha** → log a week of time on the project; **submit**.
8. **Projects/CEO** → **approve** the timesheet.
9. **Accounts** → **generate an invoice** from that approved time; mark it **Sent**;
   **record a payment** → watch it go **Paid**.
10. **Recruiter/CEO** → open a **job**, add candidate **Jordan Lee**, move them
    through the pipeline, schedule an interview, and **record a placement**.
11. **CEO** → open **Reports → Revenue** and **Analytics** and see the invoice,
    payment, placement, and utilisation all reflected.
12. **CEO** → open the **Audit log** and see every privileged step you just took.

That's the business, end to end: hire → onboard → deliver → bill → get paid →
recruit → measure — with the paperwork and the money reconciled at every step.

---

## Appendix A — Route map

```
/dashboard              Your access summary
/directory              Team directory + reporting lines
/profile                Your profile        /profile/security   2FA, sessions, password
/notifications          In-app inbox
My Work   → /timesheets  /leave  /expenses  /contracts (/contracts/new)
Delivery  → /clients  /projects  /timesheets
Recruitment → /jobs (/jobs/[id])  /candidates
Finance   → /invoices  /expenses/approvals
Reports   → /reports/analytics  /reports (utilisation)  /reports/capacity  /reports/revenue
Admin     → /admin  /admin/users  /admin/roles  /admin/permissions  /admin/audit
```

## Appendix B — Who can do what (defaults)

| Capability | CEO | Co-Founder | HR | Accounts | Projects | Employee |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Super-admin bypass | ✅ | | | | | |
| Enable/disable role capabilities | ✅ | | | | | |
| Edit / deactivate / remove any user | ✅ | | | | | |
| Edit **junior** users | ✅ | ✅ | ✅ | | | |
| Draft contract letters | ✅ | | ✅ | | | |
| **Release** contract letters | ✅ | ✅ | | | | |
| **Revoke** contract letters | ✅ | | | | | |
| Clients / projects | ✅ | ✅ | | | ✅ | |
| Approve timesheets | ✅ | ✅ | | | ✅ | |
| Record own time / leave / expenses | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Jobs / candidates / placements | ✅ | ✅ | | | ✅ | |
| Invoices / payments / expense approval | ✅ | ✅ | | ✅ | | |
| Reports & analytics | ✅ | ✅ | | ✅ | ✅ | |

*Defaults only — the CEO can switch any of these on or off per role at runtime
(Part 1). The only things never toggleable are the super-admin bypass and the
rank-based escalation guard.*

---

## Resetting the sandbox

To wipe and start the local stack fresh (new database, re-seeded):
```bash
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d --build
# then re-seed the six demo accounts (dev override needed in the prod image):
docker compose -f docker-compose.local.yml exec -e NODE_ENV=development app npx tsx prisma/seed-demo.ts
docker compose -f docker-compose.local.yml exec app npx tsx prisma/set-password.ts founder@qonicsystems.com "Demo-Passw0rd-2026"
```
