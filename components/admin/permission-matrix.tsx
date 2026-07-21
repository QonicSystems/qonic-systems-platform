"use client";

import { Fragment, useState } from "react";

type Role = { id: string; key: string; label: string; isSuperAdmin: boolean; rank: number };
type Permission = { key: string; group: string; label: string; description: string };

export function PermissionMatrix({ roles, permissions, initial, superAdminOnly }: {
  roles: ReadonlyArray<Role>;
  permissions: ReadonlyArray<Permission>;
  /** `${roleId}:${permissionKey}` → enabled */
  initial: Record<string, boolean>;
  superAdminOnly: ReadonlyArray<string>;
}) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const toggle = async (role: Role, permission: Permission) => {
    const cell = `${role.id}:${permission.key}`;
    const next = !state[cell];
    setPending(cell);
    setMessage(null);
    // Optimistic, reverted below if the server refuses.
    setState((current) => ({ ...current, [cell]: next }));

    try {
      const response = await fetch(`/api/admin/roles/${role.id}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionKey: permission.key, enabled: next }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setState((current) => ({ ...current, [cell]: !next }));
        setMessage({ tone: "error", text: result.message ?? "Unable to update." });
        return;
      }
      setMessage({ tone: "success", text: `${permission.label} — ${result.message}` });
    } catch {
      setState((current) => ({ ...current, [cell]: !next }));
      setMessage({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setPending(null);
    }
  };

  const groups = [...new Set(permissions.map((permission) => permission.group))];

  return <div>
    {message && <p className={`form-status form-status--${message.tone}`} role="status">{message.text}</p>}

    <div className="matrix-scroll">
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
          {groups.map((group) => <Fragment key={group}>
            <tr className="matrix-group"><th scope="rowgroup" colSpan={roles.length + 1}>{group}</th></tr>
            {permissions.filter((permission) => permission.group === group).map((permission) => <tr key={permission.key}>
              <th scope="row">
                <strong>{permission.label}</strong>
                <span>{permission.description}</span>
              </th>
              {roles.map((role) => {
                const cell = `${role.id}:${permission.key}`;
                // The super admin is always on and never editable — their access
                // is unconditional, not a stored toggle.
                if (role.isSuperAdmin) return <td key={cell}><span className="matrix-always" title="Super admin always has every capability">Always</span></td>;
                const locked = superAdminOnly.includes(permission.key);
                return <td key={cell}>
                  <label className="matrix-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(state[cell])}
                      disabled={pending === cell || locked}
                      onChange={() => toggle(role, permission)}
                      aria-label={`${permission.label} for ${role.label}`}
                    />
                    <span aria-hidden="true" />
                  </label>
                  {locked && <span className="matrix-locked" title="Only the super admin holds this">CEO only</span>}
                </td>;
              })}
            </tr>)}
          </Fragment>)}
        </tbody>
      </table>
    </div>
  </div>;
}
