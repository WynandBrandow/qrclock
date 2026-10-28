// Unit tests for shift pairing, break deduction, weekly totals and time-zone maths.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShifts, currentState, nextActions, shiftsInWeek, totals, type ClockEvent, type EventKind, type Settings } from "../lib/shifts";
import { localDate, weekBounds, weekStartOf, zonedToUtc } from "../lib/time";

const BNE: Settings = { timezone: "Australia/Brisbane", week_start: 1, track_breaks: true, breaks_paid: false, long_shift_hours: 14 };
let n = 0;
// Brisbane is UTC+10 all year.
const ev = (kind: EventKind, local: string): ClockEvent => ({
  id: `e${++n}`, employee_id: "a", kind, occurred_at: zonedToUtc(local.slice(0, 10), local.slice(11, 16), BNE.timezone).toISOString(),
  source: "kiosk", flag: null, flag_resolved_at: null, replaces_id: null, location_id: null, kiosk_id: null,
});
const NOW = new Date("2026-11-10T00:00:00Z");

test("zonedToUtc: Brisbane, Sydney across DST, and back", () => {
  assert.equal(zonedToUtc("2026-10-28", "09:00", "Australia/Brisbane").toISOString(), "2026-10-27T23:00:00.000Z");
  assert.equal(zonedToUtc("2026-07-01", "09:00", "Australia/Sydney").toISOString(), "2026-06-30T23:00:00.000Z"); // AEST +10
  assert.equal(zonedToUtc("2026-12-01", "09:00", "Australia/Sydney").toISOString(), "2026-11-30T22:00:00.000Z"); // AEDT +11
  assert.equal(localDate(new Date("2026-10-27T14:30:00Z"), "Australia/Brisbane"), "2026-10-28");
});

test("weekStartOf: Monday and Sunday weeks", () => {
  assert.equal(weekStartOf("2026-10-28", 1), "2026-10-26"); // Wed → Mon
  assert.equal(weekStartOf("2026-10-26", 1), "2026-10-26");
  assert.equal(weekStartOf("2026-10-25", 1), "2026-10-19"); // Sun belongs to the previous Mon week
  assert.equal(weekStartOf("2026-10-28", 0), "2026-10-25"); // Sunday week
  const b = weekBounds("2026-10-26", "Australia/Brisbane");
  assert.equal(b.from.toISOString(), "2026-10-25T14:00:00.000Z");
  assert.equal(b.to.toISOString(), "2026-11-01T14:00:00.000Z");
});

test("a simple shift with an unpaid break", () => {
  const s = buildShifts([ev("clock_in", "2026-10-26 09:00"), ev("break_start", "2026-10-26 12:00"), ev("break_end", "2026-10-26 12:30"), ev("clock_out", "2026-10-26 17:00")], BNE, NOW);
  assert.equal(s.length, 1);
  assert.equal(s[0].breakMinutes, 30);
  assert.equal(s[0].workedMinutes, 7 * 60 + 30);
  assert.deepEqual(s[0].issues, []);
});

test("paid breaks are not deducted", () => {
  const s = buildShifts([ev("clock_in", "2026-10-26 09:00"), ev("break_start", "2026-10-26 12:00"), ev("break_end", "2026-10-26 12:30"), ev("clock_out", "2026-10-26 17:00")], { ...BNE, breaks_paid: true }, NOW);
  assert.equal(s[0].workedMinutes, 8 * 60);
});

test("overnight shift belongs to the day (and week) it started", () => {
  const s = buildShifts([ev("clock_in", "2026-11-01 22:00"), ev("clock_out", "2026-11-02 06:00")], BNE, NOW);
  assert.equal(s[0].date, "2026-11-01");
  assert.equal(s[0].workedMinutes, 480);
  assert.equal(shiftsInWeek(s, "2026-10-26", BNE).length, 1);
  assert.equal(shiftsInWeek(s, "2026-11-02", BNE).length, 0);
});

test("missing clock-out, then a new shift", () => {
  const s = buildShifts([ev("clock_in", "2026-10-26 09:00"), ev("clock_in", "2026-10-27 09:00"), ev("clock_out", "2026-10-27 17:00")], BNE, NOW);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].issues, ["no_clock_out"]);
  assert.equal(s[0].workedMinutes, 0);
  assert.equal(totals(s).workedMinutes, 480);
  assert.equal(totals(s).issueCount, 1);
});

test("clock-out without a clock-in", () => {
  const s = buildShifts([ev("clock_out", "2026-10-26 17:00")], BNE, NOW);
  assert.deepEqual(s[0].issues, ["no_clock_in"]);
  assert.equal(totals(s).workedMinutes, 0);
});

test("clock-out during a break ends the break at clock-out", () => {
  const s = buildShifts([ev("clock_in", "2026-10-26 09:00"), ev("break_start", "2026-10-26 16:00"), ev("clock_out", "2026-10-26 17:00")], BNE, NOW);
  assert.equal(s[0].breakMinutes, 60);
  assert.equal(s[0].workedMinutes, 7 * 60);
  assert.deepEqual(s[0].issues, []);
});

test("shift in progress counts separately until it closes", () => {
  const now = new Date(zonedToUtc("2026-10-26", "12:00", BNE.timezone));
  const s = buildShifts([ev("clock_in", "2026-10-26 09:00")], BNE, now);
  assert.ok(s[0].inProgress);
  const t = totals(s);
  assert.equal(t.workedMinutes, 0);
  assert.equal(t.inProgressMinutes, 180);
});

test("shift open past the long-shift limit is flagged, not counted", () => {
  const now = new Date(zonedToUtc("2026-10-27", "09:00", BNE.timezone));
  const s = buildShifts([ev("clock_in", "2026-10-26 09:00")], BNE, now);
  assert.deepEqual(s[0].issues, ["open_too_long"]);
  assert.equal(s[0].inProgress, false);
});

test("next actions follow the state; a forgotten shift offers a fresh clock-in", () => {
  const now = new Date(zonedToUtc("2026-10-26", "12:00", BNE.timezone));
  const last = (kind: EventKind, local: string) => ({ kind, occurred_at: ev(kind, local).occurred_at });
  assert.deepEqual(nextActions(currentState(null, BNE, now).state, BNE), ["clock_in"]);
  assert.deepEqual(nextActions(currentState(last("clock_in", "2026-10-26 09:00"), BNE, now).state, BNE), ["clock_out", "break_start"]);
  assert.deepEqual(nextActions(currentState(last("break_start", "2026-10-26 11:50"), BNE, now).state, BNE), ["break_end", "clock_out"]);
  assert.deepEqual(nextActions("working", { ...BNE, track_breaks: false }), ["clock_out"]);
  const stale = currentState(last("clock_in", "2026-10-25 08:00"), BNE, now);
  assert.deepEqual(stale, { state: "off", stale: true });
});
