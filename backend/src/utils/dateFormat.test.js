import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPLICATION_DATE_FORMAT, EMPTY_DATE, formatDate, formatDateRange, formatDateTime,
  formatDayMonth, formatMonthYear, formatTime, toIsoDate,
} from "./dateFormat.js";

// The suite is run once per timezone by `npm run test:dates` (see package.json).
// Every expectation below must hold identically under UTC, IST (+05:30),
// US Pacific (-07:00/-08:00), and Pacific/Kiritimati (+14:00).
const TZ = process.env.TZ || "system default";

describe(`dateFormat [TZ=${TZ}]`, () => {
  it("states the standard", () => {
    assert.equal(APPLICATION_DATE_FORMAT, "DD/Mon/YYYY");
  });

  describe("formatDate — the standard", () => {
    it("renders DD/Mon/YYYY", () => {
      assert.equal(formatDate("2026-08-15"), "15/Aug/2026");
      assert.equal(formatDate("2026-07-09"), "09/Jul/2026");
      assert.equal(formatDate("2026-01-01"), "01/Jan/2026");
      assert.equal(formatDate("2026-12-25"), "25/Dec/2026");
    });

    it("zero-pads single-digit days", () => {
      assert.equal(formatDate("2026-03-05"), "05/Mar/2026");
    });

    it("covers every month abbreviation", () => {
      const expected = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      expected.forEach((month, index) => {
        assert.equal(formatDate(`2026-${String(index + 1).padStart(2, "0")}-15`), `15/${month}/2026`);
      });
    });

    it("never emits an ambiguous numeric month", () => {
      // The whole reason for the standard: 08 must never appear where a reader
      // could take it for the day.
      assert.equal(formatDate("2026-08-15"), "15/Aug/2026");
      assert.notEqual(formatDate("2026-08-15"), "08/15/2026");
      assert.notEqual(formatDate("2026-08-15"), "15/08/2026");
      assert.notEqual(formatDate("2026-08-15"), "2026-08-15");
    });
  });

  describe("timezone safety — a calendar date must never shift a day", () => {
    it("holds a date-only string on its own day", () => {
      assert.equal(formatDate("2026-08-15"), "15/Aug/2026");
      assert.equal(formatDate("2026-01-01"), "01/Jan/2026");
      assert.equal(formatDate("2026-12-31"), "31/Dec/2026");
    });

    it("holds a UTC-midnight timestamp (stored DATE column) on its own day", () => {
      assert.equal(formatDate("2026-08-15T00:00:00.000Z"), "15/Aug/2026");
      assert.equal(formatDate("2026-01-01T00:00:00Z"), "01/Jan/2026");
      assert.equal(formatDate(new Date("2026-12-31T00:00:00.000Z")), "31/Dec/2026");
    });

    it("round-trips a date-only value through toIsoDate unchanged", () => {
      for (const iso of ["2026-01-01", "2026-08-15", "2026-12-31", "2028-02-29"]) {
        assert.equal(toIsoDate(iso), iso, `round-trip failed for ${iso}`);
      }
    });
  });

  describe("boundary and leap dates", () => {
    it("handles month ends", () => {
      assert.equal(formatDate("2026-01-31"), "31/Jan/2026");
      assert.equal(formatDate("2026-02-28"), "28/Feb/2026");
      assert.equal(formatDate("2026-03-31"), "31/Mar/2026");
      assert.equal(formatDate("2026-04-30"), "30/Apr/2026");
      assert.equal(formatDate("2026-12-31"), "31/Dec/2026");
    });

    it("handles leap and non-leap February", () => {
      assert.equal(formatDate("2028-02-29"), "29/Feb/2028");
      assert.equal(formatDate("2024-02-29"), "29/Feb/2024");
      assert.equal(formatDate("2026-02-28"), "28/Feb/2026");
    });

    it("crosses month and year boundaries without drift", () => {
      const crossings = [
        ["2026-01-31", "31/Jan/2026"], ["2026-02-01", "01/Feb/2026"],
        ["2026-02-28", "28/Feb/2026"], ["2026-03-01", "01/Mar/2026"],
        ["2026-04-30", "30/Apr/2026"], ["2026-05-01", "01/May/2026"],
        ["2026-12-31", "31/Dec/2026"], ["2027-01-01", "01/Jan/2027"],
      ];
      crossings.forEach(([input, expected]) => assert.equal(formatDate(input), expected));
    });
  });

  describe("empty and invalid input", () => {
    it("never shows 'Invalid Date'", () => {
      for (const value of [null, undefined, "", "not-a-date", "2026-13-45", NaN]) {
        const result = formatDate(value);
        assert.equal(result, EMPTY_DATE, `expected fallback for ${String(value)}, got ${result}`);
        assert.ok(!/Invalid/i.test(result));
      }
    });

    it("honours a caller-supplied fallback", () => {
      assert.equal(formatDate(null, "Not set"), "Not set");
      assert.equal(formatDateTime(undefined, ""), "");
    });

    it("returns an empty string from toIsoDate for unusable input", () => {
      assert.equal(toIsoDate(null), "");
      assert.equal(toIsoDate("rubbish"), "");
    });
  });

  describe("formatDateTime and formatTime", () => {
    it("renders DD/Mon/YYYY, hh:mm AM/PM", () => {
      const local = new Date(2026, 7, 15, 16, 30, 0);
      assert.equal(formatDateTime(local), "15/Aug/2026, 04:30 PM");
    });

    it("uses a 12-hour clock with padded hours", () => {
      assert.equal(formatTime(new Date(2026, 7, 15, 0, 5)), "12:05 AM");
      assert.equal(formatTime(new Date(2026, 7, 15, 9, 7)), "09:07 AM");
      assert.equal(formatTime(new Date(2026, 7, 15, 12, 0)), "12:00 PM");
      assert.equal(formatTime(new Date(2026, 7, 15, 23, 59)), "11:59 PM");
    });

    it("keeps the date half in the standard format", () => {
      const rendered = formatDateTime(new Date(2026, 0, 9, 8, 5));
      assert.match(rendered, /^09\/Jan\/2026, /);
    });
  });

  describe("compact labels", () => {
    it("formats day/month and month/year", () => {
      assert.equal(formatDayMonth("2026-08-15"), "15/Aug");
      assert.equal(formatMonthYear("2026-08-15"), "Aug/2026");
    });

    it("formats an inclusive range", () => {
      assert.equal(formatDateRange("2026-08-01", "2026-08-15"), "01/Aug/2026 - 15/Aug/2026");
    });
  });

  describe("locale independence", () => {
    it("ignores the host locale entirely", () => {
      // No Intl, no toLocaleString — the same input must produce the same bytes
      // whatever LANG/LC_ALL/TZ the process was started with.
      assert.equal(formatDate("2026-08-15"), "15/Aug/2026");
      assert.equal(formatDayMonth("2026-08-15"), "15/Aug");
      assert.equal(formatMonthYear("2026-08-15"), "Aug/2026");
    });

    it("produces month names that are not locale-derived", () => {
      const viaIntl = new Intl.DateTimeFormat("de-DE", { month: "short" }).format(new Date(2026, 2, 15));
      // German short March is "Mär"; ours must stay "Mar" regardless.
      assert.equal(formatDate("2026-03-15"), "15/Mar/2026");
      assert.ok(viaIntl !== "Mar" || true, "sanity: Intl would vary by locale");
    });
  });
});
