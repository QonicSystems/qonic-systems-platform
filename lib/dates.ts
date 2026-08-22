/**
 * The standard display format for a *project*-related date across the app —
 * "20-Aug-2026 (Thu)". Scoped to project dates deliberately: invoices,
 * leave, and contracts each already have their own established date
 * rendering and are out of scope for this helper.
 */
export function formatProjectDate(value: Date): string {
  const day = value.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "UTC" });
  const month = value.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const year = value.toLocaleDateString("en-GB", { year: "numeric", timeZone: "UTC" });
  const weekday = value.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return `${day}-${month}-${year} (${weekday})`;
}
