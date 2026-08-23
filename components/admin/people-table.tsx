"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusChip } from "@/components/status-chip";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { useFilter } from "@/lib/ui/filter";
import { TechStackBadges } from "@/components/ats/tech-stack-badges";

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  techStack: string;
  roleId: string;
  roleLabel: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  canResend: boolean;
  /* Each action carries its OWN permission. These used to be one `canEdit`
     derived from user.manage, which meant granting user.deactivate or
     user.delete on their own did nothing at all — the row rendered "No access"
     while the API would happily have authorised the call. */
  canEdit: boolean;
  canDeactivate: boolean;
  canRemove: boolean;
  canExport: boolean;
  /** The viewer's own row: identity is editable, role and removal are not. */
  isSelf: boolean;
  canOverride: boolean;
  overrides: ReadonlyArray<Override>;
};

export type Override = {
  key: string;
  label: string;
  effect: "ALLOW" | "DENY";
  reason: string;
  expiresAt: string;
  expired: boolean;
};

export type PermissionOption = { key: string; label: string; group: string };

type RoleOption = { id: string; label: string; assignable: boolean; viaCandidatePool: boolean };

/**
 * Roles this dialog offers at all.
 *
 * A Candidate Pool role is left out entirely rather than shown disabled: it is
 * not a thing you could do here under different circumstances, it is simply
 * managed somewhere else, and an option that can never be picked is noise. A
 * role you merely lack the seniority to assign is different — that one stays
 * visible, disabled, with the reason (see `roleUnavailableReason`).
 */
function selectableRoles(roles: ReadonlyArray<RoleOption>): ReadonlyArray<RoleOption> {
  return roles.filter((role) => !role.viaCandidatePool);
}

/** Why a listed role cannot be chosen, or "" when it can. */
function roleUnavailableReason(role: RoleOption): string {
  return role.assignable ? "" : " — not assignable by you";
}
/** Success is explicit; `errors` is only ever present on a 422. */
type ActResult = { ok: boolean; errors?: Errors; inviteUrl?: string };
type Errors = Partial<Record<"name" | "email" | "phone" | "jobTitle" | "techStack" | "roleId", string>>;

export function PeopleTable({ people, roles, canCreate, permissions, today }: {
  people: ReadonlyArray<PersonRow>;
  roles: ReadonlyArray<RoleOption>;
  canCreate: boolean;
  permissions: ReadonlyArray<PermissionOption>;
  /** Supplied by the server — reading the clock during render is impure. */
  today: string;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED" | "ARCHIVED">("ALL");

  const statusCounts = {
    ALL: people.length,
    ACTIVE: people.filter((p) => p.status === "ACTIVE").length,
    SUSPENDED: people.filter((p) => p.status === "SUSPENDED").length,
    ARCHIVED: people.filter((p) => p.status === "ARCHIVED").length,
  };

  const statusFilteredPeople = statusFilter === "ALL"
    ? people
    : people.filter((p) => p.status === statusFilter);

  const { query, setQuery, rows, isFiltered } = useFilter(statusFilteredPeople, (person) => [
    person.name, person.email, person.roleLabel, person.jobTitle, person.techStack, person.status
  ]);
  const [adding, setAdding] = useState(false);
  // Shown only when email could not be delivered, so the invite can still be
  // handed over. It is a bearer token, so it is never persisted anywhere.
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [confirming, setConfirming] = useState<PersonRow | null>(null);
  const [overridingId, setOverridingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  /**
   * Every mutation goes through here.
   *
   * `ok` is what callers branch on. Previously they inferred success from the
   * absence of an `errors` key, which is only present on a 422 — so a 403, a
   * 404, a 500 or a dropped connection all looked like success, closed the
   * dialog, and threw away what the user had typed.
   */
  const act = async (url: string, init: RequestInit): Promise<ActResult> => {
    setBusy(true);
    try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      // A framework 500 has no JSON body, so parsing is part of what can fail.
      const result = await response.json().catch(() => ({})) as { message?: string; errors?: Errors; inviteUrl?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to complete request." });
        // Refresh on 404/409 too: the row we acted on is out of date, and
        // leaving a deleted person on screen invites a second failed attempt.
        if (response.status === 404 || response.status === 409) router.refresh();
        return { ok: false, errors: result.errors };
      }
      setNotice({ tone: "success", text: result.message ?? "Updated." });
      router.refresh();
      return { ok: true, inviteUrl: result.inviteUrl };
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
      return { ok: false };
    } finally { setBusy(false); }
  };

  // Read through the live prop so the panel refreshes after router.refresh().
  const overriding = people.find((p) => p.id === overridingId) ?? null;

  const resendInvite = async (person: PersonRow) => {
    setNotice(null);
    setInviteUrl(null);
    const result = await act(`/api/admin/users/${person.id}/resend`, { method: "POST" });
    if (result.ok && result.inviteUrl) setInviteUrl(result.inviteUrl);
  };

  const toggleStatus = async (person: PersonRow) => {
    await act(`/api/admin/users/${person.id}/status`, { method: "POST", body: JSON.stringify({ active: person.status !== "ACTIVE" }) });
  };

  const remove = async (person: PersonRow) => {
    // Moves user to ARCHIVED status with all history preserved — including
    // their real name. There is deliberately no anonymise/erase action: an
    // archived record that cannot say who it belongs to is of no use to anyone.
    const result = await act(`/api/admin/users/${person.id}`, { method: "DELETE" });
    if (result.ok) setConfirming(null);
  };

  return <div>
    {/* ── Status Filter Tabs ────────────────────────────────────────── */}
    <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
      {(["ALL", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const).map((tabKey) => {
        const isSelected = statusFilter === tabKey;
        const label = tabKey === "ALL" ? "All Accounts" : tabKey.charAt(0) + tabKey.slice(1).toLowerCase();
        const count = statusCounts[tabKey];

        return (
          <button
            key={tabKey}
            type="button"
            onClick={() => setStatusFilter(tabKey)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isSelected
                ? "bg-[#111111] text-white shadow-sm"
                : "bg-[#f8f7f3] text-[#4f4f4f] hover:bg-[#eeece4] border border-[#e7e4da]"
            }`}
          >
            <span>{label}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
              isSelected ? "bg-[#ffd700] text-[#111111] font-bold" : "bg-black/10 text-[#6b6b6b]"
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>

    <TableToolbar search={query} onSearch={setQuery} placeholder="Search name, email, role, or tech stack…" label="Search accounts">
      {canCreate && <button type="button" className="button button-primary" onClick={() => { setAdding(true); setNotice(null); setInviteUrl(null); }} disabled={busy}>
        Add a person
      </button>}
    </TableToolbar>

    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    {inviteUrl && <div className="portal-panel mt-4 mb-6">
      <p className="font-semibold text-emerald-800">New invite link generated:</p>
      <p className="portal-note">Email is not configured in this environment. Send this link directly to the person:</p>
      <p className="mfa-secret">{inviteUrl}</p>
    </div>}

    {rows.length === 0
      ? <EmptyState message="No accounts yet." filteredMessage="No accounts match that search." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead>
          <tr>
            <th scope="col">Name</th><th scope="col">Role & Tech Stack</th><th scope="col">Status</th>
            <th scope="col">Last signed in</th><th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((person) => <tr key={person.id}>
            <th scope="row">
              <strong>{person.name}</strong>
              <span>{person.email}</span>
            </th>
            <td>
              <div className="flex flex-col gap-1">
                <strong className="text-slate-900">{person.roleLabel}</strong>
                {person.jobTitle && <span className="text-slate-500 block text-xs">{person.jobTitle}</span>}
                {person.techStack && (
                  <div className="mt-1">
                    <TechStackBadges stack={person.techStack} />
                  </div>
                )}
              </div>
            </td>
            <td>
              <div className="flex flex-col gap-1 items-start">
                <StatusChip status={person.status} />
                {person.mustChangePassword && person.status === "ACTIVE" && (
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    Invite pending
                  </span>
                )}
              </div>
            </td>
            <td>{person.lastLoginAt ?? "Never"}</td>
            <td>
              {person.canEdit || person.canResend || person.canDeactivate || person.canRemove || person.canExport
                ? <div className="row-actions">
                    {person.canResend && (
                      <button
                        type="button"
                        className="row-action row-action--highlight"
                        onClick={() => resendInvite(person)}
                        disabled={busy}
                        title="Resend invitation link"
                      >
                        Resend
                      </button>
                    )}
                    {person.canEdit && <button type="button" className="row-action" onClick={() => { setEditing(person); setNotice(null); }} disabled={busy}>Edit</button>}
                    {person.canDeactivate && (
                      <button type="button" className="row-action" onClick={() => toggleStatus(person)} disabled={busy}>
                        {person.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                    {person.canOverride && (
                      <button
                        type="button"
                        className="row-action"
                        onClick={() => { setOverridingId(person.id); setNotice(null); }}
                        disabled={busy}
                        title="Grant or deny one capability for this person alone"
                      >
                        Exceptions{person.overrides.length > 0 ? ` (${person.overrides.length})` : ""}
                      </button>
                    )}
                    {person.canExport && <a className="row-action" href={`/api/admin/users/${person.id}/data`} download>Export data</a>}
                    {person.canRemove && (
                      <button
                        type="button"
                        className="row-action row-action--danger"
                        onClick={() => { setConfirming(person); setNotice(null); }}
                        disabled={busy}
                        title={person.status === "ARCHIVED" ? "Permanently purge user and all associated data" : "Archive account"}
                      >
                        {person.status === "ARCHIVED" ? "Delete permanently" : "Remove"}
                      </button>
                    )}
                  </div>
                : <span className="row-locked">No access</span>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {overriding && <OverrideDialog
      person={overriding}
      permissions={permissions}
      today={today}
      busy={busy}
      onClose={() => setOverridingId(null)}
      onCall={async (url, init) => (await act(url, init)).ok}
    />}

    {editing && <EditDialog
      person={editing}
      roles={roles}
      busy={busy}
      onClose={() => setEditing(null)}
      onSave={async (payload) => {
        const result = await act(`/api/admin/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        if (result.ok) setEditing(null);
        return result.errors ?? {};
      }}
    />}

    {adding && <AddDialog
      roles={roles}
      busy={busy}
      onClose={() => setAdding(false)}
      onSave={async (payload) => {
        const result = await act("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
        if (result.ok) { setAdding(false); setInviteUrl(result.inviteUrl ?? null); }
        return result.errors ?? {};
      }}
    />}

    {confirming && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="remove-title">
      <div className="dialog">
        <h3 id="remove-title" className="dialog-title">
          {confirming.status === "ARCHIVED" ? `Permanently delete ${confirming.name}?` : `Remove & Archive ${confirming.name}?`}
        </h3>
        <p className="portal-note">
          {confirming.status === "ARCHIVED"
            ? `This will permanently delete ${confirming.name} and purge all associated records (contract letters, timesheets, expenses, and assignments) from the workspace. This action is exclusive to the Founder and cannot be undone.`
            : `This will move ${confirming.name} to Archived status and sign them out immediately. All historical records (including contract letters, timesheets, and assignments) will be safely preserved.`}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
          <button type="button" className="button button-danger" onClick={() => remove(confirming)} disabled={busy}>
            {busy ? (confirming.status === "ARCHIVED" ? "Deleting…" : "Archiving…") : (confirming.status === "ARCHIVED" ? "Delete permanently" : "Archive account")}
          </button>
        </div>
      </div>
    </div>}
  </div>;
}

/**
 * A per-person exception to their role's defaults.
 *
 * UserPermissionOverride has been honoured by the auth guard since the start —
 * DENY beats ALLOW, and both lapse at `expiresAt` — but nothing could create
 * one, so granting a single capability to a single person meant inventing a
 * whole role for them.
 *
 * An expiry is strongly encouraged: an exception that never lapses is just a
 * role by another name.
 */
function OverrideDialog({ person, permissions, today, busy, onClose, onCall }: {
  person: PersonRow;
  permissions: ReadonlyArray<PermissionOption>;
  today: string;
  busy: boolean;
  onClose: () => void;
  onCall: (url: string, init: RequestInit) => Promise<boolean>;
}) {
  const blank = { permission: permissions[0]?.key ?? "", effect: "ALLOW", reason: "", expiresAt: "" };
  const [form, setForm] = useState(blank);

  const groups = [...new Set(permissions.map((p) => p.group))];

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="ovr-title">
    <div className="dialog dialog--wide">
      <h3 id="ovr-title" className="dialog-title">Exceptions — {person.name}</h3>
      <p className="portal-note">
        {person.roleLabel} by role. Anything set here applies to {person.name} alone and overrides that.
      </p>

      <section className="panel-block">
        <div className="panel-block__head"><h4>In force</h4></div>
        {person.overrides.length === 0
          ? <p className="portal-muted">None — {person.name} has exactly what their role grants.</p>
          : <ul className="timeline timeline--tight">
              {person.overrides.map((o) => <li key={o.key} className="timeline__item">
                <div className="timeline__head">
                  <strong>{o.label}</strong>
                  <span className={`pill${o.effect === "DENY" ? "" : " pill--warn"}`}>{o.effect === "ALLOW" ? "Granted" : "Denied"}</span>
                  {o.expired && <StatusChip status="ARCHIVED" label="lapsed" />}
                </div>
                <p className="timeline__meta">
                  {o.expiresAt ? `${o.expired ? "Expired" : "Expires"} ${o.expiresAt}` : "No expiry"}
                </p>
                {o.reason && <p className="timeline__note">{o.reason}</p>}
                <button
                  type="button"
                  className="row-action row-action--danger"
                  disabled={busy}
                  onClick={() => onCall(`/api/admin/users/${person.id}/overrides?permission=${encodeURIComponent(o.key)}`, { method: "DELETE" })}
                >
                  Remove
                </button>
              </li>)}
            </ul>}
      </section>

      <section className="panel-block">
        <div className="panel-block__head"><h4>Add an exception</h4></div>
        <div className="contact-form panel-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ovr-perm">Capability</label>
              <select id="ovr-perm" value={form.permission} onChange={(e) => setForm({ ...form, permission: e.target.value })}>
                {groups.map((group) => <optgroup key={group} label={group}>
                  {permissions.filter((p) => p.group === group).map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </optgroup>)}
              </select>
            </div>
            <div>
              <label htmlFor="ovr-effect">Effect</label>
              <select id="ovr-effect" value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value })}>
                <option value="ALLOW">Grant it</option>
                <option value="DENY">Take it away</option>
              </select>
            </div>
            <div>
              <label htmlFor="ovr-exp">Expires</label>
              <input id="ovr-exp" type="date" min={today} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              <p className="field-hint">Leave blank for no expiry.</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ovr-why">Reason <em>*</em></label>
              <textarea id="ovr-why" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Covering payroll while Anusha is on leave." />
            </div>
          </div>
          <div className="dialog-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={busy || !form.permission || form.reason.trim().length < 3}
              onClick={async () => { if (await onCall(`/api/admin/users/${person.id}/overrides`, { method: "POST", body: JSON.stringify(form) })) setForm(blank); }}
            >
              {busy ? "Saving…" : "Apply exception"}
            </button>
          </div>
        </div>
      </section>

      <div className="dialog-actions">
        <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Close</button>
      </div>
    </div>
  </div>;
}

function EditDialog({ person, roles, busy, onClose, onSave }: {
  person: PersonRow;
  roles: ReadonlyArray<RoleOption>;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, string>) => Promise<Errors>;
}) {
  const [data, setData] = useState({
    name: person.name,
    email: person.email,
    phone: person.phone,
    jobTitle: person.jobTitle,
    techStack: person.techStack,
    roleId: person.roleId,
  });
  const [errors, setErrors] = useState<Errors>({});

  const update = (key: keyof typeof data, value: string) => {
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-title">
    <div className="dialog dialog--wide">
      <h3 id="edit-title" className="dialog-title">Edit {person.name}</h3>
      <form className="contact-form" noValidate onSubmit={async (event) => { event.preventDefault(); setErrors(await onSave(data)); }}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-name">Full Name <em>*</em></label>
            <input id="edit-name" value={data.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="edit-email">Work Email <em>*</em></label>
            <input id="edit-email" type="email" value={data.email} onChange={(event) => update("email", event.target.value)} aria-invalid={Boolean(errors.email)} />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="edit-phone">Phone Number</label>
            <input id="edit-phone" type="tel" value={data.phone} onChange={(event) => update("phone", event.target.value)} aria-invalid={Boolean(errors.phone)} />
            {errors.phone && <p className="form-error">{errors.phone}</p>}
          </div>
          <div>
            <label htmlFor="edit-jobTitle">Job Title</label>
            <input id="edit-jobTitle" value={data.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} aria-invalid={Boolean(errors.jobTitle)} />
            {errors.jobTitle && <p className="form-error">{errors.jobTitle}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="edit-techStack">Tech Stack & Skills</label>
            <input
              id="edit-techStack"
              value={data.techStack}
              onChange={(event) => update("techStack", event.target.value)}
              placeholder="e.g. Next.js, Node.js, Python, AWS, PostgreSQL"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="edit-role">Role <em>*</em></label>
            <select id="edit-role" value={data.roleId} onChange={(event) => update("roleId", event.target.value)} disabled={person.isSelf} aria-invalid={Boolean(errors.roleId)}>
              {/* Candidate Pool roles are not offered, but the person's own
                  current role is always listed — otherwise an existing Employee
                  would show a blank select, and saving would silently move them
                  to whatever happened to be first. */}
              {roles
                .filter((role) => role.id === person.roleId || !role.viaCandidatePool)
                .map((role) => {
                  const reason = role.id === person.roleId ? "" : roleUnavailableReason(role);
                  return <option key={role.id} value={role.id} disabled={Boolean(reason)}>
                    {role.label}{reason}
                  </option>;
                })}
            </select>
            {person.isSelf ? <p className="field-hint">You cannot change your own role — ask another administrator.</p> : null}
            {errors.roleId ? <p className="form-error">{errors.roleId}</p>
              : <p className="field-hint">Changing someone&apos;s role signs them out so their new access takes effect.</p>}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save Changes"}</button>
        </div>
      </form>
    </div>
  </div>;
}

/**
 * Create a colleague. Roles the viewer may not assign are disabled rather than
 * hidden, so it is clear the option exists and why it is unavailable — the same
 * treatment the edit dialog gives them.
 */
function AddDialog({ roles, busy, onClose, onSave }: {
  roles: ReadonlyArray<RoleOption>;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, string>) => Promise<Errors>;
}) {
  const assignable = selectableRoles(roles).filter((role) => !roleUnavailableReason(role));
  const [data, setData] = useState({ name: "", email: "", phone: "", jobTitle: "", techStack: "", roleId: assignable[0]?.id ?? "" });
  const [errors, setErrors] = useState<Errors>({});

  const update = (key: keyof typeof data, value: string) => {
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-title">
    <div className="dialog dialog--wide">
      <h3 id="add-title" className="dialog-title">Add a person</h3>
      <form className="contact-form" noValidate onSubmit={async (event) => { event.preventDefault(); setErrors(await onSave(data)); }}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="add-name">Full Name <em>*</em></label>
            <input id="add-name" autoFocus value={data.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="add-email">Work Email <em>*</em></label>
            <input id="add-email" type="email" value={data.email} onChange={(event) => update("email", event.target.value)} aria-invalid={Boolean(errors.email)} />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="add-phone">Phone Number</label>
            <input id="add-phone" type="tel" value={data.phone} onChange={(event) => update("phone", event.target.value)} aria-invalid={Boolean(errors.phone)} />
            {errors.phone && <p className="form-error">{errors.phone}</p>}
          </div>
          <div>
            <label htmlFor="add-jobTitle">Job Title</label>
            <input id="add-jobTitle" value={data.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} aria-invalid={Boolean(errors.jobTitle)} />
            {errors.jobTitle && <p className="form-error">{errors.jobTitle}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="add-techStack">Tech Stack & Skills</label>
            <input
              id="add-techStack"
              value={data.techStack}
              onChange={(event) => update("techStack", event.target.value)}
              placeholder="e.g. React, Next.js, Node.js, Python, AWS"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="add-role">Role <em>*</em></label>
            <select id="add-role" value={data.roleId} onChange={(event) => update("roleId", event.target.value)} aria-invalid={Boolean(errors.roleId)}>
              {selectableRoles(roles).map((role) => {
                const reason = roleUnavailableReason(role);
                return <option key={role.id} value={role.id} disabled={Boolean(reason)}>
                  {role.label}{reason}
                </option>;
              })}
            </select>
            {errors.roleId ? <p className="form-error">{errors.roleId}</p>
              : <p className="field-hint">They choose their own password from an emailed invite — nobody else ever knows it.</p>}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Adding…" : "Send Invite"}</button>
        </div>
      </form>
    </div>
  </div>;
}
