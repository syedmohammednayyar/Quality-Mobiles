import { HttpError } from "../../utils/httpError.js";

// ─── Money helpers (cents-based, mirrors sales.service.js) ────────────────────

export function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, "Invalid numeric amount", "INVALID_MONEY_VALUE");
  return Math.round(n * 100);
}

export function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

// ─── Cost basis ─────────────────────────────────────────────────────────────
// New/accessory/service items cost what the product master says it cost to acquire.
// Used phones cost whatever the linked Buyback paid out, plus repair/other capitalized
// cost — falling back to the product's purchasePrice when no Buyback link exists
// (e.g. legacy/manually-added used inventory).

export function computeCostBasis({ productCategory, purchasePrice, quantity, buyback }) {
  if (productCategory === "used_phone" && buyback) {
    const totalCents = toCents(buyback.negotiatedPrice || 0) + toCents(buyback.repairCost || 0) + toCents(buyback.otherCapitalizedCost || 0);
    return { costBasisCents: totalCents, costBasisSource: "buyback_cost_basis", buybackId: buyback._id || buyback.id || null };
  }
  return { costBasisCents: toCents(purchasePrice || 0) * Math.max(1, Number(quantity) || 1), costBasisSource: "product_purchase_price", buybackId: null };
}

// ─── Effective selling amount ──────────────────────────────────────────────
// Each item's post-item-adjustment line total (lineAdjustedTotal, already reflects
// the existing per-item negotiated price) minus its proportional share of the
// bill-level discountTotal. Tax is excluded (pass-through). Exchange credit is
// NEVER subtracted here — the traded-in device's economics are tracked through
// its own Buyback cost basis, never as a reduction of the new item's value.

export function allocateEffectiveSellingAmounts(items, discountTotalCents) {
  const totalLineAdjustedCents = items.reduce((sum, item) => sum + item.lineAdjustedTotalCents, 0);
  if (totalLineAdjustedCents <= 0 || discountTotalCents <= 0) {
    return items.map((item) => ({ discountAllocatedCents: 0, effectiveSellingAmountCents: item.lineAdjustedTotalCents }));
  }

  let allocatedSoFar = 0;
  return items.map((item, index) => {
    const isLast = index === items.length - 1;
    const share = isLast
      ? discountTotalCents - allocatedSoFar
      : Math.round((discountTotalCents * item.lineAdjustedTotalCents) / totalLineAdjustedCents);
    allocatedSoFar += share;
    return { discountAllocatedCents: share, effectiveSellingAmountCents: item.lineAdjustedTotalCents - share };
  });
}

// ─── Loss evaluation ────────────────────────────────────────────────────────
// isLoss requires effectiveSellingAmountCents < costBasisCents, which structurally
// guarantees costBasisCents > 0 whenever a lossPercentage is computed — no
// NaN/Infinity path exists. A defensive guard is kept anyway.

export function evaluateLoss({ costBasisCents, effectiveSellingAmountCents }) {
  const grossResultCents = effectiveSellingAmountCents - costBasisCents;
  const isLoss = effectiveSellingAmountCents < costBasisCents;
  const lossAmountCents = isLoss ? costBasisCents - effectiveSellingAmountCents : 0;
  const lossPercentage = isLoss && costBasisCents > 0 ? Number(((lossAmountCents / costBasisCents) * 100).toFixed(2)) : 0;
  return { grossResultCents, isLoss, lossAmountCents, lossPercentage };
}

// ─── Loss classification ────────────────────────────────────────────────────

export function classifyLossType({ hasBuyback, priceWasAdjusted, adjustmentCategory }) {
  if (hasBuyback) return { lossType: "BUYBACK_RESALE_LOSS", lossReason: "Buyback/refurbished device resold below total cost basis" };
  if (priceWasAdjusted && adjustmentCategory === "damage") return { lossType: "DAMAGED_STOCK", lossReason: "Price reduced for damaged stock" };
  if (priceWasAdjusted && (adjustmentCategory === "promotion" || adjustmentCategory === "bulk")) return { lossType: "CLEARANCE_SALE", lossReason: "Clearance/promotional/bulk pricing below cost" };
  if (priceWasAdjusted) return { lossType: "DISCOUNT_BELOW_COST", lossReason: "Item-level price adjustment below cost" };
  return { lossType: "PRICE_ADJUSTMENT", lossReason: "Bill-level discount reduced the item below cost" };
}

// ─── Combined per-item evaluation ──────────────────────────────────────────
// Convenience wrapper used by sales.service.js — takes plain-money inputs and
// returns plain-money outputs so callers don't need to juggle cents themselves.

export function evaluateSaleItemLoss({ productCategory, purchasePrice, quantity, buyback, lineAdjustedTotal, discountAllocated, priceWasAdjusted, adjustmentCategory }) {
  const { costBasisCents, costBasisSource, buybackId } = computeCostBasis({ productCategory, purchasePrice, quantity, buyback });
  const effectiveSellingAmountCents = toCents(lineAdjustedTotal) - toCents(discountAllocated || 0);
  const { grossResultCents, isLoss, lossAmountCents, lossPercentage } = evaluateLoss({ costBasisCents, effectiveSellingAmountCents });
  const { lossType, lossReason } = isLoss ? classifyLossType({ hasBuyback: Boolean(buyback), priceWasAdjusted, adjustmentCategory }) : { lossType: null, lossReason: null };

  return {
    costBasis: fromCents(costBasisCents),
    costBasisSource,
    buybackId,
    effectiveSellingAmount: fromCents(effectiveSellingAmountCents),
    grossResult: fromCents(grossResultCents),
    isLoss,
    lossAmount: fromCents(lossAmountCents),
    lossPercentage,
    lossType,
    lossReason,
  };
}
