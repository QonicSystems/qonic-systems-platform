import Link from "next/link";
import { PageTabs } from "@/components/portal/page-tabs";
import { can, requireAuth } from "@/lib/auth/guard";

const APPROVAL_PERMISSIONS = ["timesheet.approve", "leave.approve", "leave.manage"];
const MY_WORK_PERMISSIONS = ["timesheet.submit", "leave.request", "contract.view_own"];

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await requireAuth();
  const anyOf = (keys: string[]) => keys.some((key) => can(context, key));

  const tabs = [
    { label: "Overview", href: "/dashboard", visible: true },
    { label: "My Work", href: "/dashboard/my-work", visible: anyOf(MY_WORK_PERMISSIONS) },
    { label: "Approvals", href: "/dashboard/approvals", visible: anyOf(APPROVAL_PERMISSIONS) },
    { label: "Access", href: "/dashboard/access", visible: true },
  ].filter((tab) => tab.visible);

  const firstName = context.user.name.split(" ")[0] || "there";

  return (
    <div className="portal-page">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="eyebrow">{context.role.label}</p>
            <h1 className="portal-title">Welcome back, {firstName}.</h1>
            <p className="portal-lead">Your work, your approvals, and what this account can reach.</p>
          </div>
        </div>

        <PageTabs tabs={tabs} label="Dashboard sections" />
      </div>

      {children}
    </div>
  );
}
