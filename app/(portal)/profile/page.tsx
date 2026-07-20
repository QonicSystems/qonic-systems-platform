import Link from "next/link";
import { ProfileForm } from "@/components/portal/profile-form";
import { requireAuth } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const context = await requireAuth();
  const record = await db.user.findUniqueOrThrow({
    where: { id: context.user.id },
    select: { address: true, emergencyName: true, emergencyPhone: true, emergencyRelation: true },
  });

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
        photoUrl: context.user.photoUrl ?? "",
        address: record.address ?? "",
        emergencyName: record.emergencyName ?? "",
        emergencyPhone: record.emergencyPhone ?? "",
        emergencyRelation: record.emergencyRelation ?? "",
      }} />
    </section>

    <p className="portal-note">
      Want to change your password? Go to <Link className="text-link" href="/profile/security">account security</Link>.
    </p>
  </div>;
}
