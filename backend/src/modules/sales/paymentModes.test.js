import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAYMENT_MODES, paymentMethodLabel, splitPaymentsAcrossItems } from "./paymentModes.js";

const line = (amount) => ({ lineTotal: amount });
const sum = (rows, key) => Number(rows.reduce((total, row) => total + row[key], 0).toFixed(2));

describe("payment modes — reporting how a bill was actually paid", () => {
  it("covers exactly the four modes POS bills with", () => {
    assert.deepEqual(PAYMENT_MODES.map((mode) => mode.method), ["cash", "upi", "card", "bank_transfer"]);
  });

  // TEST 1 — the ordinary single-device bill: the whole amount belongs to the
  // one mode it was paid with, and the other columns stay empty.
  it("puts the full amount against the mode a one-line bill was paid with", () => {
    const rows = splitPaymentsAcrossItems({
      items: [line(24999)],
      payments: [{ paymentMethod: "upi", amount: 24999 }],
    });
    assert.deepEqual(rows, [{ cashAmount: 0, upiAmount: 24999, cardAmount: 0, bankTransferAmount: 0 }]);
  });

  // TEST 2 — a bill settled part in cash and part by card reports both, rather
  // than only whichever payment happened to be recorded first.
  it("reports every mode of a split payment", () => {
    const [row] = splitPaymentsAcrossItems({
      items: [line(30000)],
      payments: [
        { paymentMethod: "cash", amount: 10000 },
        { paymentMethod: "card", amount: 20000 },
      ],
    });
    assert.equal(row.cashAmount, 10000);
    assert.equal(row.cardAmount, 20000);
    assert.equal(row.upiAmount, 0);
  });

  // TEST 3 — the core rule for a per-line report: a two-line bill must not
  // look like it was paid twice.
  it("spreads a bill across its lines instead of repeating the bill total", () => {
    const rows = splitPaymentsAcrossItems({
      items: [line(12000), line(8000)],
      payments: [{ paymentMethod: "cash", amount: 20000 }],
    });
    assert.deepEqual(rows.map((row) => row.cashAmount), [12000, 8000]);
    assert.equal(sum(rows, "cashAmount"), 20000);
  });

  // TEST 4 — the parts must add back to the paise, whatever the split does to
  // rounding: three equal lines of a 1000.01 bill cannot lose or invent money.
  it("gives the rounding remainder to the last line so the bill still balances", () => {
    const rows = splitPaymentsAcrossItems({
      items: [line(333.34), line(333.34), line(333.33)],
      payments: [{ paymentMethod: "bank_transfer", amount: 1000.01 }],
    });
    assert.equal(sum(rows, "bankTransferAmount"), 1000.01);
    rows.forEach((row) => assert.ok(row.bankTransferAmount > 0, "no line may be allocated nothing"));
  });

  // TEST 5 — exchange credit is not money that arrived by a POS mode, so it
  // must not be dressed up as one.
  it("leaves wallet and mixed payments out of the mode columns", () => {
    const [row] = splitPaymentsAcrossItems({
      items: [line(50000)],
      payments: [
        { paymentMethod: "cash", amount: 35000 },
        { paymentMethod: "wallet", amount: 12000 },
        { paymentMethod: "mixed", amount: 3000 },
      ],
    });
    assert.equal(row.cashAmount, 35000);
    assert.equal(sum([row], "upiAmount") + row.cardAmount + row.bankTransferAmount, 0);
  });

  // TEST 6 — a fully discounted or zero-valued line array has no weights to
  // divide by; the payment still has to be reported somewhere.
  it("reports a payment on the first line when no line carries a value", () => {
    const rows = splitPaymentsAcrossItems({
      items: [line(0), line(0)],
      payments: [{ paymentMethod: "cash", amount: 500 }],
    });
    assert.deepEqual(rows.map((row) => row.cashAmount), [500, 0]);
  });

  // TEST 7 — an unpaid or draft bill reports zeros, never blanks or NaN.
  it("reports zeros for a bill with no payments recorded", () => {
    const [row] = splitPaymentsAcrossItems({ items: [line(1000)], payments: [] });
    assert.deepEqual(row, { cashAmount: 0, upiAmount: 0, cardAmount: 0, bankTransferAmount: 0 });
    assert.deepEqual(splitPaymentsAcrossItems({}), []);
  });

  // TEST 8 — the adjusted line total is what the customer was billed, so it is
  // the weight the payment follows.
  it("weights the split by the adjusted line total, not the list total", () => {
    const rows = splitPaymentsAcrossItems({
      items: [
        { lineTotal: 20000, lineAdjustedTotal: 5000 },
        { lineTotal: 5000 },
      ],
      payments: [{ paymentMethod: "cash", amount: 10000 }],
    });
    assert.deepEqual(rows.map((row) => row.cashAmount), [5000, 5000]);
  });

  describe("payment method label", () => {
    it("lists every mode used, once each, named as POS names them", () => {
      assert.equal(paymentMethodLabel({ payments: [
        { paymentMethod: "cash" }, { paymentMethod: "upi" }, { paymentMethod: "cash" },
      ] }), "Cash, UPI");
      assert.equal(paymentMethodLabel({ payments: [{ paymentMethod: "bank_transfer" }] }), "Bank Transfer");
    });

    it("still names a method that has no column of its own", () => {
      assert.equal(paymentMethodLabel({ payments: [
        { paymentMethod: "cash" }, { paymentMethod: "wallet" },
      ] }), "Cash, Wallet");
    });

    it("is empty when nothing was paid", () => {
      assert.equal(paymentMethodLabel({ payments: [] }), "");
      assert.equal(paymentMethodLabel(undefined), "");
    });
  });
});
