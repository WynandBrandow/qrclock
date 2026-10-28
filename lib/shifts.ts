// Turns an employee's clock events into shifts, and shifts into weekly totals.
// Pure functions: no database, no clock except the `now` passed in.

import { localDate, weekStartOf } from "./time";

export type EventKind = "clock_in" | "clock_out" | "break_start" | "break_end";

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
};

export type Settings = {
  timezone: string;
  week_start: number;
  track_breaks: boolean;
  breaks_paid: boolean;
  long_shift_hours: number;
};

export type Issue =
  | "no_clock_in"          // a clock-out (or break) with no shift open
  | "no_clock_out"         // the shift was never closed before the next clock-in
  | "open_too_long"        // still open, longer than the company's long-shift limit
  | "unpaired_break_end";  // a break end with no break started

export type Shift = {
  key: string;
  start: ClockEvent | null;
  end: ClockEvent | null;
  breaks: { start: ClockEvent; end: ClockEvent | null }[];
  events: ClockEvent[];
  /** Local date the shift belongs to (its start, or its end when it has no start). */
  date: string;
  workedMinutes: number;
  breakMinutes: number;
  inProgress: boolean;
  issues: Issue[];
};

const MIN = 60_000;

export function buildShifts(events: ClockEvent[], s: Settings, now: Date = new Date()): Shift[] {
  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const shifts: Shift[] = [];
  let cur: Shift | null = null;

  const open = (start: ClockEvent | null, at: ClockEvent): Shift => ({
    key: at.id, start, end: null, breaks: [], events: [], date: localDate(new Date(at.occurred_at), s.timezone),
    workedMinutes: 0, breakMinutes: 0, inProgress: false, issues: [],
  });
  const close = (sh: Shift) => { finish(sh, s, now); shifts.push(sh); };

  for (const ev of sorted) {
    switch (ev.kind) {
      case "clock_in":
        if (cur) { cur.issues.push("no_clock_out"); close(cur); }
        cur = open(ev, ev);
        cur.events.push(ev);
        break;
      case "break_start":
        if (!cur) { cur = open(null, ev); cur.issues.push("no_clock_in"); }
        cur.events.push(ev);
        if (!cur.breaks.some(b => !b.end)) cur.breaks.push({ start: ev, end: null });
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

function finish(sh: Shift, s: Settings, now: Date) {
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

  let breakMs = 0;
  for (const b of sh.breaks) {
    // A break still open at clock-out (or now, for a shift in progress) runs until then.
    const bEnd = b.end ? t(b.end) : endMs;
    breakMs += Math.max(0, Math.min(bEnd, endMs) - Math.max(t(b.start), startMs));
  }
  const totalMs = Math.max(0, endMs - startMs);
  sh.breakMinutes = Math.round(breakMs / MIN);
  sh.workedMinutes = Math.round((s.breaks_paid ? totalMs : totalMs - breakMs) / MIN);
}

export type WeekTotals = {
  workedMinutes: number;      // completed shifts only
  breakMinutes: number;
  shiftCount: number;
  inProgressMinutes: number;  // the shift running now, not yet in the total
  issueCount: number;
};

export function totals(shifts: Shift[]): WeekTotals {
  const t: WeekTotals = { workedMinutes: 0, breakMinutes: 0, shiftCount: 0, inProgressMinutes: 0, issueCount: 0 };
  for (const sh of shifts) {
    t.issueCount += sh.issues.length ? 1 : 0;
    if (sh.inProgress) { t.inProgressMinutes += sh.workedMinutes; continue; }
    if (sh.start && sh.end) {
      t.workedMinutes += sh.workedMinutes;
      t.breakMinutes += sh.breakMinutes;
      t.shiftCount += 1;
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

export function nextActions(state: State, s: Settings): EventKind[] {
  if (state === "off") return ["clock_in"];
  if (state === "on_break") return ["break_end", "clock_out"];
  return s.track_breaks ? ["clock_out", "break_start"] : ["clock_out"];
}

export const KIND_LABEL: Record<EventKind, string> = {
  clock_in: "Clock in",
  clock_out: "Clock out",
  break_start: "Start break",
  break_end: "End break",
};

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
