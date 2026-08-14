"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/status-chip";

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  roleId: string;
  roleLabel: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  lastLoginAt: string | null;
  /** Computed on the server from the viewer's seniority. */
  canEdit: boolean;
  /** The viewer's own row: identity is editable, role and removal are not. */
  isSelf: boolean;
};

type RoleOption = { id: string; label: string; assignable: boolean };
type Errors = Partial<Record<"name" | "email" | "phone" | "jobTitle" | "roleId", string>>;

export function PeopleTable({ people, roles, canDeactivate, canDelete, canCreate }: {
  people: ReadonlyArray<PersonRow>;
  roles: ReadonlyArray<RoleOption>;
  canDeactivate: boolean;
  canDelete: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  // Shown only when email could not be delivered, so the invite can still be
  // handed over. It is a bearer token, so it is never persisted anywhere.
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [confirming, setConfirming] = useState<PersonRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const act = async (url: string, init: RequestInit) => {
    setBusy(true);
    try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = await response.json() as { message?: string; errors?: Errors; inviteUrl?: string };
      if (!response.ok) { setNotice({ tone: "error", text: result.message ?? "Unable to complete that action." }); return result; }
      setNotice({ tone: "success", text: result.message ?? "Done." });
      router.refresh();
      return result;
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
      return {};
    } finally { setBusy(false); }
  };

  const toggleStatus = async (person: PersonRow) => {
    await act(`/api/admin/users/${person.id}/status`, { method: "POST", body: JSON.stringify({ active: person.status !== "ACTIVE" }) });
  };

  const remove = async (person: PersonRow) => {
    await act(`/api/admin/users/${person.id}`, { method: "DELETE" });
    setConfirming(null);
  };

  return <div>
    {canCreate && <div className="action-bar">
      <button type="button" className="button button-primary" onClick={() => { setAdding(true); setNotice(null); setInviteUrl(null); }} disabled={busy}>
        Add Person
      </button>
    </div>}

    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    {inviteUrl && <div className="portal-panel">
      <p className="portal-note">Send them this link so they can choose a password. It expires in seven days.</p>
      <p className="mfa-secret">{inviteUrl}</p>
    </div>}

    <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead>
          <tr>
            <th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th>
            <th scope="col">Last signed in</th><th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => <tr key={person.id}>
            <th scope="row"><strong>{person.name}</strong><span>{person.email}</span></th>
            <td>{person.roleLabel}</td>
            <td><StatusChip status={person.status} /></td>
            <td>{person.lastLoginAt ?? "Never"}</td>
            <td>
              {person.canEdit ? <div className="row-actions">
                <button type="button" className="row-action" onClick={() => { setEditing(person); setNotice(null); }} disabled={busy}>Edit</button>
                {canDeactivate && !person.isSelf && <button type="button" className="row-action" onClick={() => toggleStatus(person)} disabled={busy}>
                  {person.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                </button>}
                {canDelete && !person.isSelf && <button type="button" className="row-action row-action--danger" onClick={() => { setConfirming(person); setNotice(null); }} disabled={busy}>Remove</button>}
              </div> : <span className="row-locked">No access</span>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {editing && <EditDialog
      person={editing}
      roles={roles}
      busy={busy}
      onClose={() => setEditing(null)}
      onSave={async (payload) => {
        const result = await act(`/api/admin/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        if (!result?.errors) setEditing(null);
        return result?.errors ?? {};
      }}
    />}

    {adding && <AddDialog
      roles={roles}
      busy={busy}
      onClose={() => setAdding(false)}
      onSave={async (payload) => {
        const result = await act("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
        if (!result?.errors) { setAdding(false); setInviteUrl(result?.inviteUrl ?? null); }
        return result?.errors ?? {};
      }}
    />}

    {confirming && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="remove-title">
      <div className="dialog">
        <h3 id="remove-title" className="dialog-title">Remove {confirming.name}?</h3>
        <p className="portal-note">
          This permanently deletes the account and signs them out. It cannot be undone.
          If they have contract letters on record the removal will be refused — deactivate them instead.
        </p>
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
          <button type="button" className="button button-danger" onClick={() => remove(confirming)} disabled={busy}>
            {busy ? "Removing…" : "Remove permanently"}
          </button>
        </div>
      </div>
    </div>}
  </div>;
}

function EditDialog({ person, roles, busy, onClose, onSave }: {
  person: PersonRow;
  roles: ReadonlyArray<RoleOption>;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, string>) => Promise<Errors>;
}) {
  const [data, setData] = useState({ name: person.name, email: person.email, phone: person.phone, jobTitle: person.jobTitle, roleId: person.roleId });
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
            <input id="edit-jobTitle" value={data.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="edit-role">Role <em>*</em></label>
            <select id="edit-role" value={data.roleId} onChange={(event) => update("roleId", event.target.value)} disabled={person.isSelf} aria-invalid={Boolean(errors.roleId)}>
              {roles.map((role) => <option key={role.id} value={role.id} disabled={!role.assignable && role.id !== person.roleId}>
                {role.label}{!role.assignable && role.id !== person.roleId ? " — not assignable by you" : ""}
              </option>)}
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
  const assignable = roles.filter((role) => role.assignable);
  const [data, setData] = useState({ name: "", email: "", phone: "", jobTitle: "", roleId: assignable[0]?.id ?? "" });
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
            <input id="add-jobTitle" value={data.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="add-role">Role <em>*</em></label>
            <select id="add-role" value={data.roleId} onChange={(event) => update("roleId", event.target.value)} aria-invalid={Boolean(errors.roleId)}>
              {roles.map((role) => <option key={role.id} value={role.id} disabled={!role.assignable}>
                {role.label}{!role.assignable ? " — not assignable by you" : ""}
              </option>)}
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
