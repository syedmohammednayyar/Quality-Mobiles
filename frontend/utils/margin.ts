/**
 * Quality Mobiles — margin / negative-margin (loss) detection.
 *
 * THE rule:
 *   effectiveSellingPrice = sellingPrice x quantity - discount
 *   totalMargin           = effectiveSellingPrice - purchasePrice x quantity
 *
 *   totalMargin  < 0  ->  LOSS
 *   totalMargin == 0  ->  BREAK_EVEN
 *   totalMargin  > 0  ->  PROFIT
 *
 * Every screen that shows a margin — Inventory, product details, POS, Sales —
 * calls this. Nothing recomputes margin inline, so Inventory can never disagree
 * with POS about whether an item is below cost.
 *
 * This mirrors `calculateMargin` in backend/src/modules/losses/
 * lossCalculation.service.js, which is the authority at sale time. The two are
 * held together by a parity test; if they drift, that test fails.
 *
 * Arithmetic runs in integer cents. Floats drift, and drift at the exact
 * break-even boundary would flip a status.
 */

export type MarginStatus = "PROFIT" | "BREAK_EVEN" | "LOSS";

export interface MarginInput {
  purchasePrice: number | string | null | undefined;
  sellingPrice: number | string | null | undefined;
  /** Line-level total discount, not per unit. */
  discount?: number | string | null;
  quantity?: number | string | null;
}

export interface MarginResult {
  quantity: number;
  unitPurchasePrice: number;
  originalSellingPrice: number;
  discount: number;
  effectiveSellingPrice: number;
  totalCost: number;
  unitMargin: number;
  totalMargin: number;
  /** Null when there is no cost to measure against — never Infinity or NaN. */
  marginPercentage: number | null;
  status: MarginStatus;
  isLoss: boolean;
  lossAmount: number;
  lossPercentage: number;
  /** True when no purchase price is recorded, so margin cannot be judged. */
  costUnknown: boolean;
}

const toCents = (value: number | string | null | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

export function calculateMargin({ purchasePrice, sellingPrice, discount = 0, quantity = 1 }: MarginInput): MarginResult {
  const units = Math.max(1, Number(quantity) || 1);
  const unitCostCents = toCents(purchasePrice);
  const unitSellCents = toCents(sellingPrice);
  const discountCents = toCents(discount);

  const originalSellingCents = unitSellCents * units;
  const effectiveSellingCents = originalSellingCents - discountCents;
  const totalCostCents = unitCostCents * units;
  const totalMarginCents = effectiveSellingCents - totalCostCents;

  const status: MarginStatus = totalMarginCents < 0
    ? "LOSS"
    : totalMarginCents > 0 ? "PROFIT" : "BREAK_EVEN";

  const marginPercentage = totalCostCents > 0
    ? Number(((totalMarginCents / totalCostCents) * 100).toFixed(2))
    : null;

  return {
    quantity: units,
    unitPurchasePrice: fromCents(unitCostCents),
    originalSellingPrice: fromCents(originalSellingCents),
    discount: fromCents(discountCents),
    effectiveSellingPrice: fromCents(effectiveSellingCents),
    totalCost: fromCents(totalCostCents),
    unitMargin: fromCents(Math.round(totalMarginCents / units)),
    totalMargin: fromCents(totalMarginCents),
    marginPercentage,
    status,
    isLoss: status === "LOSS",
    lossAmount: totalMarginCents < 0 ? fromCents(-totalMarginCents) : 0,
    lossPercentage: totalMarginCents < 0 && totalCostCents > 0
      ? Number(((-totalMarginCents / totalCostCents) * 100).toFixed(2))
      : 0,
    costUnknown: unitCostCents <= 0,
  };
}

// ─── Bill-level discount allocation ──────────────────────────────────────────
/**
 * Spread a bill-level discount across lines in proportion to their value.
 *
 * Mirrors `allocateEffectiveSellingAmounts` in the backend loss service,
 * including the detail that the final line absorbs the rounding remainder so
 * the parts always sum to exactly the discount given. Without this, a POS
 * preview would disagree with the loss the sale actually records.
 *
 * @param lineTotals post-item-adjustment line totals, in rupees
 * @param discountTotal bill-level discount, in rupees
 * @returns per-line discount shares, in rupees
 */
export function allocateDiscount(lineTotals: number[], discountTotal: number): number[] {
  const lineCents = lineTotals.map((value) => toCents(value));
  const discountCents = toCents(discountTotal);
  const sum = lineCents.reduce((total, value) => total + value, 0);

  if (sum <= 0 || discountCents <= 0) return lineTotals.map(() => 0);

  let allocated = 0;
  return lineCents.map((value, index) => {
    const isLast = index === lineCents.length - 1;
    const share = isLast ? discountCents - allocated : Math.round((discountCents * value) / sum);
    allocated += share;
    return fromCents(share);
  });
}

export interface CartLine {
  purchasePrice: number;
  sellingPrice: number;
  quantity?: number;
}

export interface CartMarginResult {
  lines: MarginResult[];
  /** Transaction-level margin: the sum of all lines, discount included. */
  total: MarginResult;
  lossLines: number;
  totalLossAmount: number;
}

/**
 * Margin for a whole bill: per line and for the transaction as a whole.
 *
 * Both are reported because one loss-making item does not make the sale a loss
 * — a bill can carry a below-cost handset and still clear overall.
 */
export function calculateCartMargins(lines: CartLine[], billDiscount = 0): CartMarginResult {
  const lineTotals = lines.map((line) => line.sellingPrice * Math.max(1, line.quantity || 1));
  const shares = allocateDiscount(lineTotals, billDiscount);

  const results = lines.map((line, index) => calculateMargin({
    purchasePrice: line.purchasePrice,
    sellingPrice: line.sellingPrice,
    discount: shares[index],
    quantity: line.quantity || 1,
  }));

  const totalCostCents = results.reduce((sum, r) => sum + toCents(r.totalCost), 0);
  const totalEffectiveCents = results.reduce((sum, r) => sum + toCents(r.effectiveSellingPrice), 0);
  const totalOriginalCents = results.reduce((sum, r) => sum + toCents(r.originalSellingPrice), 0);
  const totalMarginCents = totalEffectiveCents - totalCostCents;

  const status: MarginStatus = totalMarginCents < 0
    ? "LOSS" : totalMarginCents > 0 ? "PROFIT" : "BREAK_EVEN";

  const total: MarginResult = {
    quantity: results.reduce((sum, r) => sum + r.quantity, 0) || 1,
    unitPurchasePrice: fromCents(totalCostCents),
    originalSellingPrice: fromCents(totalOriginalCents),
    discount: fromCents(toCents(billDiscount)),
    effectiveSellingPrice: fromCents(totalEffectiveCents),
    totalCost: fromCents(totalCostCents),
    unitMargin: fromCents(totalMarginCents),
    totalMargin: fromCents(totalMarginCents),
    marginPercentage: totalCostCents > 0
      ? Number(((totalMarginCents / totalCostCents) * 100).toFixed(2)) : null,
    status,
    isLoss: status === "LOSS",
    lossAmount: totalMarginCents < 0 ? fromCents(-totalMarginCents) : 0,
    lossPercentage: totalMarginCents < 0 && totalCostCents > 0
      ? Number(((-totalMarginCents / totalCostCents) * 100).toFixed(2)) : 0,
    costUnknown: totalCostCents <= 0,
  };

  const lossLines = results.filter((r) => r.isLoss);
  return {
    lines: results,
    total,
    lossLines: lossLines.length,
    totalLossAmount: fromCents(lossLines.reduce((sum, r) => sum + toCents(r.lossAmount), 0)),
  };
}

// ─── Presentation ────────────────────────────────────────────────────────────
// Shared so a loss looks and reads the same everywhere. Per the accessibility
// requirement, a loss is never signalled by colour alone — value, label, and
// icon all carry it.

export const MARGIN_LABEL: Record<MarginStatus, string> = {
  PROFIT: "PROFIT",
  BREAK_EVEN: "BREAK-EVEN",
  LOSS: "LOSS",
};

/** Icon paired with the label; readable without colour perception. */
export const MARGIN_ICON: Record<MarginStatus, string> = {
  PROFIT: "✓",   // check
  BREAK_EVEN: "=",
  LOSS: "⚠",     // warning triangle
};

/** CSS modifier: `margin-profit` | `margin-break-even` | `margin-loss`. */
export const marginClass = (status: MarginStatus): string =>
  `margin-${status.toLowerCase().replace("_", "-")}`;

/** Signed money, e.g. `-Rs 11`, `+Rs 24`, `Rs 0`. */
export function formatMarginAmount(margin: number): string {
  const rounded = Math.round(Math.abs(margin));
  if (margin < 0) return `-Rs ${rounded.toLocaleString()}`;
  if (margin > 0) return `+Rs ${rounded.toLocaleString()}`;
  return "Rs 0";
}

/** Signed percentage, e.g. `-91.67%`. "N/A" when there is no cost basis. */
export function formatMarginPercent(percentage: number | null): string {
  if (percentage === null) return "N/A";
  const sign = percentage > 0 ? "+" : "";
  return `${sign}${percentage.toFixed(2)}%`;
}

/** One-line summary for warnings and tooltips. */
export function marginSummary(result: MarginResult): string {
  if (result.costUnknown) return "No purchase price recorded — margin cannot be calculated.";
  if (!result.isLoss) return `${MARGIN_LABEL[result.status]} ${formatMarginAmount(result.totalMargin)}`;
  const perUnit = result.quantity > 1 ? ` (${formatMarginAmount(result.unitMargin)} per unit)` : "";
  return `Selling below purchase price — loss of Rs ${Math.round(result.lossAmount).toLocaleString()}${perUnit}.`;
}
