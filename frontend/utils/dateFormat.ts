/**
 * Quality Mobiles — application-wide date presentation.
 *
 * THE standard: DD/Mon/YYYY  (e.g. 15/Aug/2026)
 *
 * Every human-readable date in the application must pass through this module.
 * Nothing here consults the operating system, the browser, `navigator.language`,
 * or `Intl.DateTimeFormat` — month names come from a fixed table and the rest is
 * arithmetic, so two users with different regional settings always see the same
 * string. That is the whole point: locale-independence by construction, not by
 * passing a locale argument that a future edit could drop.
 *
 * Avoiding Intl also removes the main performance trap — no formatter objects
 * are allocated per cell, so large tables cost only a few array lookups.
 */

export const APPLICATION_DATE_FORMAT = "DD/Mon/YYYY";
export const APPLICATION_DATETIME_FORMAT = "DD/Mon/YYYY, hh:mm AM/PM";

/** Fixed English abbreviations — never locale-derived. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Shown wherever a date is missing, empty, or unparseable. Never "Invalid Date". */
export const EMPTY_DATE = "-";

export type DateInput = Date | string | number | null | undefined;

const pad2 = (value: number) => (value < 10 ? `0${value}` : String(value));

/** A bare calendar date with no time or zone attached: "2026-08-15". */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * An ISO timestamp pinned to UTC midnight. Mongo/SQL `DATE` columns come back
 * this way, and they mean a calendar day, not an instant — reading them in local
 * time would move them to the previous day for anyone west of UTC.
 */
const UTC_MIDNIGHT = /^(\d{4})-(\d{2})-(\d{2})T00:00(:00)?(\.000)?(Z|\+00:00)$/;

/** Year/month/day triple, already resolved to the correct calendar day. */
interface CalendarParts { year: number; month: number; day: number }

/**
 * A shape match is not a valid date: "2026-13-45" parses structurally but names
 * no real day, and so does "2026-02-30". Round-tripping through a Date rejects
 * both instead of rendering nonsense.
 */
function isRealCalendarDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || month < 0 || month > 11 || day < 1 || day > 31) return false;
  const probe = new Date(year, month, day);
  return probe.getFullYear() === year && probe.getMonth() === month && probe.getDate() === day;
}

/**
 * Resolve a value to the calendar day it represents.
 *
 * `calendarSemantics` (the default for `formatDate`) reads date-only inputs
 * without ever constructing a zoned instant, so a stored 15/Aug never renders as
 * 14/Aug on a machine set to a negative UTC offset. Real timestamps still read
 * in local time, which is what a user expects of "when did this sale happen".
 */
function toCalendarParts(value: DateInput, calendarSemantics: boolean): CalendarParts | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string" && calendarSemantics) {
    const bare = DATE_ONLY.exec(value) || UTC_MIDNIGHT.exec(value);
    if (bare) {
      const year = Number(bare[1]);
      const month = Number(bare[2]) - 1;
      const day = Number(bare[3]);
      return isRealCalendarDay(year, month, day) ? { year, month, day } : null;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // A Date object holding exact UTC midnight is a stored calendar date too.
  if (calendarSemantics && value instanceof Date
    && date.getUTCHours() === 0 && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
  }

  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

/**
 * The application date format: `15/Aug/2026`.
 * Use for calendar dates — join dates, due dates, purchase dates, restock dates.
 */
export function formatDate(value: DateInput, fallback: string = EMPTY_DATE): string {
  const parts = toCalendarParts(value, true);
  if (!parts) return fallback;
  return `${pad2(parts.day)}/${MONTHS[parts.month]}/${parts.year}`;
}

/**
 * Clock time in a fixed 12-hour presentation: `04:30 PM`.
 * Locale-independent — `toLocaleTimeString` would vary the separator and marker.
 */
export function formatTime(value: DateInput, fallback: string = EMPTY_DATE): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const hours = date.getHours();
  const marker = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad2(hour12)}:${pad2(date.getMinutes())} ${marker}`;
}

/**
 * A real transaction moment: `15/Aug/2026, 04:30 PM`.
 * Use for sale, service, and payment timestamps — the instant matters, so this
 * one deliberately reads in the viewer's timezone.
 */
export function formatDateTime(value: DateInput, fallback: string = EMPTY_DATE): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const parts = toCalendarParts(date, false);
  if (!parts) return fallback;
  return `${pad2(parts.day)}/${MONTHS[parts.month]}/${parts.year}, ${formatTime(date, "")}`;
}

/** Compact axis/tick label: `15/Aug`. Still unambiguous, still locale-free. */
export function formatDayMonth(value: DateInput, fallback: string = EMPTY_DATE): string {
  const parts = toCalendarParts(value, true);
  if (!parts) return fallback;
  return `${pad2(parts.day)}/${MONTHS[parts.month]}`;
}

/** Compact month bucket label: `Aug/2026`. */
export function formatMonthYear(value: DateInput, fallback: string = EMPTY_DATE): string {
  const parts = toCalendarParts(value, true);
  if (!parts) return fallback;
  return `${MONTHS[parts.month]}/${parts.year}`;
}

/** Inclusive range for headers and filter summaries: `01/Aug/2026 - 15/Aug/2026`. */
export function formatDateRange(from: DateInput, to: DateInput): string {
  return `${formatDate(from)} - ${formatDate(to)}`;
}

// ─── Machine-readable side ───────────────────────────────────────────────────
// Storage and transport stay ISO 8601. These helpers exist so that converting
// between the two never goes through `toISOString()` on a local-time Date, which
// silently shifts the day for anyone not on UTC.

/**
 * Local calendar day as `YYYY-MM-DD`, for `<input type="date">` and API params.
 *
 * `new Date().toISOString().slice(0, 10)` is the bug this replaces: it converts
 * to UTC first, so at 01:00 on 15/Aug in IST it yields 2026-08-14.
 */
export function toInputDate(value: DateInput): string {
  const parts = toCalendarParts(value, true);
  if (!parts) return "";
  return `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}`;
}

/** Today's local calendar day as `YYYY-MM-DD`. */
export function todayInputDate(): string {
  return toInputDate(new Date());
}

/**
 * Parse a `YYYY-MM-DD` input value into a local-midnight Date.
 * `new Date("2026-08-15")` would parse as UTC midnight and can land on the 14th.
 */
export function parseInputDate(value: string): Date | null {
  const bare = DATE_ONLY.exec(value || "");
  if (!bare) return null;
  const date = new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when a value can be rendered as a date at all. */
export function isValidDate(value: DateInput): boolean {
  return toCalendarParts(value, true) !== null;
}
