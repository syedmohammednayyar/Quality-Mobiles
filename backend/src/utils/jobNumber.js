import { Product, SequenceCounter } from "../db/models.js";
import { HttpError } from "./httpError.js";
import { nextSequence } from "./sequence.js";

// The Job Number is the permanent, system-generated identifier of an
// inventory/product record. A single counter serves every store, so the value
// is unique across the whole application inventory rather than per store —
// store 2's first product is JOB-00002, never a second JOB-00001.
export const JOB_NUMBER_KEY = "product_job";
export const JOB_NUMBER_PREFIX = "JOB-";
export const JOB_NUMBER_WIDTH = 5;

// Matches only what this generator produces. Legacy shapes such as
// JOB-BB-1A2B3C4D are deliberately excluded: they carry no counter position
// and must never be read back as one.
const SYSTEM_JOB_NUMBER = /^JOB-(\d+)$/;

export function isSystemJobNumber(value) {
  return SYSTEM_JOB_NUMBER.test(String(value ?? "").trim());
}

/** Counter position encoded in a job number, or 0 if it is not one of ours. */
export function jobNumberSequence(value) {
  const match = SYSTEM_JOB_NUMBER.exec(String(value ?? "").trim());
  return match ? Number(match[1]) : 0;
}

export function formatJobNumber(sequence) {
  return `${JOB_NUMBER_PREFIX}${String(sequence).padStart(JOB_NUMBER_WIDTH, "0")}`;
}

let seeded = false;

/**
 * Job numbers used to be typed in by hand, so a counter starting from zero
 * would hand back values that already exist and every insert would die on the
 * unique index. Push the counter past the highest number already in use — once
 * per process, since after that the counter is the only thing issuing them.
 */
async function seedCounterFromExistingProducts() {
  if (seeded) return;

  const rows = await Product.find({ jobId: SYSTEM_JOB_NUMBER }).select("jobId").lean();
  const highest = rows.reduce((max, row) => Math.max(max, jobNumberSequence(row.jobId)), 0);

  await SequenceCounter.updateOne(
    { key: JOB_NUMBER_KEY },
    { $setOnInsert: { value: 0 } },
    { upsert: true },
  );
  if (highest > 0) {
    // Conditional on value so a counter that is already ahead (another process
    // handed numbers out while we were reading) is never wound backwards.
    await SequenceCounter.updateOne(
      { key: JOB_NUMBER_KEY, value: { $lt: highest } },
      { $set: { value: highest } },
    );
  }

  seeded = true;
}

// Only ever consumed by numbers that pre-date the counter; a couple of dozen
// steps is far more headroom than any real backlog of hand-entered values.
const MAX_ATTEMPTS = 25;

/**
 * Allocate the next globally unique Job Number. The $inc on the counter is
 * atomic, so two products created at the same moment in different stores get
 * different numbers.
 */
export async function generateJobNumber() {
  await seedCounterFromExistingProducts();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = await nextSequence(JOB_NUMBER_KEY, JOB_NUMBER_PREFIX, JOB_NUMBER_WIDTH);
    // The counter alone cannot promise uniqueness while hand-entered numbers
    // from before this feature still sit in the collection, so confirm the
    // value is free and step over it if it is not.
    const taken = await Product.exists({ jobId: candidate });
    if (!taken) return candidate;
  }

  throw new HttpError(500, "Could not allocate a unique job number", "JOB_NUMBER_UNAVAILABLE");
}
