/**
 * Quality Mobiles — application-wide date presentation (server side).
 *
 * THE standard: DD/Mon/YYYY  (e.g. 15/Aug/2026)
 *
 * Mirrors frontend/utils/dateFormat.ts so a date rendered into a PDF or CSV on
 * the server reads identically to the same date on screen. Deliberately avoids
 * `toLocaleString`/`Intl`, which on the server follow the *host machine's*
 * locale — that makes output depend on which box happens to run the process.
 *
 * Storage and API transport stay ISO 8601; only presentation is standardised.
 */

export const APPLICATION_DATE_FORMAT = "DD/Mon/YYYY";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const EMPTY_DATE = "-";

const pad2 = (value) => (value < 10 ? `0${value}` : String(value));

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_MIDNIGHT = /^(\d{4})-(\d{2})-(\d{2})T00:00(:00)?(\.000)?(Z|\+00:00)$/;

/**
 * A shape match is not a valid date: "2026-13-45" parses structurally but names
 * no real day, and so does "2026-02-30". Round-tripping through a Date rejects
 * both instead of rendering nonsense.
 */
function isRealCalendarDay(year, month, day) {
  if (!Number.isInteger(year) || month < 0 || month > 11 || day < 1 || day > 31) return false;
  const probe = new Date(year, month, day);
  return probe.getFullYear() === year && probe.getMonth() === month && probe.getDate() === day;
}

/**
 * Resolve a value to the calendar day it represents. With `calendarSemantics`,
 * date-only values are read from their literal components so a stored 15/Aug is
 * never rendered as 14/Aug by a server running in a negative UTC offset.
 */
function toCalendarParts(value, calendarSemantics) {
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

  if (calendarSemantics && value instanceof Date
    && date.getUTCHours() === 0 && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
  }

  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

/** `15/Aug/2026` — calendar dates. */
export function formatDate(value, fallback = EMPTY_DATE) {
  const parts = toCalendarParts(value, true);
  if (!parts) return fallback;
  return `${pad2(parts.day)}/${MONTHS[parts.month]}/${parts.year}`;
}

/** `04:30 PM` — fixed 12-hour clock. */
export function formatTime(value, fallback = EMPTY_DATE) {
  if (value === null || value === undefined || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const hours = date.getHours();
  const marker = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad2(hour12)}:${pad2(date.getMinutes())} ${marker}`;
}

/** `15/Aug/2026, 04:30 PM` — real transaction timestamps. */
export function formatDateTime(value, fallback = EMPTY_DATE) {
  if (value === null || value === undefined || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const parts = toCalendarParts(date, false);
  if (!parts) return fallback;
  return `${pad2(parts.day)}/${MONTHS[parts.month]}/${parts.year}, ${formatTime(date, "")}`;
}

/** Compact axis/tick label: `15/Aug`. */
export function formatDayMonth(value, fallback = EMPTY_DATE) {
  const parts = toCalendarParts(value, true);
  if (!parts) return fallback;
  return `${pad2(parts.day)}/${MONTHS[parts.month]}`;
}

/** Compact month bucket label: `Aug/2026`. */
export function formatMonthYear(value, fallback = EMPTY_DATE) {
  const parts = toCalendarParts(value, true);
  if (!parts) return fallback;
  return `${MONTHS[parts.month]}/${parts.year}`;
}

/** `01/Aug/2026 - 15/Aug/2026`. */
export function formatDateRange(from, to) {
  return `${formatDate(from)} - ${formatDate(to)}`;
}

/**
 * Machine-readable local calendar day, `YYYY-MM-DD`.
 * Replaces `toISOString().slice(0, 10)`, which shifts the day off UTC.
 */
export function toIsoDate(value) {
  const parts = toCalendarParts(value, true);
  if (!parts) return "";
  return `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}`;
}

/**
 * Parse a `YYYY-MM-DD` filter value into local midnight.
 *
 * `new Date("2026-08-01")` is specified to parse as **UTC** midnight, so on a
 * server west of Greenwich it lands on 31/Jul — a "From 01/Aug" filter then
 * silently queries from the 31st and returns the wrong rows. Building the Date
 * from its parts keeps the calendar day the user actually asked for.
 *
 * Returns null for anything that is not a real calendar day.
 */
export function parseCalendarDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parts = toCalendarParts(value, true);
  if (!parts) return null;
  return new Date(parts.year, parts.month, parts.day);
}
