import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAYMENT_MODES, isOnlinePayment, paymentMethodLabel, rebuildOnlinePayments, splitPaymentsAcrossItems } from "./paymentModes.js";

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

describe("rebuilding online payments when a sale is edited", () => {
  const rebuilt = (payments, onlineCents) =>
    rebuildOnlinePayments(payments, onlineCents).map(({ paymentMethod, amountCents }) => [paymentMethod, amountCents]);

  // TEST 1 — the regression this exists for. Editing a UPI sale used to rewrite
  // it as a bank transfer, moving the money to the wrong report column for good.
  it("keeps a UPI sale on UPI instead of rebranding it a bank transfer", () => {
    const payments = [{ paymentMethod: "upi", amount: 24999 }];
    assert.deepEqual(rebuilt(payments, 2499900), [["upi", 2499900]]);
  });

  it("keeps a card sale on card", () => {
    assert.deepEqual(rebuilt([{ paymentMethod: "card", amount: 5000 }], 500000), [["card", 500000]]);
  });

  // TEST 2 — the mode survives even when the amount itself is what changed.
  it("carries the mode across an edit that changes the amount", () => {
    assert.deepEqual(rebuilt([{ paymentMethod: "upi", amount: 10000 }], 750000), [["upi", 750000]]);
  });

  it("keeps a genuine bank transfer a bank transfer", () => {
    assert.deepEqual(rebuilt([{ paymentMethod: "bank_transfer", amount: 300 }], 30000), [["bank_transfer", 30000]]);
  });

  // TEST 3 — cash and wallet are not online money and must not be treated as a
  // mode to carry forward; updateSale rebuilds those two separately.
  it("ignores cash and wallet entries when deciding the online mode", () => {
    const payments = [
      { paymentMethod: "cash",   amount: 5000 },
      { paymentMethod: "card",   amount: 2000 },
      { paymentMethod: "wallet", amount: 1000 },
    ];
    assert.deepEqual(rebuilt(payments, 200000), [["card", 200000]]);
  });

  // TEST 4 — nothing on the sale says how the money arrived, so bank transfer
  // stays the fallback. This is the only case the old behaviour was right for.
  it("falls back to bank transfer when the sale had no online payment", () => {
    assert.deepEqual(rebuilt([{ paymentMethod: "cash", amount: 500 }], 100000), [["bank_transfer", 100000]]);
    assert.deepEqual(rebuilt([], 100000), [["bank_transfer", 100000]]);
  });

  // TEST 5 — a split online bill keeps every mode, re-weighted, and the parts
  // still add back to the edited total.
  it("preserves every mode of a split online sale, in proportion", () => {
    const payments = [
      { paymentMethod: "upi",  amount: 300 },
      { paymentMethod: "card", amount: 100 },
    ];
    const rows = rebuildOnlinePayments(payments, 80000);
    assert.deepEqual(rows.map((r) => [r.paymentMethod, r.amountCents]), [["upi", 60000], ["card", 20000]]);
    assert.equal(rows.reduce((total, r) => total + r.amountCents, 0), 80000);
  });

  it("gives the rounding remainder to the last mode so the total still balances", () => {
    const payments = [
      { paymentMethod: "upi",  amount: 1 },
      { paymentMethod: "card", amount: 1 },
      { paymentMethod: "bank_transfer", amount: 1 },
    ];
    const rows = rebuildOnlinePayments(payments, 100);
    assert.equal(rows.reduce((total, r) => total + r.amountCents, 0), 100);
  });

  // TEST 6 — an edit that clears the online side leaves no online entry behind.
  it("writes no online entry when the online total drops to zero", () => {
    assert.deepEqual(rebuilt([{ paymentMethod: "upi", amount: 5000 }], 0), []);
  });

  it("keeps the transaction reference attached to the payment", () => {
    const payments = [{ paymentMethod: "upi", amount: 5000, referenceNo: "UPI-8891" }];
    assert.equal(rebuildOnlinePayments(payments, 500000)[0].referenceNo, "UPI-8891");
    assert.equal(rebuildOnlinePayments([], 500000)[0].referenceNo, null);
  });

  it("classifies online money the same way updateSale sums it", () => {
    assert.equal(isOnlinePayment({ paymentMethod: "upi" }), true);
    assert.equal(isOnlinePayment({ paymentMethod: "card" }), true);
    assert.equal(isOnlinePayment({ paymentMethod: "bank_transfer" }), true);
    assert.equal(isOnlinePayment({ paymentMethod: "cash" }), false);
    assert.equal(isOnlinePayment({ paymentMethod: "wallet" }), false);
    assert.equal(isOnlinePayment({}), false);
  });
});
