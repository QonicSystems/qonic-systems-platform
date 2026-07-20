import Link from "next/link";
import { ProfileForm } from "@/components/portal/profile-form";
import { requireAuth } from "@/lib/auth/guard";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const context = await requireAuth();

  return <div className="portal-page portal-page--narrow">
    <header className="portal-page-head">
      <p className="eyebrow">{context.role.label}</p>
      <h1 className="portal-title">My Profile</h1>
      <p className="portal-lead">Update how you appear to the rest of the team.</p>
    </header>

    <section className="portal-panel">
      <ProfileForm initial={{
        name: context.user.name,
        email: context.user.email,
        phone: context.user.phone ?? "",
        jobTitle: context.user.jobTitle ?? "",
      }} />
    </section>

    <p className="portal-note">
      Want to change your password? Go to <Link className="text-link" href="/profile/security">account security</Link>.
    </p>
  </div>;
}
