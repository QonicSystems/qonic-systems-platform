import { PasswordForm } from "@/components/portal/password-form";
import { MfaPanel } from "@/components/portal/mfa-panel";
import { SessionList, type SessionRow } from "@/components/portal/session-list";
import { requireAuth } from "@/lib/auth/guard";
import { isEncryptionConfigured } from "@/lib/crypto";
import { db } from "@/lib/db";

export const metadata = { title: "Account Security" };

/** Turns a raw user-agent into something a person can recognise. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : "Browser";
  const platform = /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Windows/.test(userAgent) ? "Windows"
    : /Linux/.test(userAgent) ? "Linux"
    : "Unknown";
  return `${browser} on ${platform}`;
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const context = await requireAuth();
  const first = (await searchParams).first === "1";

  const [sessions, account] = await Promise.all([
    db.session.findMany({ where: { userId: context.user.id }, orderBy: { createdAt: "desc" } }),
    db.user.findUniqueOrThrow({ where: { id: context.user.id }, select: { totpEnabled: true } }),
  ]);
  const rows: SessionRow[] = sessions.map((session) => ({
    id: session.id,
    current: session.id === context.sessionId,
    device: describeDevice(session.userAgent),
    ip: session.ipAddress ?? "—",
    signedIn: session.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    expires: session.expiresAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
  }));

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">Account Security</p>
      <h1 className="portal-title">{first ? "Set your password" : "Account security"}</h1>
      <p className="portal-lead">
        {first
          ? "This account was created with a temporary password. Choose your own before continuing."
          : "Change your password and review where you are signed in."}
      </p>
    </header>

    {context.user.mustChangePassword && <p className="form-status form-status--error" role="alert">
      You must set a new password before using the rest of the workspace.
    </p>}

    <section className="portal-section">
      <h2 className="portal-section-title">Change password</h2>
      <div className="portal-panel"><PasswordForm mustChange={context.user.mustChangePassword} /></div>
    </section>

    {!context.user.mustChangePassword && <section className="portal-section">
      <h2 className="portal-section-title">Two-factor authentication</h2>
      <div className="portal-panel">
        <MfaPanel enabled={account.totpEnabled} available={isEncryptionConfigured()} />
      </div>
    </section>}

    {/* Hidden during the forced first-time change so the page stays single-purpose. */}
    {!context.user.mustChangePassword && <section className="portal-section">
      <h2 className="portal-section-title">Where you are signed in</h2>
      <p className="portal-note">Signing out elsewhere is the quickest way to end a session you do not recognise.</p>
      <SessionList sessions={rows} />
    </section>}
  </div>;
}
