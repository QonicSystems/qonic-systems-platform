"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";

type Role = { id: string; key: string; label: string; isSuperAdmin: boolean; rank: number };
type Permission = { key: string; group: string; label: string; description: string };

export function PermissionMatrix({ roles, permissions, initial, superAdminOnly, viewerIsSuperAdmin }: {
  roles: ReadonlyArray<Role>;
  permissions: ReadonlyArray<Permission>;
  /** `${roleId}:${permissionKey}` → enabled */
  initial: Record<string, boolean>;
  superAdminOnly: ReadonlyArray<string>;
  /** Mirrors the API: only a super admin may grant a super-admin-only key. */
  viewerIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  // useState ignores later props, so without this the matrix showed whatever it
  // was first rendered with — two admins working at once silently diverged, and
  // even a refresh elsewhere left these checkboxes stale. Adjusted during
  // render rather than in an effect (React's documented pattern for reacting to
  // a changed prop): a new `initial` identity only arrives from a fresh server
  // render, so this re-syncs on router.refresh() without an extra paint.
  const [renderedFrom, setRenderedFrom] = useState(initial);
  if (renderedFrom !== initial) {
    setRenderedFrom(initial);
    setState(initial);
  }
  // Keyed per cell rather than one slot: several toggles can be in flight, and a
  // shared flag let whichever finished last re-enable all of them.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { query, setQuery, rows: searchedPermissions, isFiltered: isSearching } = useFilter(
    permissions,
    (permission) => [permission.key, permission.group, permission.label, permission.description],
  );
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");

  const toggle = async (role: Role, permission: Permission) => {
    const cell = `${role.id}:${permission.key}`;
    const next = !state[cell];
    setPending((current) => ({ ...current, [cell]: true }));
    setMessage(null);
    // Optimistic, reverted below if the server refuses.
    setState((current) => ({ ...current, [cell]: next }));

    try {
      const response = await fetch(`/api/admin/roles/${role.id}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionKey: permission.key, enabled: next }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) {
        setState((current) => ({ ...current, [cell]: !next }));
        setMessage({ tone: "error", text: result.message ?? "Unable to update." });
        return;
      }
      setMessage({ tone: "success", text: `${permission.label} — ${result.message}` });
      // Re-read from the database so a second admin's changes appear, and so the
      // optimistic value is replaced by what was actually stored.
      router.refresh();
    } catch {
      setState((current) => ({ ...current, [cell]: !next }));
      setMessage({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setPending((current) => { const next = { ...current }; delete next[cell]; return next; });
    }
  };

  const groups = [...new Set(permissions.map((permission) => permission.group))];
  const filteredPermissions = useMemo(() => searchedPermissions.filter((permission) => {
    if (groupFilter !== "ALL" && permission.group !== groupFilter) return false;
    if (roleFilter === "ALL") return true;
    const role = roles.find((candidate) => candidate.id === roleFilter);
    return Boolean(role?.isSuperAdmin || (role && state[`${role.id}:${permission.key}`]));
  }), [groupFilter, roleFilter, roles, searchedPermissions, state]);
  const isFiltered = isSearching || groupFilter !== "ALL" || roleFilter !== "ALL";
  const clearFilters = () => {
    setQuery("");
    setGroupFilter("ALL");
    setRoleFilter("ALL");
  };

  return <div>
    {message && <p className={`form-status form-status--${message.tone}`} role="status">{message.text}</p>}

    <TableToolbar search={query} onSearch={setQuery} placeholder="Search capabilities…" label="Search capabilities">
      <label className="flex items-center gap-2 text-sm font-medium text-ink-muted">
        <span>Area</span>
        <select className="row-select" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
          <option value="ALL">All areas</option>
          {groups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-ink-muted">
        <span>Enabled for</span>
        <select className="row-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="ALL">All roles</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
        </select>
      </label>
      {isFiltered && <button type="button" className="row-action" onClick={clearFilters}>Clear filters</button>}
    </TableToolbar>

    {filteredPermissions.length === 0
      ? <EmptyState message="No capabilities are configured." filteredMessage="No capabilities match those filters." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
      <table className="matrix">
        <thead>
          <tr>
            <th scope="col">Capability</th>
            {roles.map((role) => <th key={role.id} scope="col">
              {role.label}
              {role.isSuperAdmin && <span className="matrix-super">Super admin</span>}
            </th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const groupPermissions = filteredPermissions.filter((permission) => permission.group === group);
            if (groupPermissions.length === 0) return null;
            return <Fragment key={group}>
              <tr className="matrix-group"><th scope="rowgroup" colSpan={roles.length + 1}>{group}</th></tr>
              {groupPermissions.map((permission) => <tr key={permission.key}>
              <th scope="row">
                <strong>{permission.label}</strong>
                <span>{permission.description}</span>
              </th>
              {roles.map((role) => {
                const cell = `${role.id}:${permission.key}`;
                // The super admin is always on and never editable — their access
                // is unconditional, not a stored toggle.
                if (role.isSuperAdmin) return <td key={cell}><span className="matrix-always" title="Super admin always has every capability">Always</span></td>;
                // The API refuses a super-admin-only key only when the CALLER is
                // not a super admin. Locking it for everyone meant the CEO could
                // not grant rbac.manage at all — the UI forbidding what the
                // server allows.
                const locked = superAdminOnly.includes(permission.key) && !viewerIsSuperAdmin;
                return <td key={cell}>
                  <label className="matrix-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(state[cell])}
                      disabled={Boolean(pending[cell]) || locked}
                      onChange={() => toggle(role, permission)}
                      aria-label={`${permission.label} for ${role.label}`}
                    />
                    <span aria-hidden="true" />
                  </label>
                  {locked && <span className="matrix-locked" title="Only the super admin holds this">CEO only</span>}
                </td>;
              })}
              </tr>)}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div>}
  </div>;
}
