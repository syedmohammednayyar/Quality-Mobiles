import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateMargin, MARGIN_STATUS, evaluateSaleItemLoss } from "./lossCalculation.service.js";

describe("calculateMargin — the negative-margin business rule", () => {
  it("detects the reported defect: purchase 12, selling 1", () => {
    const m = calculateMargin({ purchasePrice: 12, sellingPrice: 1 });
    assert.equal(m.totalMargin, -11);
    assert.equal(m.marginPercentage, -91.67);
    assert.equal(m.status, MARGIN_STATUS.LOSS);
    assert.equal(m.isLoss, true);
    assert.equal(m.lossAmount, 11);
  });

  // ── The four canonical cases from the spec ────────────────────────────────
  it("Case 1 — profit", () => {
    const m = calculateMargin({ purchasePrice: 100, sellingPrice: 150 });
    assert.equal(m.totalMargin, 50);
    assert.equal(m.marginPercentage, 50);
    assert.equal(m.status, MARGIN_STATUS.PROFIT);
    assert.equal(m.isLoss, false);
    assert.equal(m.lossAmount, 0);
  });

  it("Case 2 — break-even is not a loss", () => {
    const m = calculateMargin({ purchasePrice: 100, sellingPrice: 100 });
    assert.equal(m.totalMargin, 0);
    assert.equal(m.marginPercentage, 0);
    assert.equal(m.status, MARGIN_STATUS.BREAK_EVEN);
    assert.equal(m.isLoss, false);
  });

  it("Case 3 — loss", () => {
    const m = calculateMargin({ purchasePrice: 100, sellingPrice: 80 });
    assert.equal(m.totalMargin, -20);
    assert.equal(m.status, MARGIN_STATUS.LOSS);
    assert.equal(m.lossAmount, 20);
  });

  it("Case 4 — a discount turns a profitable price into a loss", () => {
    // The case a naive `sellingPrice < purchasePrice` check would miss entirely.
    const naive = calculateMargin({ purchasePrice: 100, sellingPrice: 150 });
    assert.equal(naive.status, MARGIN_STATUS.PROFIT, "list price alone looks profitable");

    const m = calculateMargin({ purchasePrice: 100, sellingPrice: 150, discount: 60 });
    assert.equal(m.effectiveSellingPrice, 90);
    assert.equal(m.totalMargin, -10);
    assert.equal(m.status, MARGIN_STATUS.LOSS);
    assert.equal(m.lossAmount, 10);
  });

  it("Case 5 — zero purchase price never divides by zero", () => {
    const m = calculateMargin({ purchasePrice: 0, sellingPrice: 50 });
    assert.equal(m.marginPercentage, null, "no cost basis -> no meaningful percentage");
    assert.ok(!Number.isNaN(Number(m.marginPercentage)));
    assert.notEqual(m.marginPercentage, Infinity);
    assert.equal(m.status, MARGIN_STATUS.PROFIT);

    const zeroBoth = calculateMargin({ purchasePrice: 0, sellingPrice: 0 });
    assert.equal(zeroBoth.marginPercentage, null);
    assert.equal(zeroBoth.status, MARGIN_STATUS.BREAK_EVEN);
  });

  it("Case 6 — multi-quantity reports per-unit and total loss", () => {
    const m = calculateMargin({ purchasePrice: 100, sellingPrice: 80, quantity: 5 });
    assert.equal(m.unitMargin, -20, "per unit loss");
    assert.equal(m.totalMargin, -100, "total loss");
    assert.equal(m.lossAmount, 100);
    assert.equal(m.totalCost, 500);
    assert.equal(m.effectiveSellingPrice, 400);
    assert.equal(m.status, MARGIN_STATUS.LOSS);
  });

  it("treats discount as a line total, not per unit", () => {
    const m = calculateMargin({ purchasePrice: 100, sellingPrice: 120, discount: 50, quantity: 2 });
    assert.equal(m.originalSellingPrice, 240);
    assert.equal(m.effectiveSellingPrice, 190);
    assert.equal(m.totalCost, 200);
    assert.equal(m.totalMargin, -10);
    assert.equal(m.status, MARGIN_STATUS.LOSS);
  });

  // ── Boundary and hostile input ────────────────────────────────────────────
  it("holds the break-even boundary exactly, without float drift", () => {
    // 0.1 + 0.2 style drift must not tip this into LOSS or PROFIT.
    const m = calculateMargin({ purchasePrice: 0.3, sellingPrice: 0.1 + 0.2 });
    assert.equal(m.totalMargin, 0);
    assert.equal(m.status, MARGIN_STATUS.BREAK_EVEN);
  });

  it("detects a one-paisa loss", () => {
    const m = calculateMargin({ purchasePrice: 100, sellingPrice: 99.99 });
    assert.equal(m.totalMargin, -0.01);
    assert.equal(m.status, MARGIN_STATUS.LOSS);
  });

  it("accepts numeric strings, as the API returns them", () => {
    const m = calculateMargin({ purchasePrice: "12.00", sellingPrice: "1.00" });
    assert.equal(m.totalMargin, -11);
    assert.equal(m.status, MARGIN_STATUS.LOSS);
  });

  it("survives null, undefined and non-numeric input without NaN", () => {
    for (const input of [
      { purchasePrice: null, sellingPrice: null },
      { purchasePrice: undefined, sellingPrice: 10 },
      { purchasePrice: "abc", sellingPrice: "xyz" },
      {},
    ]) {
      const m = calculateMargin(input);
      assert.ok(!Number.isNaN(m.totalMargin), `NaN margin for ${JSON.stringify(input)}`);
      assert.ok(["PROFIT", "BREAK_EVEN", "LOSS"].includes(m.status));
    }
  });

  it("clamps a zero or negative quantity to one unit", () => {
    assert.equal(calculateMargin({ purchasePrice: 100, sellingPrice: 80, quantity: 0 }).totalMargin, -20);
    assert.equal(calculateMargin({ purchasePrice: 100, sellingPrice: 80, quantity: -3 }).totalMargin, -20);
  });
});

describe("parity — catalogue margin agrees with recorded sale-time loss", () => {
  // If these drift, Inventory would flag an item that POS and the sale record
  // disagree about. The whole point of one shared rule is that they cannot.
  const scenarios = [
    { purchasePrice: 12,  sellingPrice: 1,   discount: 0,  quantity: 1 },
    { purchasePrice: 100, sellingPrice: 150, discount: 60, quantity: 1 },
    { purchasePrice: 100, sellingPrice: 80,  discount: 0,  quantity: 5 },
    { purchasePrice: 100, sellingPrice: 100, discount: 0,  quantity: 1 },
    { purchasePrice: 100, sellingPrice: 120, discount: 50, quantity: 2 },
    { purchasePrice: 999.99, sellingPrice: 1000, discount: 0.02, quantity: 3 },
  ];

  scenarios.forEach((s) => {
    it(`cost ${s.purchasePrice} x${s.quantity} sold ${s.sellingPrice} less ${s.discount}`, () => {
      const margin = calculateMargin(s);
      const sale = evaluateSaleItemLoss({
        productCategory: "new_phone",
        purchasePrice: s.purchasePrice,
        quantity: s.quantity,
        buyback: null,
        lineAdjustedTotal: s.sellingPrice * s.quantity,
        discountAllocated: s.discount,
        priceWasAdjusted: false,
      });

      assert.equal(margin.totalCost, sale.costBasis, "cost basis");
      assert.equal(margin.effectiveSellingPrice, sale.effectiveSellingAmount, "effective selling amount");
      assert.equal(margin.totalMargin, sale.grossResult, "margin vs gross result");
      assert.equal(margin.isLoss, sale.isLoss, "loss flag");
      assert.equal(margin.lossAmount, sale.lossAmount, "loss amount");
      assert.equal(margin.lossPercentage, sale.lossPercentage, "loss percentage");
    });
  });
});
