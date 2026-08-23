"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Crumb = { label: string; href?: string };

export function resolveBreadcrumbs(pathname: string): Crumb[] {
  const path = pathname.replace(/\/+$/, "") || "/dashboard";

  // Dashboard & tabs
  if (path === "/dashboard") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Dashboard" }];
  }
  if (path === "/dashboard/my-work") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Dashboard", href: "/dashboard" }, { label: "My Work" }];
  }
  if (path === "/dashboard/approvals") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Dashboard", href: "/dashboard" }, { label: "Approvals" }];
  }
  if (path === "/dashboard/access") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Dashboard", href: "/dashboard" }, { label: "Access" }];
  }

  // My Work
  if (path === "/timesheets") {
    return [{ label: "Home", href: "/dashboard" }, { label: "My Work" }, { label: "Timesheets" }];
  }
  if (path === "/leave") {
    return [{ label: "Home", href: "/dashboard" }, { label: "My Work" }, { label: "Leave" }];
  }
  if (path === "/expenses") {
    return [{ label: "Home", href: "/dashboard" }, { label: "My Work" }, { label: "Expenses" }];
  }
  if (path === "/contracts") {
    return [{ label: "Home", href: "/dashboard" }, { label: "My Work" }, { label: "Contract Letters" }];
  }
  if (path === "/contracts/new") {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "My Work" },
      { label: "Contract Letters", href: "/contracts" },
      { label: "New Letter" },
    ];
  }
  if (path.startsWith("/contracts/")) {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "My Work" },
      { label: "Contract Letters", href: "/contracts" },
      { label: "Letter Details" },
    ];
  }

  // Delivery
  if (path === "/projects") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Delivery" }, { label: "Projects" }];
  }
  if (path.startsWith("/projects/")) {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Delivery" },
      { label: "Projects", href: "/projects" },
      { label: "Project Details" },
    ];
  }
  if (path === "/clients") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Delivery" }, { label: "Clients" }];
  }
  if (path.startsWith("/clients/")) {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Delivery" },
      { label: "Clients", href: "/clients" },
      { label: "Client Details" },
    ];
  }

  // Recruitment
  if (path === "/jobs") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Recruitment" }, { label: "Jobs" }];
  }
  if (path.startsWith("/jobs/")) {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Recruitment" },
      { label: "Jobs", href: "/jobs" },
      { label: "Pipeline" },
    ];
  }
  if (path === "/candidates") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Recruitment" }, { label: "Candidates" }];
  }
  if (path.startsWith("/candidates/")) {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Recruitment" },
      { label: "Candidates", href: "/candidates" },
      { label: "Candidate Details" },
    ];
  }

  // Finance
  if (path === "/invoices") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Finance" }, { label: "Invoices" }];
  }
  if (path === "/expenses/approvals") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Finance" }, { label: "Expense Claims" }];
  }

  if (path === "/reports/revenue") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Finance" }, { label: "Revenue" }];
  }

  // Directory
  if (path === "/directory") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Directory" }];
  }

  // Admin
  if (path === "/admin") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Administration" }, { label: "People" }];
  }
  if (path === "/admin/permissions") {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Administration", href: "/admin" },
      { label: "Roles & Permissions" },
    ];
  }
  if (path === "/admin/holidays") {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Administration", href: "/admin" },
      { label: "Public Holidays" },
    ];
  }
  if (path === "/admin/audit") {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "Administration", href: "/admin" },
      { label: "Audit Log" },
    ];
  }

  // Profile & Settings
  if (path === "/profile") {
    return [{ label: "Home", href: "/dashboard" }, { label: "My Profile" }];
  }
  if (path === "/profile/security") {
    return [
      { label: "Home", href: "/dashboard" },
      { label: "My Profile", href: "/profile" },
      { label: "Security & Password" },
    ];
  }

  // Notifications
  if (path === "/notifications") {
    return [{ label: "Home", href: "/dashboard" }, { label: "Notifications" }];
  }

  // Fallback: segment-based breadcrumbs
  const segments = path.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", href: "/dashboard" }];
  let currentPath = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    currentPath += `/${seg}`;
    const label = seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (i === segments.length - 1) {
      crumbs.push({ label });
    } else {
      crumbs.push({ label, href: currentPath });
    }
  }

  return crumbs;
}

/**
 * Breadcrumb navigation.
 * Can be passed explicit items, or will automatically generate the trail from the current URL.
 */
export function Breadcrumbs({ items }: { items?: ReadonlyArray<Crumb> }) {
  const pathname = usePathname();
  const trail = items && items.length > 0 ? items : resolveBreadcrumbs(pathname || "/dashboard");

  if (!trail || trail.length === 0) return null;

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((item, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !isLast ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
              {!isLast && (
                <span className="crumb-sep" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
