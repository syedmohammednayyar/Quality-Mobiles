import { SequenceCounter } from "../db/models.js";

// Shared, monotonically-increasing, zero-padded business identifier
// generator (e.g. JOB-00001, SAL-000123) — short and human-readable instead
// of exposing a raw ObjectId. `key` scopes the counter (a fresh key starts a
// fresh sequence, e.g. one counter per year for product codes).
export async function nextSequence(key, prefix, width = 5) {
  const counter = await SequenceCounter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return `${prefix}${String(counter.value).padStart(width, "0")}`;
}
