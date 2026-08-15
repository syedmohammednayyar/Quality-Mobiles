/**
 * Runs the date-format suite once per timezone.
 *
 * The application standard must hold for a user in Los Angeles exactly as it
 * does for one in Kolkata, so the suite is executed under a spread of offsets:
 * UTC, a positive half-hour offset, a negative offset, and both extremes of the
 * date line (+14:00 / -11:00) where a UTC timestamp and the local calendar day
 * disagree the most.
 *
 * Spawning per zone is the only reliable way to do this — TZ is read once when
 * a Node process starts, so it cannot be varied inside a single run.
 *
 * Usage: npm run test:dates
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const suite = path.join(here, "..", "utils", "dateFormat.test.js");

const ZONES = [
  "UTC",
  "Asia/Kolkata",        // +05:30 — half-hour offset
  "America/Los_Angeles", // -07:00/-08:00 — negative, with DST
  "America/New_York",    // -04:00/-05:00 — negative, with DST
  "Europe/Berlin",       // +01:00/+02:00 — DST, non-English locale territory
  "Pacific/Kiritimati",  // +14:00 — earliest calendar day on earth
  "Pacific/Midway",      // -11:00 — latest calendar day on earth
];

let failed = 0;

for (const zone of ZONES) {
  const result = spawnSync(process.execPath, ["--test", suite], {
    env: { ...process.env, TZ: zone },
    encoding: "utf8",
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const pass = /^# pass (\d+)$/m.exec(output) || /pass (\d+)/.exec(output);
  const fail = /^# fail (\d+)$/m.exec(output) || /fail (\d+)/.exec(output);
  const ok = result.status === 0;

  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  TZ=${zone.padEnd(22)} pass=${pass?.[1] ?? "?"} fail=${fail?.[1] ?? "?"}`);
  if (!ok) console.log(output.split("\n").filter((line) => /✖|AssertionError|expected/.test(line)).slice(0, 12).join("\n"));
}

console.log(failed === 0
  ? `\nDD/Mon/YYYY holds identically in all ${ZONES.length} timezones.`
  : `\n${failed} of ${ZONES.length} timezones failed.`);

process.exit(failed === 0 ? 0 : 1);
