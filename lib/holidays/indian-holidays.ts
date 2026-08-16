import Holidays from "date-holidays";

export type PublicHolidayItem = {
  date: string; // YYYY-MM-DD
  name: string;
  region: string;
};

/**
 * Pure dynamic calculation and retrieval of Indian Public Holidays for any given year.
 *
 * Uses the open-source `date-holidays` rule-based engine to dynamically compute
 * Indian national holidays, Gazetted days, and state-level public holidays across all
 * 36 Indian states and union territories for ANY past, present, or future year.
 *
 * Zero hardcoded date dictionaries.
 */
export async function getIndianPublicHolidays(years?: number[]): Promise<PublicHolidayItem[]> {
  const currentYear = new Date().getFullYear();
  const targetYears = years && years.length > 0 ? years : [currentYear - 1, currentYear, currentYear + 1];

  const hd = new Holidays();
  const holidaysMap = new Map<string, string>();

  for (const year of targetYears) {
    // 1. National Indian Public Holidays
    hd.init("IN");
    const nationalHolidays = hd.getHolidays(year) || [];
    for (const item of nationalHolidays) {
      const isoDate = item.date.slice(0, 10);
      if (!holidaysMap.has(isoDate)) {
        holidaysMap.set(isoDate, item.name);
      }
    }

    // 2. State and Union Territory Gazetted Public Holidays
    const states = Object.keys(hd.getStates("IN") || {});
    for (const stateCode of states) {
      try {
        hd.init("IN", stateCode);
        const stateHolidays = hd.getHolidays(year) || [];
        for (const item of stateHolidays) {
          const isoDate = item.date.slice(0, 10);
          if (!holidaysMap.has(isoDate)) {
            holidaysMap.set(isoDate, item.name);
          }
        }
      } catch {
        // Continue if a specific state code is unavailable
      }
    }
  }

  // 3. Return sorted, unique public holiday list
  return Array.from(holidaysMap.entries())
    .map(([date, name]) => ({ date, name, region: "IN" }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
