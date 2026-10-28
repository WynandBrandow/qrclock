// Turns an employee's clock events into shifts, and shifts into weekly totals.
// Pure functions: no database, no clock except the `now` passed in.
//
// Rounding: each shift's worked and break time is rounded to the minute once; weekly totals add
// the rounded shifts. Clock times themselves are never rounded.

import { addDays, dayOfWeek, localDate, localTime, weekStartOf, zonedToUtc } from "./time";

export type EventKind = "clock_in" | "clock_out" | "break_start" | "break_end";
/** What a kiosk can offer: the event kinds, plus a paid rest break (a break_start with paid_break). */
export type Action = EventKind | "rest_start";

export type ClockEvent = {
  id: string;
  employee_id: string;
  kind: EventKind;
  occurred_at: string;
  source: string;
  flag: string | null;
  flag_resolved_at: string | null;
  replaces_id: string | null;
  location_id: string | null;
  kiosk_id: string | null;
  paid_break: boolean | null;
};

export type Settings = {
  timezone: string;
  week_start: number;
  track_breaks: boolean;
  /** Meal breaks are paid (rest breaks are always paid). */
  breaks_paid: boolean;
  /** Offer a separate, paid rest break at the kiosk. */
  rest_breaks: boolean;
  long_shift_hours: number;
  /** Warn when a shift is longer than this without a meal break of min_meal_break_minutes. 0 = off. */
  meal_break_after_hours: number;
  min_meal_break_minutes: number;
};

/** A public holiday, or part of a day (e.g. Christmas Eve from 18:00 in Queensland). */
export type Holiday = { date: string; from_time: string; to_time: string; name?: string };

export type Category = "ordinary" | "saturday" | "sunday" | "public_holiday";
export type ByCategory = Record<Category, number>;
export const CATEGORIES: Category[] = ["ordinary", "saturday", "sunday", "public_holiday"];
export const CATEGORY_LABEL: Record<Category, string> = {
  ordinary: "Weekday", saturday: "Saturday", sunday: "Sunday", public_holiday: "Public holiday",
};

export type Issue =
  | "no_clock_in"          // a clock-out (or break) with no shift open
  | "no_clock_out"         // the shift was never closed before the next clock-in
  | "open_too_long"        // still open, longer than the company's long-shift limit
  | "unpaired_break_end";  // a break end with no break started

/** Facts a manager should see, but which don't stop approval. */
export type Warning = "no_meal_break";

export type Shift = {
  key: string;
  start: ClockEvent | null;
  end: ClockEvent | null;
  breaks: { start: ClockEvent; end: ClockEvent | null; paid: boolean; minutes: number }[];
  events: ClockEvent[];
  /** Local date the shift belongs to (its start, or its end when it has no start). */
  date: string;
  /** Paid time: the shift minus unpaid breaks. */
  workedMinutes: number;
  breakMinutes: number;
  unpaidBreakMinutes: number;
  /** Worked minutes by the day type they fall on, split at midnight and at holiday boundaries. */
  byCategory: ByCategory;
  inProgress: boolean;
  issues: Issue[];
  warnings: Warning[];
};

const MIN = 60_000;
const zero = (): ByCategory => ({ ordinary: 0, saturday: 0, sunday: 0, public_holiday: 0 });

// Same-minute events pair closing-first: a break end or clock-out at 17:00 belongs before a
// clock-in or break start at 17:00.
const TIE_ORDER: Record<EventKind, number> = { break_end: 0, clock_out: 1, clock_in: 2, break_start: 3 };

export function sortEvents(events: ClockEvent[]) {
  return [...events].sort((a, b) =>
    a.occurred_at.localeCompare(b.occurred_at) || TIE_ORDER[a.kind] - TIE_ORDER[b.kind] || a.id.localeCompare(b.id));
}

export function buildShifts(events: ClockEvent[], s: Settings, now: Date = new Date(), holidays: Holiday[] = []): Shift[] {
  const shifts: Shift[] = [];
  let cur: Shift | null = null;

  const open = (start: ClockEvent | null, at: ClockEvent): Shift => ({
    key: at.id, start, end: null, breaks: [], events: [], date: localDate(new Date(at.occurred_at), s.timezone),
    workedMinutes: 0, breakMinutes: 0, unpaidBreakMinutes: 0, byCategory: zero(), inProgress: false, issues: [], warnings: [],
  });
  const close = (sh: Shift) => { finish(sh, s, now, holidays); shifts.push(sh); };

  for (const ev of sortEvents(events)) {
    switch (ev.kind) {
      case "clock_in":
        if (cur) { cur.issues.push("no_clock_out"); close(cur); }
        cur = open(ev, ev);
        cur.events.push(ev);
        break;
      case "break_start":
        if (!cur) { cur = open(null, ev); cur.issues.push("no_clock_in"); }
        cur.events.push(ev);
        if (!cur.breaks.some(b => !b.end)) cur.breaks.push({ start: ev, end: null, paid: !!ev.paid_break || s.breaks_paid, minutes: 0 });
        break;
      case "break_end": {
        if (!cur) { cur = open(null, ev); cur.issues.push("no_clock_in"); }
        cur.events.push(ev);
        const b = cur.breaks.find(x => !x.end);
        if (b) b.end = ev; else cur.issues.push("unpaired_break_end");
        break;
      }
      case "clock_out":
        if (!cur) { cur = open(null, ev); cur.issues.push("no_clock_in"); }
        cur.events.push(ev);
        cur.end = ev;
        close(cur);
        cur = null;
        break;
    }
  }
  if (cur) close(cur);
  return shifts;
}

function finish(sh: Shift, s: Settings, now: Date, holidays: Holiday[]) {
  const t = (e: ClockEvent) => new Date(e.occurred_at).getTime();
  if (!sh.start) return; // nothing to count without a start; the issue says why

  const startMs = t(sh.start);
  let endMs: number;
  if (sh.end) {
    endMs = t(sh.end);
  } else if (!sh.issues.includes("no_clock_out") && now.getTime() - startMs <= s.long_shift_hours * 60 * MIN) {
    sh.inProgress = true;
    endMs = now.getTime();
  } else {
    if (!sh.issues.includes("no_clock_out")) sh.issues.push("open_too_long");
    return; // an unclosed shift counts nothing until a manager fixes it
  }

  // Worked intervals: the shift minus unpaid breaks. A break still open at clock-out (or now, for
  // a shift in progress) runs until then.
  let worked: [number, number][] = [[startMs, endMs]];
  let breakMs = 0, unpaidMs = 0, longestMealMs = 0;
  for (const b of sh.breaks) {
    const from = Math.max(t(b.start), startMs), to = Math.min(b.end ? t(b.end) : endMs, endMs);
    const len = Math.max(0, to - from);
    b.minutes = Math.round(len / MIN);
    breakMs += len;
    if (!b.start.paid_break) longestMealMs = Math.max(longestMealMs, len);
    if (!b.paid && len > 0) {
      unpaidMs += len;
      worked = worked.flatMap(([a, z]) => [[a, Math.min(z, from)], [Math.max(a, to), z]] as [number, number][]).filter(([a, z]) => z > a);
    }
  }
  const totalMs = Math.max(0, endMs - startMs);
  sh.breakMinutes = Math.round(breakMs / MIN);
  sh.unpaidBreakMinutes = Math.round(unpaidMs / MIN);
  sh.workedMinutes = Math.round((totalMs - unpaidMs) / MIN);
  sh.byCategory = splitByCategory(worked, sh.workedMinutes, s.timezone, holidays);

  if (!sh.inProgress && s.meal_break_after_hours > 0 && sh.workedMinutes > s.meal_break_after_hours * 60
      && longestMealMs < s.min_meal_break_minutes * MIN) {
    sh.warnings.push("no_meal_break");
  }
}

/** Splits worked intervals at local midnights and holiday boundaries, then buckets each piece. */
export function splitByCategory(intervals: [number, number][], roundedTotal: number, tz: string, holidays: Holiday[]): ByCategory {
  const ms = zero();
  for (const [a, z] of intervals) {
    const cuts = new Set<number>([a, z]);
    for (let d = localDate(new Date(a), tz); ; d = addDays(d, 1)) {
      const midnight = zonedToUtc(addDays(d, 1), "00:00", tz).getTime();
      for (const h of holidays) {
        if (h.date !== d) continue;
        for (const hm of [h.from_time, h.to_time]) {
          const at = hm.startsWith("24") ? midnight : zonedToUtc(d, hm.slice(0, 5), tz).getTime();
          if (at > a && at < z) cuts.add(at);
        }
      }
      if (midnight >= z) break;
      cuts.add(midnight);
    }
    const points = [...cuts].sort((x, y) => x - y);
    for (let i = 0; i + 1 < points.length; i++) {
      const mid = new Date((points[i] + points[i + 1]) / 2);
      ms[categoryAt(mid, tz, holidays)] += points[i + 1] - points[i];
    }
  }
  // Round each bucket, then give any rounding difference to the largest so they add up exactly.
  const out = zero();
  for (const c of CATEGORIES) out[c] = Math.round(ms[c] / MIN);
  const diff = roundedTotal - CATEGORIES.reduce((n, c) => n + out[c], 0);
  if (diff) {
    const biggest = CATEGORIES.reduce((m, c) => (ms[c] > ms[m] ? c : m), "ordinary" as Category);
    out[biggest] += diff;
  }
  return out;
}

function categoryAt(at: Date, tz: string, holidays: Holiday[]): Category {
  const date = localDate(at, tz), time = localTime(at, tz);
  if (holidays.some(h => h.date === date && time >= h.from_time.slice(0, 5) && (h.to_time.startsWith("24") || time < h.to_time.slice(0, 5)))) {
    return "public_holiday";
  }
  const dow = dayOfWeek(date);
  return dow === 6 ? "saturday" : dow === 0 ? "sunday" : "ordinary";
}

export type WeekTotals = {
  workedMinutes: number;      // completed shifts only
  breakMinutes: number;
  unpaidBreakMinutes: number;
  shiftCount: number;
  inProgressMinutes: number;  // the shift running now, not yet in the total
  issueCount: number;
  warningCount: number;
  byCategory: ByCategory;
};

export function totals(shifts: Shift[]): WeekTotals {
  const t: WeekTotals = {
    workedMinutes: 0, breakMinutes: 0, unpaidBreakMinutes: 0, shiftCount: 0, inProgressMinutes: 0,
    issueCount: 0, warningCount: 0, byCategory: zero(),
  };
  for (const sh of shifts) {
    t.issueCount += sh.issues.length ? 1 : 0;
    t.warningCount += sh.warnings.length ? 1 : 0;
    if (sh.inProgress) { t.inProgressMinutes += sh.workedMinutes; continue; }
    if (sh.start && sh.end) {
      t.workedMinutes += sh.workedMinutes;
      t.breakMinutes += sh.breakMinutes;
      t.unpaidBreakMinutes += sh.unpaidBreakMinutes;
      t.shiftCount += 1;
      for (const c of CATEGORIES) t.byCategory[c] += sh.byCategory[c];
    }
  }
  return t;
}

/** Shifts whose start (or lone end) falls in the week beginning `weekStart`. */
export function shiftsInWeek(shifts: Shift[], weekStart: string, s: Settings) {
  return shifts.filter(sh => weekStartOf(sh.date, s.week_start) === weekStart);
}

// ── What a scan should offer ───────────────────────────────────────────────────────────────────

export type State = "off" | "working" | "on_break";

export function currentState(last: Pick<ClockEvent, "kind" | "occurred_at"> | null, s: Settings, now = new Date()): { state: State; stale: boolean } {
  if (!last || last.kind === "clock_out") return { state: "off", stale: false };
  // A shift left open past the long-shift limit is treated as forgotten: offer a fresh clock-in,
  // and the old shift shows up for review with no clock-out.
  const stale = now.getTime() - new Date(last.occurred_at).getTime() > s.long_shift_hours * 60 * MIN;
  if (stale) return { state: "off", stale: true };
  return { state: last.kind === "break_start" ? "on_break" : "working", stale: false };
}

export function nextActions(state: State, s: Settings): Action[] {
  if (state === "off") return ["clock_in"];
  if (state === "on_break") return ["break_end", "clock_out"];
  if (!s.track_breaks) return ["clock_out"];
  return s.rest_breaks ? ["clock_out", "break_start", "rest_start"] : ["clock_out", "break_start"];
}

/** The event an action records, and whether a break it starts is paid. */
export function actionEvent(a: Action): { kind: EventKind; paidBreak: boolean } {
  return a === "rest_start" ? { kind: "break_start", paidBreak: true } : { kind: a, paidBreak: false };
}

export function actionLabel(a: Action, s: Pick<Settings, "rest_breaks">): string {
  if (a === "rest_start") return "Rest break";
  if (a === "break_start") return s.rest_breaks ? "Meal break" : "Start break";
  return KIND_LABEL[a];
}

export const KIND_LABEL: Record<EventKind, string> = {
  clock_in: "Clock in",
  clock_out: "Clock out",
  break_start: "Start break",
  break_end: "End break",
};

export function eventLabel(e: Pick<ClockEvent, "kind" | "paid_break">) {
  if (e.kind === "break_start" && e.paid_break) return "Start rest break";
  return KIND_LABEL[e.kind];
}

export const FLAG_LABEL: Record<string, string> = {
  clock_in_while_open: "Clocked in while a shift was still open",
  clock_out_without_shift: "Clocked out with no open shift",
  break_without_shift: "Break started with no open shift",
  break_end_without_break: "Break ended with no break started",
};

export const ISSUE_LABEL: Record<Issue, string> = {
  no_clock_in: "No clock-in",
  no_clock_out: "No clock-out",
  open_too_long: "Still open (too long)",
  unpaired_break_end: "Break end without start",
};

export const WARNING_LABEL: Record<Warning, string> = {
  no_meal_break: "No meal break",
};
