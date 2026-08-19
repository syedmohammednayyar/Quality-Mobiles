import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatJobNumber, isSystemJobNumber, jobNumberSequence } from "./jobNumber.js";

// The generator seeds its counter by reading the numbers already in the
// database. If these three helpers disagree about what a job number is, the
// counter restarts low and the next insert collides with an existing record.
describe("job number format", () => {
  it("pads to a fixed width so numbers sort in issue order", () => {
    assert.equal(formatJobNumber(1), "JOB-00001");
    assert.equal(formatJobNumber(7), "JOB-00007");
    assert.equal(formatJobNumber(42), "JOB-00042");
  });

  it("keeps growing past the padding width instead of wrapping", () => {
    assert.equal(formatJobNumber(123456), "JOB-123456");
  });

  it("round-trips through the sequence reader", () => {
    for (const value of [1, 9, 10, 99999, 100000]) {
      assert.equal(jobNumberSequence(formatJobNumber(value)), value);
    }
  });
});

describe("recognising a system-issued job number", () => {
  it("accepts what the generator produces", () => {
    assert.equal(isSystemJobNumber("JOB-00001"), true);
    assert.equal(isSystemJobNumber("  JOB-00042  "), true);
  });

  // These pre-date the global sequence. Reading one as a counter position
  // would be meaningless, so they must not be matched.
  it("rejects the legacy buyback and gift shapes", () => {
    assert.equal(isSystemJobNumber("JOB-BB-1A2B3C4D"), false);
    assert.equal(isSystemJobNumber("JOB-GIFT-9F8E7D6C"), false);
    assert.equal(jobNumberSequence("JOB-BB-1A2B3C4D"), 0);
  });

  it("rejects anything that is not a job number at all", () => {
    assert.equal(isSystemJobNumber("SAL-000123"), false);
    assert.equal(isSystemJobNumber("00001"), false);
    assert.equal(isSystemJobNumber(""), false);
    assert.equal(isSystemJobNumber(null), false);
    assert.equal(isSystemJobNumber(undefined), false);
  });

  it("reads a missing number as position zero, not NaN", () => {
    assert.equal(jobNumberSequence(undefined), 0);
    assert.equal(jobNumberSequence(""), 0);
  });
});
