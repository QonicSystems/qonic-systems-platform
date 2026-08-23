"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEADERSHIP_MAX_RANK } from "@/lib/auth/roles";

export type RoleRow = {
  id: string;
  key: string;
  label: string;
  description: string;
  rank: number;
  isSystem: boolean;
  isSuperAdmin: boolean;
  viaCandidatePool: boolean;
  userCount: number;
  canEdit: boolean;
  canDelete: boolean;
};

type Errors = Partial<Record<"label" | "description" | "rank", string>>;
type ActResult = { ok: boolean; errors?: Errors };

type RoleDraft = { label: string; description: string; rank: string; viaCandidatePool: boolean };

const NEW_ROLE: RoleDraft = { label: "", description: "", rank: "20", viaCandidatePool: false };

/** Shown in place of the Delete button when the server would refuse it. */
function deleteBlockedReason(role: RoleRow): string {
  if (role.isSuperAdmin) return "Super admin — cannot be deleted";
  if (role.userCount > 0) {
    return role.userCount === 1
      ? "1 account holds this — move them first"
      : `${role.userCount} accounts hold this — move them first`;
  }
  return "Not yours to delete";
}

/**
 * Create, rename, re-rank and delete roles.
 *
 * Lives on People rather than on Roles & Permissions because People is where a
 * role is *consumed* — it is the Add/Edit role picker — so creating one belongs
 * in that flow. Roles & Permissions answers a different question (role ×
 * capability) and picks up a new column on its own as soon as the row exists.
 *
 * Every action here is re-checked by its own endpoint; the `canEdit`/`canDelete`
 * flags are resolved on the server and this is a dumb renderer, the same
 * arrangement as people-table.tsx.
 */
export function RoleManager({ roles }: { roles: ReadonlyArray<RoleRow> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const act = async (url: string, init: RequestInit): Promise<ActResult> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = (await res.json().catch(() => ({}))) as { message?: string; errors?: Errors };
      if (!res.ok) {
        setNotice({ tone: "error", text: result.message ?? "Unable to complete that request." });
        // A 404 or 409 means the row on screen is stale; reload so the next
        // attempt is made against what is actually there.
        if (res.status === 404 || res.status === 409) router.refresh();
        return { ok: false, errors: result.errors };
      }
      setNotice({ tone: "success", text: result.message ?? "Updated." });
      router.refresh();
      return { ok: true };
    } catch {
      setNotice({ tone: "error", text: "Unable to reach the server." });
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };

  const remove = async (role: RoleRow) => {
    if ((await act(`/api/admin/roles/${role.id}`, { method: "DELETE" })).ok) setDeleting(null);
  };

  return <>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    <div className="flex items-center justify-between gap-3 mb-3">
      <p className="portal-note m-0">
        A role is a row, not code — create one here, then switch its capabilities on in{" "}
        <Link className="text-link" href="/admin/permissions">Roles &amp; Permissions</Link>.
      </p>
      <button type="button" className="button button-primary" onClick={() => { setCreating(true); setNotice(null); }} disabled={busy}>
        Create a role
      </button>
    </div>

    <div className="matrix-scroll">
      <table className="matrix matrix--people">
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Rank</th>
            <th scope="col">Accounts</th>
            <th scope="col">Added from</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => <tr key={role.id}>
            <th scope="row">
              <strong>{role.label}</strong>
              <span className="font-mono text-xs text-slate-500">{role.key}{role.isSystem ? " · built-in" : ""}</span>
            </th>
            <td>{role.rank}{role.isSuperAdmin ? " · super admin" : ""}</td>
            <td>{role.userCount}</td>
            <td>{role.viaCandidatePool ? "Candidate Pool" : "People"}</td>
            <td>
              <div className="row-actions">
                <button
                  type="button"
                  className="row-action"
                  onClick={() => { setEditing(role); setNotice(null); }}
                  disabled={busy || !role.canEdit}
                >
                  Edit
                </button>
                <Link className="row-action" href="/admin/permissions">Capabilities</Link>
                {role.canDelete ? (
                  <button
                    type="button"
                    className="row-action row-action--danger"
                    onClick={() => { setDeleting(role); setNotice(null); }}
                    disabled={busy}
                  >
                    Delete
                  </button>
                ) : (
                  // Stated, not just disabled. A greyed-out button with the
                  // reason hidden in a `title` reads as broken — browsers
                  // frequently do not show a tooltip on a disabled control at all.
                  <span className="row-locked">{deleteBlockedReason(role)}</span>
                )}
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {creating && <RoleDialog
      title="Create a role"
      submitLabel="Create role"
      initial={NEW_ROLE}
      busy={busy}
      rankLocked={false}
      onClose={() => setCreating(false)}
      onSave={async (draft) => {
        const result = await act("/api/admin/roles", { method: "POST", body: JSON.stringify({ ...draft, rank: Number(draft.rank) }) });
        if (result.ok) setCreating(false);
        return result.errors ?? {};
      }}
    />}

    {editing && <RoleDialog
      title={`Edit ${editing.label}`}
      submitLabel="Save changes"
      initial={{
        label: editing.label,
        description: editing.description,
        rank: String(editing.rank),
        viaCandidatePool: editing.viaCandidatePool,
      }}
      busy={busy}
      // Built-in roles have their rank and account source re-applied by the
      // deploy seed, so the API refuses those edits — say so up front rather
      // than letting the CEO fill the field in and be rejected.
      rankLocked={editing.isSystem}
      holders={editing.userCount}
      onClose={() => setEditing(null)}
      onSave={async (draft) => {
        const result = await act(`/api/admin/roles/${editing.id}`, { method: "PATCH", body: JSON.stringify({ ...draft, rank: Number(draft.rank) }) });
        if (result.ok) setEditing(null);
        return result.errors ?? {};
      }}
    />}

    {deleting && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="role-del-title">
      <div className="dialog">
        <h3 id="role-del-title" className="dialog-title">Delete {deleting.label}?</h3>
        <p className="portal-note">
          The role and its capability toggles are removed permanently. Nobody holds it, so no account is affected.
        </p>
        {deleting.isSystem && <p className="portal-note mt-2">
          This is a <strong>built-in</strong> role. Deleting it also marks it retired, so the deploy seed will not
          recreate it — that is what makes the deletion stick. To bring it back, create it again here.
        </p>}
        {deleting.viaCandidatePool && <p className="portal-note mt-2">
          It is the role the <strong>Candidate Pool</strong> uses for new staff accounts. With it gone, &ldquo;Create
          Employee Account&rdquo; has nothing to assign until another role is marked the same way.
        </p>}
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => setDeleting(null)} disabled={busy}>Cancel</button>
          <button type="button" className="button button-danger" onClick={() => remove(deleting)} disabled={busy}>
            {busy ? "Deleting…" : "Delete role"}
          </button>
        </div>
      </div>
    </div>}
  </>;
}

function RoleDialog({ title, submitLabel, initial, busy, rankLocked, holders = 0, onClose, onSave }: {
  title: string;
  submitLabel: string;
  initial: RoleDraft;
  busy: boolean;
  rankLocked: boolean;
  holders?: number;
  onClose: () => void;
  onSave: (draft: RoleDraft) => Promise<Errors>;
}) {
  const [data, setData] = useState<RoleDraft>(initial);
  const [errors, setErrors] = useState<Errors>({});

  const update = <K extends keyof RoleDraft>(key: K, value: RoleDraft[K]) => {
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const rankChanged = data.rank !== initial.rank;

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="role-title">
    <div className="dialog dialog--wide">
      <h3 id="role-title" className="dialog-title">{title}</h3>
      <form className="contact-form" noValidate onSubmit={async (event) => { event.preventDefault(); setErrors(await onSave(data)); }}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="role-label">Role name <em>*</em></label>
            <input
              id="role-label"
              autoFocus
              value={data.label}
              onChange={(event) => update("label", event.target.value)}
              placeholder="e.g. Legal, Marketing, Account Manager"
              aria-invalid={Boolean(errors.label)}
            />
            {errors.label ? <p className="form-error">{errors.label}</p>
              : <p className="field-hint">A new role starts with no capabilities — switch them on in Roles &amp; Permissions.</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="role-description">Description</label>
            <input
              id="role-description"
              value={data.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="What this role is for."
              aria-invalid={Boolean(errors.description)}
            />
            {errors.description && <p className="form-error">{errors.description}</p>}
          </div>

          <div>
            <label htmlFor="role-rank">Seniority rank <em>*</em></label>
            <input
              id="role-rank"
              type="number"
              min={1}
              max={999}
              value={data.rank}
              onChange={(event) => update("rank", event.target.value)}
              disabled={rankLocked}
              aria-invalid={Boolean(errors.rank)}
            />
            {errors.rank ? <p className="form-error">{errors.rank}</p>
              : rankLocked
                ? <p className="field-hint">Fixed for built-in roles — the deploy seed re-applies it.</p>
                : <p className="field-hint">
                    Lower is more senior. CEO is 0, Co-Founder 10, Employee 50. Rank {LEADERSHIP_MAX_RANK} or
                    lower counts as leadership: approval notifications, client ownership, and no delivery allocation.
                  </p>}
          </div>

          <div className="sm:col-span-2">
            <label className="inline-check" htmlFor="role-via-pool">
              <input
                id="role-via-pool"
                type="checkbox"
                checked={data.viaCandidatePool}
                onChange={(event) => update("viaCandidatePool", event.target.checked)}
                disabled={rankLocked}
              />
              <span>
                Accounts in this role are added from the Candidate Pool, not from People. Administration &rarr; People
                will refuse to create or move anyone into it.
              </span>
            </label>
          </div>
        </div>

        {rankChanged && holders > 0 && <p className="form-status form-status--error" role="status">
          Changing the rank signs out {holders} account{holders === 1 ? "" : "s"} so the new seniority takes effect.
        </p>}

        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        </div>
      </form>
    </div>
  </div>;
}
