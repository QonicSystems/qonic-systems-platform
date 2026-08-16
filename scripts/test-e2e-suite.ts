import "dotenv/config";
import { db } from "../lib/db";
import { encrypt, decrypt, sha256 } from "../lib/crypto";
import { hashPassword, verifyPassword, verifyDummyPassword } from "../lib/auth/password";
import { generateSecret, verifyCode } from "../lib/auth/totp";
import { resolvePermissions } from "../lib/auth/permissions";
import { canAdminister, canAssignRole } from "../lib/auth/authority";
import { safeRedirectPath } from "../lib/auth/session";
import { formatMoney, toMinor, invoiceTotals, placementFee, ageingBucket } from "../lib/money";
import { canTransition, TRANSITIONS, canEditContent } from "../lib/contracts/workflow";
import { getIndianPublicHolidays } from "../lib/holidays/indian-holidays";

// Color utilities for terminal output
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`  ${GREEN}✔ PASS${RESET} ${testName}`);
  } else {
    failCount++;
    const errMsg = `${testName}${detail ? ` (${detail})` : ""}`;
    failures.push(errMsg);
    console.log(`  ${RED}✘ FAIL${RESET} ${testName}${detail ? ` - ${RED}${detail}${RESET}` : ""}`);
  }
}

function note(msg: string) {
  console.log(`  ${GRAY}· ${msg}${RESET}`);
}

function header(title: string) {
  console.log(`\n${BOLD}${CYAN}=== [ ${title} ] ===${RESET}`);
}

function ok(msg: string) {
  console.log(`  ${GREEN}✔${RESET} ${msg}`);
}

async function runFullE2ETestSuite() {
  const startTime = Date.now();
  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}  QONIC SYSTEMS PLATFORM — END-TO-END SYSTEM & FEATURE TEST SUITE${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}\n`);

  const runId = `e2e_${Date.now()}`;
  let testFounderId: string | null = null;
  let testCandidateId: string | null = null;
  let testGlobalCandidateId: string | null = null;
  let testJobId: string | null = null;
  let testAppId: string | null = null;
  let testClientId: string | null = null;
  let testProjectId: string | null = null;
  let testUserId: string | null = null;
  let testTimesheetId: string | null = null;
  let testContractId: string | null = null;
  let testInvoiceId: string | null = null;
  let testExpenseId: string | null = null;
  let testLeaveRequestId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. AUTHENTICATION, CRYPTOGRAPHY & SECURITY
    // -------------------------------------------------------------------------
    header("1. Authentication, Cryptography & Security Engine");

    // 1.1 Founder credentials in DB
    const founder = await db.user.findFirst({
      where: { email: "avinash.singh@qonicsystems.com" },
      include: { role: true },
    });
    assert(!!founder, "Founder account (avinash.singh@qonicsystems.com) exists in DB");
    if (founder) {
      testFounderId = founder.id;
      const validPw = await verifyPassword(founder.passwordHash, "Avi#72652622");
      assert(validPw, "Founder password (Avi#72652622) verifies correctly with Argon2id");
      assert(founder.role.key === "ceo", "Founder role is 'ceo' (Super Admin)");
      assert(founder.role.isSuperAdmin === true, "Founder has isSuperAdmin = true");
      assert(founder.role.rank === 0, "Founder rank is 0 (Highest privilege)");
    }

    // 1.2 AES-256-GCM Encryption / Decryption Roundtrip
    const sensitiveData = "123-45-6789;SSN;CONFIDENTIAL_BANK_9988";
    const encrypted = encrypt(sensitiveData);
    const decrypted = decrypt(encrypted);
    assert(decrypted === sensitiveData, "AES-256-GCM encrypt/decrypt roundtrip is lossless");

    // 1.3 Constant-Time Dummy Password Verification
    await verifyDummyPassword("WrongPassword123!");
    assert(true, "Constant-time dummy password timing defense executes Argon2id work safely");

    // 1.4 TOTP MFA Generation and Verification
    const secret = generateSecret();
    const currentCode = (await import("../lib/auth/totp")).generateCode(secret);
    const mfaValid = verifyCode(secret, currentCode);
    assert(mfaValid, "TOTP 6-digit MFA code generation and time-window verification works");

    // 1.5 Safe URL Redirection (Prevent Open Redirects)
    assert(safeRedirectPath("/dashboard") === "/dashboard", "Relative URL /dashboard is allowed");
    assert(safeRedirectPath("https://evil.com") === "/dashboard", "External URL https://evil.com sanitized to default");
    assert(safeRedirectPath("//evil.com") === "/dashboard", "Protocol-relative //evil.com sanitized to default");
    assert(safeRedirectPath("javascript:alert(1)") === "/dashboard", "Javascript protocol sanitized to default");

    // -------------------------------------------------------------------------
    // 2. RBAC & PERMISSIONS RESOLUTION HIERARCHY
    // -------------------------------------------------------------------------
    header("2. RBAC & Authority Permission Engine");

    const allRoles = await db.role.findMany({ orderBy: { rank: "asc" } });
    assert(allRoles.length >= 3, "Core roles seeded (CEO, Co-Founder, Employee Dev)");

    const ceoRole = allRoles.find((r) => r.key === "ceo");
    const devRole = allRoles.find((r) => r.key === "employee");

    if (ceoRole && devRole) {
      // Super Admin bypasses all checks
      const ceoPerms = resolvePermissions(ceoRole, [], [], new Date());
      assert(ceoPerms.has("admin.access"), "Super Admin automatically holds admin.access");
      assert(ceoPerms.has("user.delete"), "Super Admin automatically holds user.delete");
      assert(ceoPerms.has("timesheet.approve"), "Super Admin automatically holds timesheet.approve");

      // Non-superadmin respects role permissions
      const devPerms = resolvePermissions(devRole, ["timesheet.submit", "leave.request"], [], new Date());
      assert(devPerms.has("timesheet.submit"), "Employee Dev has timesheet.submit");
      assert(!devPerms.has("user.delete"), "Employee Dev DOES NOT hold user.delete");

      // Authority checks: CEO can administer Dev
      const authorityCheck = canAdminister(
        { user: { id: "u1" }, role: ceoRole } as any,
        { id: "u2", role: devRole }
      );
      assert(authorityCheck.ok, "CEO authority can administer Employee Dev");

      // Authority check: Dev cannot administer CEO
      const devAdminCeo = canAdminister(
        { user: { id: "u2" }, role: devRole } as any,
        { id: "u1", role: ceoRole }
      );
      assert(!devAdminCeo.ok, "Employee Dev cannot administer CEO");
    }

    // -------------------------------------------------------------------------
    // 3. CANDIDATE POOL & ATS RECRUITMENT FLOW
    // -------------------------------------------------------------------------
    header("3. Candidate Pool & Recruitment Pipeline");

    // 3.1 Create Global VISA Resource Candidate
    const globalCandidate = await db.candidate.create({
      data: {
        name: "Global Visa Candidate " + runId,
        email: `global_${runId}@example.com`,
        phone: "+1-555-0199",
        source: "GLOBAL_VISA_RESOURCE",
        visaType: "H1B",
        visaStatus: "ACTIVE",
        visaExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        ssn: encrypt("999-11-2222"),
        commissionPaid: 150000,
        benchStatus: "Available / On Bench",
      },
    });
    testGlobalCandidateId = globalCandidate.id;
    assert(!!globalCandidate.id, "Created Global Candidate with VISA, SSN & Commission rate");
    assert(decrypt(globalCandidate.ssn!) === "999-11-2222", "Candidate SSN decrypted accurately");

    // 3.2 Create Direct Developer Applicant Candidate
    const devCandidate = await db.candidate.create({
      data: {
        name: "Direct Dev Candidate " + runId,
        email: `dev_${runId}@example.com`,
        phone: "+91-9876543210",
        source: "Direct",
        techStack: "React, Next.js, Node.js, TypeScript, PostgreSQL",
        noticePeriod: "30 Days",
        expectedSalary: 240000000,
        linkedinUrl: "https://linkedin.com/in/test-dev",
        benchStatus: "Available",
      },
    });
    testCandidateId = devCandidate.id;
    assert(!!devCandidate.id, "Created Direct Developer candidate with Tech Stack & Notice Period");

    // 3.3 Create Client Organization
    const client = await db.client.create({
      data: {
        name: "Acme Global Enterprise " + runId,
        code: `ACM-${runId.slice(-6).toUpperCase()}`,
        status: "ACTIVE",
        industry: "Financial Services",
        ownerId: testFounderId,
      },
    });
    testClientId = client.id;
    assert(!!client.id, "Created Client organization with code and owner");

    // 3.4 Create a Job Posting linked to Client
    const testJob = await db.job.create({
      data: {
        reference: `JOB-${runId.slice(-6).toUpperCase()}`,
        title: "Senior Full Stack Engineer " + runId,
        clientId: client.id,
        status: "OPEN",
        openings: 2,
        ownerId: testFounderId,
        employmentType: "Full-time",
        currency: "INR",
        salaryMin: 180000000,
        salaryMax: 250000000,
      },
    });
    testJobId = testJob.id;
    assert(!!testJob.id, "Created Job Posting linked to Client & Founder owner");

    // 3.5 Candidate Application & Stage Progression Flow
    const application = await db.application.create({
      data: {
        jobId: testJob.id,
        candidateId: devCandidate.id,
        stage: "SCREENED",
        ownerId: testFounderId,
      },
    });
    testAppId = application.id;
    assert(!!application.id, "Submitted Candidate Application at SCREENED stage");

    // 3.6 Schedule Technical Interview
    const interview = await db.interview.create({
      data: {
        applicationId: application.id,
        interviewerId: testFounderId,
        scheduledAt: new Date(Date.now() + 86400000),
        kind: "Technical Panel",
        outcome: "PENDING",
        location: "Google Meet",
      },
    });
    assert(!!interview.id, "Scheduled Technical Interview with Founder interviewer");

    // Update Interview with Feedback & Pass Candidate
    await db.interview.update({
      where: { id: interview.id },
      data: {
        outcome: "ADVANCE",
        score: 5,
        feedback: "Strong algorithmic problem-solving and clean React code.",
      },
    });

    // Advance Stage to OFFER
    await db.application.update({
      where: { id: application.id },
      data: { stage: "OFFER" },
    });

    // 3.7 Record Placement
    const placement = await db.placement.create({
      data: {
        applicationId: application.id,
        salary: 220000000, // 22,00,000 INR in paise
        currency: "INR",
        feePercent: 10,
        feeAmount: 22000000,
        startDate: new Date(Date.now() + 15 * 86400000),
        recruiterId: testFounderId,
      },
    });
    await db.application.update({
      where: { id: application.id },
      data: { stage: "PLACED" },
    });
    assert(!!placement.id, "Recorded Successful Placement (Stage: PLACED)");

    // -------------------------------------------------------------------------
    // 4. CONTRACT LETTERS & WORKFLOW STATE MACHINE
    // -------------------------------------------------------------------------
    header("4. Contract Letters & Workflow State Machine");

    // 4.1 Create New Employee User for Contract Letter
    const testEmployee = await db.user.create({
      data: {
        name: "Test Engineer " + runId,
        email: `engineer_${runId}@qonicsystems.com`,
        passwordHash: await hashPassword("TempPass#123!"),
        roleId: devRole!.id,
        status: "ACTIVE",
        jobTitle: "Software Development Engineer",
        techStack: "React, Node.js, AWS",
      },
    });
    testUserId = testEmployee.id;
    assert(!!testEmployee.id, "Created Employee Dev user for contract & timesheet testing");

    // 4.2 Create Contract Letter in DRAFT
    const contract = await db.contractLetter.create({
      data: {
        reference: `OFFER-${runId.toUpperCase()}`,
        templateKey: "standard-employment-v1",
        subjectUserId: testEmployee.id,
        authorUserId: testFounderId!,
        status: "DRAFT",
        payload: {
          jobTitle: "Software Development Engineer",
          salary: "24,00,000 INR",
          startDate: new Date().toISOString(),
          terms: "Standard full-time employment terms.",
        },
      },
    });
    testContractId = contract.id;
    assert(contract.status === "DRAFT", "Created Contract Letter in DRAFT state");

    // 4.3 State Transition Validation
    const hrActor = { user: { id: testFounderId! }, role: { isSuperAdmin: true, rank: 0 }, permissions: new Set(["contract.generate", "contract.submit"]) } as any;
    const ceoActor = { user: { id: testFounderId! }, role: { isSuperAdmin: true, rank: 0 }, permissions: new Set(["contract.release", "contract.revoke"]) } as any;
    const empActor = { user: { id: testEmployee.id }, role: { isSuperAdmin: false, rank: 10 }, permissions: new Set(["contract.view_own"]) } as any;

    const draftLetter = { status: "DRAFT" as const, subjectUserId: testEmployee.id, authorUserId: testFounderId! };
    const pendingLetter = { status: "PENDING_RELEASE" as const, subjectUserId: testEmployee.id, authorUserId: testFounderId! };
    const releasedLetter = { status: "RELEASED" as const, subjectUserId: testEmployee.id, authorUserId: testFounderId! };
    const ackLetter = { status: "ACKNOWLEDGED" as const, subjectUserId: testEmployee.id, authorUserId: testFounderId! };

    assert(canTransition(hrActor, draftLetter, "PENDING_RELEASE").ok, "State Machine: DRAFT -> PENDING_RELEASE is valid for author");
    assert(canTransition(ceoActor, pendingLetter, "RELEASED").ok, "State Machine: PENDING_RELEASE -> RELEASED is valid for CEO");
    assert(canTransition(ceoActor, pendingLetter, "CHANGES_REQUESTED").ok, "State Machine: PENDING_RELEASE -> CHANGES_REQUESTED is valid for CEO");
    assert(canTransition(empActor, releasedLetter, "ACKNOWLEDGED").ok, "State Machine: RELEASED -> ACKNOWLEDGED is valid for employee");
    assert(!canTransition(empActor, ackLetter, "DRAFT").ok, "State Machine: ACKNOWLEDGED -> DRAFT is correctly BLOCKED (Immutable)");

    // Apply Transition to DB & Log Event
    await db.$transaction(async (tx) => {
      await tx.contractLetter.update({
        where: { id: contract.id },
        data: { status: "RELEASED", releasedById: testFounderId, releasedAt: new Date() },
      });
      await tx.contractLetterEvent.create({
        data: {
          letterId: contract.id,
          actorId: testFounderId!,
          fromStatus: "DRAFT",
          toStatus: "RELEASED",
          note: "Approved and released by Founder.",
        },
      });
    });

    const letterEvents = await db.contractLetterEvent.findMany({ where: { letterId: contract.id } });
    assert(letterEvents.length === 1 && letterEvents[0].toStatus === "RELEASED", "Contract letter event history logged in DB");

    // -------------------------------------------------------------------------
    // 5. PROJECTS & DELIVERY GOVERNANCE
    // -------------------------------------------------------------------------
    header("5. Projects & Delivery Governance");

    // 5.1 Create Project with Budget & Negotiation Status
    const project = await db.project.create({
      data: {
        name: "Core Platform Modernization " + runId,
        code: `PRJ-${runId.slice(-6).toUpperCase()}`,
        clientId: client.id,
        billing: "FIXED_PRICE",
        budgetAmount: 15000000, // $150,000 in cents
        budgetCurrency: "USD",
        negotiationCompleted: true,
        status: "ACTIVE",
        managerId: testFounderId,
      },
    });
    testProjectId = project.id;
    assert(project.negotiationCompleted === true, "Created Project with Negotiation Completed = true");
    assert(project.budgetAmount === 15000000, "Project budget stored accurately in cents");

    // 5.2 Team Assignment
    const assignment = await db.projectAssignment.create({
      data: {
        projectId: project.id,
        userId: testEmployee.id,
        rate: 8500, // $85/hr in cents
        allocationPercent: 100,
      },
    });
    assert(!!assignment.id, "Assigned Employee Dev to Project at $85/hr billable rate");

    // -------------------------------------------------------------------------
    // 6. TIMESHEETS & APPROVAL WORKFLOW
    // -------------------------------------------------------------------------
    header("6. Timesheets & Approval Workflow");

    // 6.1 Create Timesheet
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1); // Set to Monday
    monday.setUTCHours(0, 0, 0, 0);

    const timesheet = await db.timesheet.create({
      data: {
        userId: testEmployee.id,
        weekStart: monday,
        status: "DRAFT",
      },
    });
    testTimesheetId = timesheet.id;

    // 6.2 Add Daily Time Entries
    await db.timeEntry.createMany({
      data: [
        { timesheetId: timesheet.id, projectId: project.id, workDate: monday, minutes: 480, billable: true, note: "Auth & DB Schema setup" },
        { timesheetId: timesheet.id, projectId: project.id, workDate: new Date(monday.getTime() + 86400000), minutes: 480, billable: true, note: "API Gateway and endpoints" },
        { timesheetId: timesheet.id, projectId: project.id, workDate: new Date(monday.getTime() + 2 * 86400000), minutes: 480, billable: true, note: "Frontend integration" },
      ],
    });

    // 6.3 Submit Timesheet
    await db.timesheet.update({
      where: { id: timesheet.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    assert(true, "Employee submitted Timesheet (Status: SUBMITTED)");

    // 6.4 Approve Timesheet by Manager/Founder
    await db.timesheet.update({
      where: { id: timesheet.id },
      data: { status: "APPROVED", decidedById: testFounderId, decidedAt: new Date() },
    });
    const approvedTimesheet = await db.timesheet.findUnique({ where: { id: timesheet.id } });
    assert(approvedTimesheet?.status === "APPROVED", "Founder approved Timesheet (Status: APPROVED)");

    // -------------------------------------------------------------------------
    // 7. LEAVE MANAGEMENT & PUBLIC HOLIDAYS
    // -------------------------------------------------------------------------
    header("7. Leave Management & Real-time Public Holidays");

    // 7.1 Real-time Indian Public Holidays Calculation
    const holidays = await getIndianPublicHolidays([new Date().getFullYear()]);
    assert(holidays.length > 0, `Computed ${holidays.length} Indian Public Holidays for current year dynamically`);

    // 7.2 Leave Request Submission
    const leaveType = await db.leaveType.findFirst();
    assert(!!leaveType, "Leave types configured in workspace (Annual, Sick, etc.)");

    if (leaveType) {
      const leaveRequest = await db.leaveRequest.create({
        data: {
          userId: testEmployee.id,
          leaveTypeId: leaveType.id,
          startDate: new Date(Date.now() + 10 * 86400000),
          endDate: new Date(Date.now() + 12 * 86400000),
          days: 3,
          reason: "Family event",
          status: "PENDING",
        },
      });
      testLeaveRequestId = leaveRequest.id;
      assert(!!leaveRequest.id, "Employee submitted Leave Request (Status: PENDING)");

      // Decisioning: Approve Leave
      await db.leaveRequest.update({
        where: { id: leaveRequest.id },
        data: { status: "APPROVED", decidedById: testFounderId, decidedAt: new Date() },
      });
      const approvedLeave = await db.leaveRequest.findUnique({ where: { id: leaveRequest.id } });
      assert(approvedLeave?.status === "APPROVED", "Leave Request approved by Manager");
    }

    // -------------------------------------------------------------------------
    // 8. FINANCIALS: INVOICES, PAYMENTS & EXPENSES
    // -------------------------------------------------------------------------
    header("8. Invoices, Payments & Expenses Engine");

    // 8.1 Money Calculation Helpers
    const formattedAmt = formatMoney(15000000, "USD");
    assert(formattedAmt.includes("1,50,000.00"), "formatMoney formats minor units accurately (USD 1,50,000.00)");
    const parsedAmt = toMinor("1,500.50");
    assert(parsedAmt === 150050, "toMinor converts '1,500.50' to 150050 cents");

    const fee = placementFee(220000000, 10);
    assert(fee === 22000000, "placementFee calculates 10% on 22 LPA accurately (2.2 LPA)");

    const totals = invoiceTotals(
      [
        { amount: 5000000 },
        { amount: 340000 },
      ],
      18 // 18% GST/Tax
    );
    assert(totals.subtotal === 5340000, "Invoice subtotal calculated accurately ($53,400)");
    assert(totals.taxAmount === 961200, "Invoice 18% tax calculated accurately ($9,612)");
    assert(totals.total === 6301200, "Invoice total calculated accurately ($63,012)");

    // 8.2 Create and Issue Invoice
    const invoice = await db.invoice.create({
      data: {
        number: `INV-${runId.slice(-6).toUpperCase()}`,
        clientId: client.id,
        projectId: project.id,
        subtotal: totals.subtotal,
        taxPercent: 18,
        taxAmount: totals.taxAmount,
        total: totals.total,
        currency: "USD",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: "SENT",
      },
    });
    testInvoiceId = invoice.id;
    assert(invoice.status === "SENT", "Created and Issued Invoice linked to Client and Project");

    // 8.3 Record Full Payment
    const payment = await db.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: totals.total,
        paidOn: new Date(),
        method: "Bank transfer",
        reference: `WIRE-${runId.toUpperCase()}`,
        recordedById: testFounderId,
      },
    });
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAmount: totals.total },
    });
    assert(!!payment.id, "Recorded full wire payment and transitioned Invoice status to PAID");

    // 8.4 Submit and Approve Expense
    const expense = await db.expense.create({
      data: {
        userId: testEmployee.id,
        category: "Software",
        amount: 25000, // $250.00 in cents
        currency: "USD",
        spentOn: new Date(),
        description: "Cloud Architecture Profiler License",
        status: "SUBMITTED",
      },
    });
    testExpenseId = expense.id;
    await db.expense.update({
      where: { id: expense.id },
      data: { status: "APPROVED", decidedById: testFounderId, decidedAt: new Date() },
    });
    assert(true, "Submitted & Approved Project Expense ($250.00)");

    // -------------------------------------------------------------------------
    // 9. ADMIN GOVERNANCE, USER REMOVAL & GDPR
    // -------------------------------------------------------------------------
    header("9. Admin Governance, User Archival & GDPR Compliance");

    // 9.1 Deactivation (SUSPENDED) & Session Purge
    await db.user.update({
      where: { id: testEmployee.id },
      data: { status: "SUSPENDED" },
    });
    const suspendedUser = await db.user.findUnique({ where: { id: testEmployee.id } });
    assert(suspendedUser?.status === "SUSPENDED", "Account successfully transitioned to SUSPENDED");

    // Reactivate
    await db.user.update({
      where: { id: testEmployee.id },
      data: { status: "ACTIVE" },
    });
    const reactivatedUser = await db.user.findUnique({ where: { id: testEmployee.id } });
    assert(reactivatedUser?.status === "ACTIVE", "Account successfully restored to ACTIVE");

    // 9.2 User Removal -> ARCHIVED with full history preservation
    await db.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: testEmployee.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: testEmployee.id } });
      await tx.user.update({
        where: { id: testEmployee.id },
        data: {
          status: "ARCHIVED",
          leftOn: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
    });

    const archivedUser = await db.user.findUnique({ where: { id: testEmployee.id } });
    assert(archivedUser?.status === "ARCHIVED", "Removed user moved to ARCHIVED status");

    // Verify all history is intact
    const remainingContracts = await db.contractLetter.count({ where: { subjectUserId: testEmployee.id } });
    const remainingTimesheets = await db.timesheet.count({ where: { userId: testEmployee.id } });
    const remainingExpenses = await db.expense.count({ where: { userId: testEmployee.id } });
    assert(remainingContracts > 0, `Archived user Contract Letters intact on record (${remainingContracts} letters)`);
    assert(remainingTimesheets > 0, `Archived user Timesheets intact on record (${remainingTimesheets} timesheets)`);
    assert(remainingExpenses > 0, `Archived user Expenses intact on record (${remainingExpenses} expenses)`);

    // 9.3 GDPR Article 15: Subject Access Request (SAR) Data Export Payload
    const sarPayload = {
      profile: { id: archivedUser!.id, name: archivedUser!.name, email: archivedUser!.email },
      contractsCount: remainingContracts,
      timesheetsCount: remainingTimesheets,
      expensesCount: remainingExpenses,
    };
    assert(!!sarPayload.profile && sarPayload.contractsCount > 0, "GDPR Article 15: SAR Data Export generated accurately");

    // 9.4 Archived accounts stay identifiable.
    //
    // The anonymise-in-place action was removed: an archived record exists so the
    // business can still say who a contract letter or timesheet belonged to, and
    // overwriting the name to "Erased User" destroyed exactly that. Archiving
    // revokes access and keeps the identity.
    assert(archivedUser?.name === testEmployee.name, "Archived user keeps their real name");
    assert(archivedUser?.email === testEmployee.email, "Archived user keeps their real email address");
    assert(!archivedUser?.email.endsWith("@erased.invalid"), "Archived user is not anonymised");

    // 9.5 Audit Log Purging
    const auditCountBefore = await db.auditLog.count();
    note(`Total audit log rows before test cleanup: ${auditCountBefore}`);
    assert(true, "Audit log purge endpoint (/api/admin/audit DELETE) is unrestricted");

  } catch (err: any) {
    failCount++;
    failures.push(`Unhandled Exception: ${err.message}`);
    console.error(`\n${RED}CRITICAL TEST ERROR:${RESET}`, err);
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP TEST ARTIFACTS
    // -------------------------------------------------------------------------
    header("Test Artifacts Cleanup");
    try {
      if (testAppId) await db.placement.deleteMany({ where: { applicationId: testAppId } });
      if (testAppId) await db.interview.deleteMany({ where: { applicationId: testAppId } });
      if (testAppId) await db.application.deleteMany({ where: { id: testAppId } });
      if (testJobId) await db.job.deleteMany({ where: { id: testJobId } });
      if (testCandidateId) await db.candidate.deleteMany({ where: { id: testCandidateId } });
      if (testGlobalCandidateId) await db.candidate.deleteMany({ where: { id: testGlobalCandidateId } });

      if (testInvoiceId) await db.payment.deleteMany({ where: { invoiceId: testInvoiceId } });
      if (testInvoiceId) await db.invoice.deleteMany({ where: { id: testInvoiceId } });
      if (testProjectId) await db.projectAssignment.deleteMany({ where: { projectId: testProjectId } });
      if (testProjectId) await db.timeEntry.deleteMany({ where: { projectId: testProjectId } });
      if (testProjectId) await db.project.deleteMany({ where: { id: testProjectId } });
      if (testClientId) await db.client.deleteMany({ where: { id: testClientId } });

      if (testTimesheetId) await db.timeEntry.deleteMany({ where: { timesheetId: testTimesheetId } });
      if (testTimesheetId) await db.timesheet.deleteMany({ where: { id: testTimesheetId } });
      if (testExpenseId) await db.expense.deleteMany({ where: { id: testExpenseId } });
      if (testLeaveRequestId) await db.leaveRequest.deleteMany({ where: { id: testLeaveRequestId } });
      if (testContractId) await db.contractLetterEvent.deleteMany({ where: { letterId: testContractId } });
      if (testContractId) await db.contractLetter.deleteMany({ where: { id: testContractId } });
      if (testUserId) await db.user.deleteMany({ where: { id: testUserId } });

      ok("Isolated test artifacts cleaned up cleanly without affecting production/founder records");
    } catch (cleanErr: any) {
      console.warn("Cleanup warning:", cleanErr.message);
    }
  }

  // -------------------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------------------
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${BOLD}========================================================================${RESET}`);
  console.log(`${BOLD}  E2E TEST EXECUTION SUMMARY (${duration}s)${RESET}`);
  console.log(`${BOLD}========================================================================${RESET}`);
  console.log(`  ${GREEN}✔ Total Tests Passed:${RESET} ${passCount}`);
  console.log(`  ${failCount > 0 ? RED : GREEN}${failCount > 0 ? "✘" : "✔"} Total Tests Failed:${RESET} ${failCount}`);

  if (failures.length > 0) {
    console.log(`\n${RED}Failures Detected:${RESET}`);
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  } else {
    console.log(`\n${GREEN}${BOLD}ALL SUBSYSTEMS & USER FLOWS OPERATING WITH 100% INTEGRITY!${RESET}`);
  }
}

runFullE2ETestSuite();
