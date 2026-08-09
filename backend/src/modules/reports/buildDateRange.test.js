import test from "node:test";
import assert from "node:assert/strict";
import { buildDateRange } from "./reports.service.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ─── Month / Year picker (spec §6) ──────────────────────────────────────────

test("month_year: a specific month resolves to that month's first and last day", () => {
  const [start, end] = buildDateRange("month_year", null, null, "3", "2026");
  assert.equal(iso(start), "2026-03-01");
  assert.equal(iso(end), "2026-03-31"); // March has 31 days
});

test("month_year: February in a leap year ends on the 29th", () => {
  const [, end] = buildDateRange("month_year", null, null, "2", "2024");
  assert.equal(iso(end), "2024-02-29");
});

test("month_year: February in a non-leap year ends on the 28th", () => {
  const [, end] = buildDateRange("month_year", null, null, "2", "2026");
  assert.equal(iso(end), "2026-02-28");
});

test("month_year: month 'all' resolves to the whole calendar year", () => {
  const [start, end] = buildDateRange("month_year", null, null, "all", "2025");
  assert.equal(iso(start), "2025-01-01");
  assert.equal(iso(end), "2025-12-31");
});

test("month_year: rejects a missing or invalid year", () => {
  assert.throws(() => buildDateRange("month_year", null, null, "3", undefined), /year/i);
  assert.throws(() => buildDateRange("month_year", null, null, "3", "abc"), /year/i);
});

test("month_year: rejects an out-of-range month", () => {
  assert.throws(() => buildDateRange("month_year", null, null, "13", "2026"), /Month/i);
  assert.throws(() => buildDateRange("month_year", null, null, "0", "2026"), /Month/i);
});

// ─── Custom range validation (spec §54) ─────────────────────────────────────

test("custom: rejects From date after To date", () => {
  assert.throws(() => buildDateRange("custom", "2026-05-10", "2026-05-01"), /From date cannot be after/i);
});

test("custom: accepts a valid ordered range", () => {
  const [start, end] = buildDateRange("custom", "2026-05-01", "2026-05-10");
  assert.equal(iso(start), "2026-05-01");
  assert.equal(iso(end), "2026-05-10");
});

test("custom: requires both dates", () => {
  assert.throws(() => buildDateRange("custom", "2026-05-01", null), /both a From and To/i);
});

test("custom: rejects an unparseable date", () => {
  assert.throws(() => buildDateRange("custom", "not-a-date", "2026-05-10"), /invalid date/i);
});

// ─── Relative ranges ────────────────────────────────────────────────────────

test("last_year covers Jan 1 to Dec 31 of the previous year", () => {
  const [start, end] = buildDateRange("last_year");
  const lastYear = new Date().getFullYear() - 1;
  assert.equal(iso(start), `${lastYear}-01-01`);
  assert.equal(iso(end), `${lastYear}-12-31`);
});

test("last_month ends on the final day of the previous month", () => {
  const [start, end] = buildDateRange("last_month");
  assert.equal(start.getDate(), 1);
  // The end date's month must equal the start's month (i.e. it didn't spill over).
  assert.equal(end.getMonth(), start.getMonth());
});

test("all returns a wide window ending today", () => {
  const [start, end] = buildDateRange("all");
  assert.ok(start.getFullYear() <= 2000);
  assert.equal(iso(end), iso(new Date()));
});

test("an unknown range key safely falls back to this_month", () => {
  const [start] = buildDateRange("not_a_real_range");
  assert.equal(start.getDate(), 1);
  assert.equal(start.getMonth(), new Date().getMonth());
});
