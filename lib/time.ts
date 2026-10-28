// Time-zone helpers. Every date the app shows or groups by is in the company's time zone,
// never the server's (Vercel runs in UTC) or the browser's.

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-AU", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partsCache.set(tz, f);
  }
  return f;
}

export function localParts(at: Date, tz: string) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(at)) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

/** 'YYYY-MM-DD' of the instant in the zone. */
export function localDate(at: Date, tz: string): string {
  const { y, m, d } = localParts(at, tz);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 'HH:MM' (24 h) of the instant in the zone, for <input type="time">. */
export function localTime(at: Date, tz: string): string {
  const { hh, mm } = localParts(at, tz);
  return `${pad(hh)}:${pad(mm)}`;
}

function offsetMs(at: Date, tz: string): number {
  const { y, m, d, hh, mm, ss } = localParts(at, tz);
  return Date.UTC(y, m - 1, d, hh, mm, ss) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant when the wall clock in `tz` reads `date` `time` ('YYYY-MM-DD', 'HH:MM'). */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = new Date(wall - offsetMs(new Date(wall), tz));
  // A second pass settles instants next to a daylight-saving change.
  guess = new Date(wall - offsetMs(guess, tz));
  return guess;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Day of week of a plain date, 0 = Sunday. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The first day of the work week containing `date`. */
export function weekStartOf(date: string, weekStart: number): string {
  return addDays(date, -((dayOfWeek(date) - weekStart + 7) % 7));
}

/** UTC bounds [from, to) of the 7-day week starting on the local date `weekStart`. */
export function weekBounds(weekStartDate: string, tz: string) {
  return { from: zonedToUtc(weekStartDate, "00:00", tz), to: zonedToUtc(addDays(weekStartDate, 7), "00:00", tz) };
}

export function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function fmtTime(at: Date | string, tz: string) {
  return new Date(at).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

export function fmtDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

export function fmtDateTime(at: Date | string, tz: string) {
  return new Date(at).toLocaleString("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** 450 → '7h 30m'. */
export function fmtMinutes(min: number) {
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60), m = a % 60;
  return h ? `${sign}${h}h ${pad(m)}m` : `${sign}${m}m`;
}

/** 450 → '7.50' (decimal hours, for payroll). */
export function decimalHours(min: number) {
  return (min / 60).toFixed(2);
}

/** 'Mon' and '27 Oct' separately, for column headings. */
export function fmtWeekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "short" });
}
export function fmtDayMonth(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", { timeZone: "UTC", day: "numeric", month: "short" });
}
