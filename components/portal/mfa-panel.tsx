"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MfaPanel({ enabled, available }: { enabled: boolean; available: boolean }) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const call = async (method: string, body?: unknown) => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch("/api/profile/mfa", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const result = await res.json() as { message?: string; secret?: string; uri?: string; backupCodes?: string[] };
      setNotice({ tone: res.ok ? "success" : "error", text: result.message ?? "Done." });
      return res.ok ? result : null;
    } catch { setNotice({ tone: "error", text: "Unable to reach the server." }); return null; }
    finally { setBusy(false); }
  };

  if (!available) {
    return <p className="portal-note">
      Two-factor authentication needs <code>ENCRYPTION_KEY</code> configured before it can be switched on — the secret is stored encrypted.
    </p>;
  }

  if (backupCodes) {
    return <div>
      <p className="form-status form-status--success" role="status">
        Two-factor authentication is on. Save these recovery codes somewhere safe — they are shown once and each works only once.
      </p>
      <ul className="backup-codes">{backupCodes.map((backup) => <li key={backup}>{backup}</li>)}</ul>
      <button type="button" className="button button-primary" onClick={() => { setBackupCodes(null); router.refresh(); }}>I have saved them</button>
    </div>;
  }

  if (enabled) {
    return <div>
      {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}
      <p className="portal-note">Two-factor authentication is <strong>on</strong>. You will be asked for a code each time you sign in.</p>
      <div className="contact-form mt-4">
        <label htmlFor="mfa-pw">Confirm your password to turn it off</label>
        <input id="mfa-pw" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      <button type="button" className="button button-danger mt-4" disabled={busy || !password}
        onClick={async () => { if (await call("DELETE", { password })) { setPassword(""); router.refresh(); } }}>
        {busy ? "Working…" : "Turn off two-factor"}
      </button>
    </div>;
  }

  return <div>
    {notice && <p className={`form-status form-status--${notice.tone}`} role="status">{notice.text}</p>}

    {!secret ? <>
      <p className="portal-note">Add a second step at sign-in using an authenticator app such as Google Authenticator or 1Password.</p>
      <button type="button" className="button button-primary mt-4" disabled={busy}
        onClick={async () => { const result = await call("POST"); if (result?.secret) { setSecret(result.secret); setUri(result.uri ?? null); } }}>
        {busy ? "Preparing…" : "Set up two-factor"}
      </button>
    </> : <>
      <p className="portal-note">Scan this in your authenticator app, or type the key in by hand, then enter the 6-digit code it shows.</p>
      <code className="mfa-secret">{secret}</code>
      {uri && <p className="field-hint">Manual entry: type the key above. Account: the URI is <code>{uri.slice(0, 48)}…</code></p>}
      <div className="contact-form mt-4">
        <label htmlFor="mfa-code">6-digit code</label>
        <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(event) => setCode(event.target.value)} />
      </div>
      <button type="button" className="button button-primary mt-4" disabled={busy || code.replace(/\s/g, "").length !== 6}
        onClick={async () => { const result = await call("PUT", { code }); if (result?.backupCodes) setBackupCodes(result.backupCodes); }}>
        {busy ? "Checking…" : "Confirm and switch on"}
      </button>
    </>}
  </div>;
}
