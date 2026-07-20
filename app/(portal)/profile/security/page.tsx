import { PasswordForm } from "@/components/portal/password-form";
import { requireAuth } from "@/lib/auth/guard";

export const metadata = { title: "Account Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const context = await requireAuth();
  const first = (await searchParams).first === "1";

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">Account Security</p>
      <h1 className="portal-title">{first ? "Set your password" : "Change your password"}</h1>
      <p className="portal-lead">
        {first
          ? "This account was created with a temporary password. Choose your own before continuing."
          : "Updating your password signs you out of every other device."}
      </p>
    </header>

    {context.user.mustChangePassword && <p className="form-status form-status--error" role="alert">
      You must set a new password before using the rest of the workspace.
    </p>}

    <section className="portal-panel">
      <PasswordForm mustChange={context.user.mustChangePassword} />
    </section>
  </div>;
}
