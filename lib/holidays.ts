// Queensland public holidays from the standard rules (Holidays Act 1983 (Qld)), to pre-fill a
// company's holiday list. Local show holidays differ by region and must be added by hand, and the
// admin should check the list against qld.gov.au: governments can add one-off days.
import { addDays, dayOfWeek } from "./time";

export type HolidayRow = { date: string; name: string; from_time: string; to_time: string };

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

const firstMonday = (y: number, m: number) => {
  const first = iso(y, m, 1);
  return addDays(first, (8 - dayOfWeek(first)) % 7);
};

/** The next Monday after a weekend date. */
const mondayAfter = (date: string) => addDays(date, dayOfWeek(date) === 6 ? 2 : 1);

export function queenslandHolidays(y: number): HolidayRow[] {
  const day = (date: string, name: string): HolidayRow => ({ date, name, from_time: "00:00", to_time: "24:00" });
  const out: HolidayRow[] = [];
  const withWeekendMonday = (date: string, name: string) => {
    out.push(day(date, name));
    const dow = dayOfWeek(date);
    if (dow === 0 || dow === 6) out.push(day(mondayAfter(date), `${name} (additional day)`));
  };

  withWeekendMonday(iso(y, 1, 1), "New Year's Day");
  withWeekendMonday(iso(y, 1, 26), "Australia Day");
  const easter = easterSunday(y);
  out.push(day(addDays(easter, -2), "Good Friday"), day(addDays(easter, -1), "Easter Saturday"),
    day(easter, "Easter Sunday"), day(addDays(easter, 1), "Easter Monday"));
  const anzac = iso(y, 4, 25);
  out.push(day(anzac, "Anzac Day"));
  if (dayOfWeek(anzac) === 0) out.push(day(addDays(anzac, 1), "Anzac Day (additional day)"));
  out.push(day(firstMonday(y, 5), "Labour Day"));
  out.push(day(firstMonday(y, 10), "King's Birthday"));
  out.push({ date: iso(y, 12, 24), name: "Christmas Eve (from 6 pm)", from_time: "18:00", to_time: "24:00" });
  out.push(day(iso(y, 12, 25), "Christmas Day"), day(iso(y, 12, 26), "Boxing Day"));
  // Christmas or Boxing Day on a weekend: 27 and/or 28 December become holidays.
  const xmasDow = dayOfWeek(iso(y, 12, 25));
  if (xmasDow === 6 || xmasDow === 0) out.push(day(iso(y, 12, 27), "Christmas Day (additional day)"));
  const boxingDow = dayOfWeek(iso(y, 12, 26));
  if (boxingDow === 6 || boxingDow === 0) out.push(day(iso(y, 12, 28), "Boxing Day (additional day)"));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
