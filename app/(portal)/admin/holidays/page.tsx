import { HolidayTable } from "@/components/admin/holiday-table";
import { can, requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Holidays" };

/**
 * Public holidays feed the working-day count in lib/leave/leave.ts. They were
 * previously seed-script-only, so keeping them current needed a developer.
 *
 * Viewing needs only `leave.request` — anyone booking leave benefits from
 * seeing which days are already excluded. Editing needs `leave.manage`.
 */
export default async function HolidaysPage() {
  const context = await requirePermission("admin.access");
  const holidays = await db.holiday.findMany({ orderBy: { date: "asc" } });

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  return <section className="portal-section">
    <h2 className="portal-section-title">Public holidays</h2>
    <p className="portal-note">
      Days excluded from leave calculations, alongside weekends. Removing one makes it a normal
      working day for future requests — leave already approved keeps the day count it was granted with.
    </p>

    <HolidayTable
      canManage={can(context, "leave.manage")}
      holidays={holidays.map((holiday) => ({
        id: holiday.id,
        date: holiday.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        label: holiday.name,
        year: holiday.date.getUTCFullYear(),
        past: holiday.date < startOfToday,
      }))}
    />
  </section>;
}
