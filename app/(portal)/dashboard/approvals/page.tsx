import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { can, requireAuth } from "@/lib/auth/guard";
import { ROLE } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export const metadata = { title: "Approvals" };

const shortDate = (value: Date) =>
  value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function ApprovalsPage() {
  const context = await requireAuth();
  const userId = context.user.id;

  // Filter for employee-only submissions: Exclude CEO and Co-Founder submissions
  const executiveRoles = await db.role.findMany({
    where: { key: { in: [ROLE.CEO, ROLE.CO_FOUNDER] } },
    select: { id: true },
  });
  const execRoleIds = executiveRoles.map((r) => r.id);

  const [timesheets, leave] = await Promise.all([
    can(context, "timesheet.approve")
      ? db.timesheet.findMany({
          where: {
            status: "SUBMITTED",
            NOT: { userId },
            user: { roleId: { notIn: execRoleIds } },
          },
          orderBy: { weekStart: "asc" },
          take: 12,
          include: { user: { select: { name: true, role: { select: { label: true } } } } },
        })
      : [],
    can(context, "leave.manage") || can(context, "leave.approve")
      ? db.leaveRequest.findMany({
          where: {
            status: "PENDING",
            NOT: { userId },
            user: { roleId: { notIn: execRoleIds } },
          },
          orderBy: { startDate: "asc" },
          take: 12,
          include: {
            user: { select: { name: true, role: { select: { label: true } } } },
            leaveType: { select: { label: true } },
          },
        })
      : [],
  ]);

  const total = timesheets.length + leave.length;

  return (
    <>
      <div className="portal-grid">
        <article className="portal-card">
          <span className="portal-stat">{timesheets.length}</span>
          <p>Employee timesheets to review</p>
        </article>
        <article className="portal-card">
          <span className="portal-stat">{leave.length}</span>
          <p>Employee leave requests to review</p>
        </article>
      </div>

      {total === 0 && (
        <section className="portal-section">
          <h2 className="portal-section-title">All clear</h2>
          <p className="portal-note">
            There are no pending employee approvals waiting on you right now. Submissions from leadership are excluded.
          </p>
        </section>
      )}

      {timesheets.length > 0 && (
        <section className="portal-section">
          <h2 className="portal-section-title">Employee Timesheets</h2>
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Role</th>
                  <th scope="col">Week beginning</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((sheet) => (
                  <tr key={sheet.id}>
                    <th scope="row">
                      <strong>{sheet.user.name}</strong>
                    </th>
                    <td>{sheet.user.role.label}</td>
                    <td>{shortDate(sheet.weekStart)}</td>
                    <td>
                      <StatusChip status={sheet.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="row-action row-action--primary" href="/timesheets">
                          Review
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

      {leave.length > 0 && (
        <section className="portal-section">
          <h2 className="portal-section-title">Employee Leave Requests</h2>
          <div className="matrix-scroll">
            <table className="matrix matrix--people">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Role</th>
                  <th scope="col">Type</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Days</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leave.map((request) => (
                  <tr key={request.id}>
                    <th scope="row">
                      <strong>{request.user.name}</strong>
                    </th>
                    <td>{request.user.role.label}</td>
                    <td>{request.leaveType.label}</td>
                    <td>
                      {shortDate(request.startDate)} – {shortDate(request.endDate)}
                    </td>
                    <td>{request.days}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="row-action row-action--primary" href="/leave">
                          Review
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
