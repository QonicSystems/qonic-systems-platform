"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Action = { to: string; label: string; description: string; tone: "primary" | "outline" | "danger" };

/** Renders only the transitions the SERVER said this viewer may perform. */
export function TransitionActions({
  letterId,
  actions,
  canDelete,
}: {
  letterId: string;
  actions: ReadonlyArray<Action>;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<Action | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const run = async (action: Action, withNote: string) => {
    setPending(action.to);
    setMessage(null);
    try {
      const response = await fetch(`/api/contracts/${letterId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: action.to, note: withNote }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage({ tone: "error", text: result.message ?? "Unable to complete that action." });
        return;
      }
      setMessage({ tone: "success", text: result.message ?? "Done." });
      setAsking(null);
      setNote("");
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setPending(null);
    }
  };

  const removeLetter = async () => {
    setPending("DELETE");
    setMessage(null);
    try {
      const response = await fetch(`/api/contracts/${letterId}`, { method: "DELETE" });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage({ tone: "error", text: result.message ?? "Unable to delete contract letter." });
        return;
      }
      router.replace("/contracts");
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Unable to reach the server." });
    } finally {
      setPending(null);
      setDeleting(false);
    }
  };

  if (actions.length === 0 && !canDelete && !message) return null;

  return (
    <div className="portal-section">
      {message && <p className={`form-status form-status--${message.tone}`} role="status">{message.text}</p>}

      {(actions.length > 0 || canDelete) && (
        <div className="action-bar flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) => (
              <button
                key={action.to}
                type="button"
                className={`button button-${action.tone}`}
                disabled={pending !== null}
                title={action.description}
                onClick={() =>
                  action.to === "CHANGES_REQUESTED" || action.to === "REVOKED"
                    ? setAsking(action)
                    : run(action, "")
                }
              >
                {pending === action.to ? "Working…" : action.label}
              </button>
            ))}
          </div>

          {canDelete && (
            <button
              type="button"
              className="button button-danger ml-auto"
              disabled={pending !== null}
              onClick={() => setDeleting(true)}
            >
              {pending === "DELETE" ? "Deleting…" : "Delete Contract Letter"}
            </button>
          )}
        </div>
      )}

      {asking && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-title">
          <div className="dialog">
            <h3 id="note-title" className="dialog-title">{asking.label}</h3>
            <p className="portal-note">{asking.description} This note is recorded permanently against the letter.</p>
            <div className="contact-form mt-4">
              <label htmlFor="note">Reason</label>
              <textarea id="note" rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain what needs to change…" />
            </div>
            <div className="dialog-actions">
              <button type="button" className="button button-outline" onClick={() => { setAsking(null); setNote(""); }} disabled={pending !== null}>Cancel</button>
              <button type="button" className={`button button-${asking.tone}`} onClick={() => run(asking, note)} disabled={pending !== null || note.trim().length < 3}>
                {pending ? "Working…" : asking.label}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="del-contract-title">
          <div className="dialog">
            <h3 id="del-contract-title" className="dialog-title">Permanently Delete Contract Letter?</h3>
            <p className="portal-note">
              This contract letter will be permanently deleted from the system and all associated event history will be cleared. This action cannot be undone.
            </p>
            <div className="dialog-actions mt-4">
              <button type="button" className="button button-outline" onClick={() => setDeleting(false)} disabled={pending !== null}>Cancel</button>
              <button type="button" className="button button-danger" onClick={removeLetter} disabled={pending !== null}>
                {pending === "DELETE" ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
