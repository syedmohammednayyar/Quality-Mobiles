import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateEffectiveSellingAmounts,
  classifyLossType,
  computeCostBasis,
  evaluateLoss,
  evaluateSaleItemLoss,
  fromCents,
  toCents,
} from "./lossCalculation.service.js";

// ─── Money helpers ──────────────────────────────────────────────────────────

test("toCents/fromCents round-trip cleanly", () => {
  assert.equal(toCents(50000), 5000000);
  assert.equal(fromCents(5000000), 50000);
});

// ─── Profit / break-even / loss (spec §44) ─────────────────────────────────

test("profit: cost 50000, selling 55000 -> no loss, profit 5000", () => {
  const result = evaluateLoss({ costBasisCents: toCents(50000), effectiveSellingAmountCents: toCents(55000) });
  assert.equal(result.isLoss, false);
  assert.equal(result.lossAmountCents, 0);
  assert.equal(fromCents(result.grossResultCents), 5000);
});

test("break-even: cost 50000, selling 50000 -> no loss, no profit", () => {
  const result = evaluateLoss({ costBasisCents: toCents(50000), effectiveSellingAmountCents: toCents(50000) });
  assert.equal(result.isLoss, false);
  assert.equal(result.lossAmountCents, 0);
  assert.equal(fromCents(result.grossResultCents), 0);
});

test("loss: cost 50000, selling 49000 -> loss 1000", () => {
  const result = evaluateLoss({ costBasisCents: toCents(50000), effectiveSellingAmountCents: toCents(49000) });
  assert.equal(result.isLoss, true);
  assert.equal(fromCents(result.lossAmountCents), 1000);
  assert.equal(result.lossPercentage, 2); // 1000 / 50000 * 100
});

// ─── Discount pushing a sale below cost (spec §2) ──────────────────────────

test("discount causes loss: original 55000, discount 6000, cost 50000 -> final 49000, loss 1000", () => {
  const allocations = allocateEffectiveSellingAmounts(
    [{ lineAdjustedTotalCents: toCents(55000) }],
    toCents(6000),
  );
  assert.equal(fromCents(allocations[0].effectiveSellingAmountCents), 49000);
  const result = evaluateLoss({ costBasisCents: toCents(50000), effectiveSellingAmountCents: allocations[0].effectiveSellingAmountCents });
  assert.equal(result.isLoss, true);
  assert.equal(fromCents(result.lossAmountCents), 1000);
});

test("discount within margin: original 55000, discount 4000, cost 50000 -> final 51000, profit 1000, no loss", () => {
  const allocations = allocateEffectiveSellingAmounts(
    [{ lineAdjustedTotalCents: toCents(55000) }],
    toCents(4000),
  );
  const result = evaluateLoss({ costBasisCents: toCents(50000), effectiveSellingAmountCents: allocations[0].effectiveSellingAmountCents });
  assert.equal(result.isLoss, false);
  assert.equal(fromCents(result.grossResultCents), 1000);
});

// ─── Multiple sale items evaluated independently (spec §5) ─────────────────

test("multiple items: one profit item + one loss item in the same bill are independent", () => {
  const items = [
    { lineAdjustedTotalCents: toCents(49000) }, // iPhone: cost 50000 -> loss
    { lineAdjustedTotalCents: toCents(700) },   // case: cost 500 -> profit
  ];
  const allocations = allocateEffectiveSellingAmounts(items, 0); // no bill-level discount
  const phone = evaluateLoss({ costBasisCents: toCents(50000), effectiveSellingAmountCents: allocations[0].effectiveSellingAmountCents });
  const caseItem = evaluateLoss({ costBasisCents: toCents(500), effectiveSellingAmountCents: allocations[1].effectiveSellingAmountCents });

  assert.equal(phone.isLoss, true);
  assert.equal(fromCents(phone.lossAmountCents), 1000);
  assert.equal(caseItem.isLoss, false);
  assert.equal(fromCents(caseItem.grossResultCents), 200);
});

// ─── Buyback + repair cost basis (spec §37) ────────────────────────────────

test("buyback resale: buyback 20000 + repair 2000 = cost 22000, resold 21000 -> loss 1000", () => {
  const { costBasisCents, costBasisSource } = computeCostBasis({
    productCategory: "used_phone",
    purchasePrice: 20000, // stale product master price, should be ignored in favor of buyback
    quantity: 1,
    buyback: { negotiatedPrice: 20000, repairCost: 2000, otherCapitalizedCost: 0 },
  });
  assert.equal(costBasisSource, "buyback_cost_basis");
  assert.equal(fromCents(costBasisCents), 22000);

  const result = evaluateLoss({ costBasisCents, effectiveSellingAmountCents: toCents(21000) });
  assert.equal(result.isLoss, true);
  assert.equal(fromCents(result.lossAmountCents), 1000);

  const { lossType } = classifyLossType({ hasBuyback: true });
  assert.equal(lossType, "BUYBACK_RESALE_LOSS");
});

test("buyback resale: profit when resold above total cost basis", () => {
  const { costBasisCents } = computeCostBasis({
    productCategory: "used_phone",
    purchasePrice: 0,
    quantity: 1,
    buyback: { negotiatedPrice: 20000, repairCost: 2000, otherCapitalizedCost: 0 },
  });
  const result = evaluateLoss({ costBasisCents, effectiveSellingAmountCents: toCents(25000) });
  assert.equal(result.isLoss, false);
  assert.equal(fromCents(result.grossResultCents), 3000);
});

// ─── Exchange credit must never be treated as loss (spec §8) ──────────────

test("exchange credit is not subtracted from effective selling amount", () => {
  // New phone selling price 40000, exchange credit 15000 (customer pays 25000).
  // allocateEffectiveSellingAmounts only knows about discountTotal, never exchangeTotal.
  const allocations = allocateEffectiveSellingAmounts(
    [{ lineAdjustedTotalCents: toCents(40000) }],
    0, // no bill-level discount — exchange credit must not be passed in here
  );
  assert.equal(fromCents(allocations[0].effectiveSellingAmountCents), 40000);
});

// ─── Loss classification ───────────────────────────────────────────────────

test("classifyLossType: item-level adjustment -> DISCOUNT_BELOW_COST", () => {
  const { lossType } = classifyLossType({ hasBuyback: false, priceWasAdjusted: true, adjustmentCategory: "negotiation" });
  assert.equal(lossType, "DISCOUNT_BELOW_COST");
});

test("classifyLossType: damage adjustment -> DAMAGED_STOCK", () => {
  const { lossType } = classifyLossType({ hasBuyback: false, priceWasAdjusted: true, adjustmentCategory: "damage" });
  assert.equal(lossType, "DAMAGED_STOCK");
});

test("classifyLossType: bill-level discount only (no item adjustment) -> PRICE_ADJUSTMENT", () => {
  const { lossType } = classifyLossType({ hasBuyback: false, priceWasAdjusted: false });
  assert.equal(lossType, "PRICE_ADJUSTMENT");
});

// ─── Zero/negative-cost guard: never NaN/Infinity (spec §29) ──────────────

test("zero cost basis never produces a loss or NaN/Infinity percentage", () => {
  const result = evaluateLoss({ costBasisCents: 0, effectiveSellingAmountCents: toCents(100) });
  assert.equal(result.isLoss, false);
  assert.equal(result.lossPercentage, 0);
  assert.equal(Number.isFinite(result.lossPercentage), true);
});

test("evaluateSaleItemLoss end-to-end wrapper produces consistent output", () => {
  const result = evaluateSaleItemLoss({
    productCategory: "new_phone",
    purchasePrice: 50000,
    quantity: 1,
    buyback: null,
    lineAdjustedTotal: 55000,
    discountAllocated: 6000,
    priceWasAdjusted: false,
    adjustmentCategory: undefined,
  });
  assert.equal(result.isLoss, true);
  assert.equal(result.costBasis, 50000);
  assert.equal(result.effectiveSellingAmount, 49000);
  assert.equal(result.lossAmount, 1000);
  assert.equal(result.lossType, "PRICE_ADJUSTMENT");
});
