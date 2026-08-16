import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { can, requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "My Work" };

const shortDate = (value: Date) =>
  value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function MyWorkPage() {
  const context = await requireAuth();
  const userId = context.user.id;

  const [timesheets, leave, contracts, myAssignments, myApplications] = await Promise.all([
    can(context, "timesheet.submit")
      ? db.timesheet.findMany({
          where: {
            userId,
            OR: [
              { status: { in: ["SUBMITTED", "REJECTED"] } },
              { status: "DRAFT", entries: { some: {} } },
            ],
          },
          orderBy: { weekStart: "desc" },
          take: 5,
          select: { id: true, weekStart: true, status: true },
        })
      : [],
    can(context, "leave.request")
      ? db.leaveRequest.findMany({
          where: { userId, status: "PENDING" },
          orderBy: { startDate: "asc" },
          take: 5,
          include: { leaveType: { select: { label: true } } },
        })
      : [],
    can(context, "contract.view_own")
      ? db.contractLetter.findMany({
          where: { subjectUserId: userId, status: { in: ["RELEASED", "PENDING_RELEASE", "CHANGES_REQUESTED"] } },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, reference: true, status: true, updatedAt: true },
        })
      : [],
    db.projectAssignment.findMany({
      where: { userId },
      include: {
        project: {
          include: { client: { select: { name: true } } },
        },
      },
    }),
    can(context, "candidate.view")
      ? db.application.findMany({
          where: { stage: { in: ["SOURCED", "SCREENED", "SUBMITTED", "INTERVIEW", "OFFER"] } },
          include: {
            candidate: { select: { name: true, skills: true, benchStatus: true } },
            job: { select: { title: true, reference: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 6,
        })
      : [],
  ]);

  const empty =
    timesheets.length === 0 &&
    leave.length === 0 &&
    contracts.length === 0 &&
    myAssignments.length === 0 &&
    myApplications.length === 0;

  return (
    <>
      {empty && (
        <section className="portal-section">
          <h2 className="portal-section-title">Nothing outstanding</h2>
          <p className="portal-note">
            You have no open timesheets, leave requests, or active pipeline items requiring attention.
          </p>
        </section>
      )}

      {/* 1. PIPELINE DETAILS */}
      {myApplications.length > 0 && (
        <section className="portal-section">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 className="portal-section-title">Pipeline Details</h2>
            <Link href="/candidates" className="text-link text-xs font-semibold">
              Candidate Pool →
            </Link>
          </div>
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">Requisition</th>
                  <th scope="col">Skills / Tech Stack</th>
                  <th scope="col">Bench Status</th>
                  <th scope="col">Current Stage</th>
                </tr>
              </thead>
              <tbody>
                {myApplications.map((app) => (
                  <tr key={app.id}>
                    <th scope="row">
                      <strong>{app.candidate.name}</strong>
                    </th>
                    <td>{app.job.title} ({app.job.reference})</td>
                    <td>{app.candidate.skills || "—"}</td>
                    <td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {app.candidate.benchStatus || "Available"}
                      </span>
                    </td>
                    <td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {app.stage}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2. ASSIGNED PROJECTS */}
      {myAssignments.length > 0 && (
        <section className="portal-section">
          <h2 className="portal-section-title">My Project Assignments</h2>
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Client</th>
                  <th scope="col">Allocation</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {myAssignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <th scope="row">
                      <strong>{assignment.project.name}</strong>
                      <span>{assignment.project.code}</span>
                    </th>
                    <td>{assignment.project.client.name}</td>
                    <td>{assignment.allocationPercent}%</td>
                    <td>
                      <StatusChip status={assignment.project.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="row-action" href="/timesheets">
                          Book Time
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 3. TIMESHEETS */}
      {timesheets.length > 0 && (
        <section className="portal-section">
          <h2 className="portal-section-title">Timesheets to Submit</h2>
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Week beginning</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((sheet) => (
                  <tr key={sheet.id}>
                    <th scope="row">
                      <strong>{shortDate(sheet.weekStart)}</strong>
                    </th>
                    <td>
                      <StatusChip status={sheet.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="row-action" href="/timesheets">
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. LEAVE */}
      {leave.length > 0 && (
        <section className="portal-section">
          <h2 className="portal-section-title">Leave awaiting a decision</h2>
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Days</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leave.map((request) => (
                  <tr key={request.id}>
                    <th scope="row">
                      <strong>{request.leaveType.label}</strong>
                    </th>
                    <td>
                      {shortDate(request.startDate)} – {shortDate(request.endDate)}
                    </td>
                    <td>{request.days}</td>
                    <td>
                      <StatusChip status={request.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="row-action" href="/leave">
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 5. CONTRACT LETTERS */}
      {contracts.length > 0 && (
        <section className="portal-section">
          <h2 className="portal-section-title">Contract letters</h2>
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Letter</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((letter) => (
                  <tr key={letter.id}>
                    <th scope="row">
                      <strong>{letter.reference}</strong>
                    </th>
                    <td>
                      <StatusChip status={letter.status} />
                    </td>
                    <td>{shortDate(letter.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="row-action" href={`/contracts/${letter.id}`}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
