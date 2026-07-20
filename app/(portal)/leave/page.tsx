import { LeaveManager, type LeaveRow, type LeaveTypeOption } from "@/components/leave/leave-manager";
import { can, requirePermission } from "@/lib/auth/guard";
import { canDecideLeave, formatDay } from "@/lib/leave/leave";
import { db } from "@/lib/db";

export const metadata = { title: "Leave" };

export default async function LeavePage() {
  const context = await requirePermission("leave.request");
  const year = new Date().getUTCFullYear();

  const [types, balances, mineRaw, pendingRaw] = await Promise.all([
    db.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.leaveBalance.findMany({ where: { userId: context.user.id, year } }),
    db.leaveRequest.findMany({ where: { userId: context.user.id }, include: { leaveType: true }, orderBy: { startDate: "desc" }, take: 50 }),
    // Only fetch others' requests when the viewer can decide something.
    can(context, "leave.approve") || can(context, "leave.manage")
      ? db.leaveRequest.findMany({
          where: { status: "PENDING", NOT: { userId: context.user.id } },
          include: { leaveType: true, user: { select: { id: true, name: true, managerId: true } } },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const typeOptions: LeaveTypeOption[] = types.map((type) => {
    const balance = balances.find((entry) => entry.leaveTypeId === type.id);
    return {
      id: type.id, label: type.label, colour: type.colour, tracksBalance: type.tracksBalance,
      entitled: balance?.entitledDays ?? type.annualDays,
      used: balance?.usedDays ?? 0,
    };
  });

  const mine: LeaveRow[] = mineRaw.map((row) => ({
    id: row.id, typeLabel: row.leaveType.label, colour: row.leaveType.colour,
    from: formatDay(row.startDate), to: formatDay(row.endDate), days: row.days,
    status: row.status, reason: row.reason, decisionNote: row.decisionNote,
    canDecide: false, canCancel: row.status === "PENDING",
  }));

  // Authority is resolved on the server for each row; the table only renders.
  const toDecide: LeaveRow[] = pendingRaw
    .filter((row) => canDecideLeave(context, row, row.user.managerId).ok)
    .map((row) => ({
      id: row.id, typeLabel: row.leaveType.label, colour: row.leaveType.colour,
      from: formatDay(row.startDate), to: formatDay(row.endDate), days: row.days,
      status: row.status, requesterName: row.user.name, reason: row.reason, decisionNote: row.decisionNote,
      canDecide: true, canCancel: false,
    }));

  return <>
    <header className="portal-page-head">
      <p className="eyebrow">Time off</p>
      <h1 className="portal-title">Leave</h1>
      <p className="portal-lead">Request time off and track what you have left this year.</p>
    </header>
    <LeaveManager types={typeOptions} mine={mine} toDecide={toDecide} canRequest={can(context, "leave.request")} />
  </>;
}
