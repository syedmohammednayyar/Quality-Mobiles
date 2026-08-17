// ─── Sale retrieval ───────────────────────────────────────────────────────────
// Moving a product out of "sold" and back to a sellable status returns the
// device to stock. Before this existed the originating sale was left untouched,
// so Sales History kept presenting the transaction as a plain completed sale
// and the money kept counting towards revenue while the device sat back on the
// shelf, sellable again.
//
// Retrieval reverses the *sale line*, never the whole bill: the other items on
// a multi-item sale were still genuinely sold. The line's financial snapshot is
// immutable and stays exactly as it was — what changes is that the line is
// stamped retrieved, the sale carries running retrieval totals so revenue can
// be netted down without rewriting history, and the sale status reflects
// whether some or all of it came back.

import { Customer, Sale, StockLedger } from "../../db/models.js";
import { writeAudit } from "../../utils/audit.js";
import { reverseLossesForSaleProduct } from "../losses/losses.service.js";
import { REVENUE_SALE_STATUSES } from "./saleStatus.js";

function money(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Number(money(value).toFixed(2));
}

/**
 * What this line contributed to the sale's headline totals.
 *
 * `effectiveSellingAmount` already has its share of any bill-level discount
 * taken off, so net = that plus the line's tax. Exchange credit is a
 * bill-level figure that was never allocated per line, which is why the caller
 * clamps the running total to the sale's grandTotal rather than trusting the
 * sum blindly. Older sales predate the loss snapshot, so fall back to lineTotal.
 */
export function lineContribution(item) {
  const net = item.effectiveSellingAmount != null
    ? money(item.effectiveSellingAmount) + money(item.taxAmount)
    : money(item.lineTotal);
  const gross = money(item.lineOriginalTotal)
    || money(item.originalUnitPrice) * money(item.quantity)
    || net;
  return { net: round2(net), gross: round2(gross) };
}

/**
 * Is this product edit a retrieval — a sold device coming back into sellable
 * stock — and therefore something the originating sale has to be told about?
 *
 * `Product.inventoryStatus === "sold"` cannot be the only signal, and that was
 * the bug: the stored status drifts away from "sold" while the device is still
 * sold (a buyback edit rewrites it, older rows predate the field), and the
 * Inventory grid does not read it either — it labels any row with no stock on
 * hand as "Sold". So the grid would show "Sold", the admin would set it back to
 * "Ready for Sale", stock would be restored, and the sale would be left counting
 * its money because the stored string never said "sold".
 *
 * Both halves of "was sold" are therefore accepted, and both halves of "is
 * sellable again" are required, which is what keeps the gate from firing on an
 * unrelated status edit to a product that still has real stock on the shelf.
 *
 * @param {object}  change
 * @param {string}  change.statusBefore   Product.inventoryStatus before the edit.
 * @param {string}  change.statusAfter    Product.inventoryStatus after the edit.
 * @param {?number} change.stockBefore    Units on hand before the edit.
 * @param {?number} change.stockAfter     Units on hand after the edit.
 * @param {boolean} change.inventoryEdited Whether status/stock were part of this edit at all.
 */
export function isSaleRetrieval({ statusBefore, statusAfter, stockBefore, stockAfter, inventoryEdited }) {
  // A price or name edit never returns a device to stock, whatever the status
  // happens to be, so it must never reverse a sale.
  if (!inventoryEdited) return false;

  const wasSold    = statusBefore === "sold" || money(stockBefore) <= 0;
  const isSellable = statusAfter !== "sold" && money(stockAfter) > 0;
  return wasSold && isSellable;
}

/**
 * Find the sale line a retrieval should reverse: the most recent still-live
 * line for this product in this store. A product can be sold, retrieved and
 * sold again, so lines already stamped retrieved are skipped — retrieving
 * twice must not reverse an older sale a second time.
 */
async function findLiveSaleLine(productId, storeId, session) {
  const base = {
    status: { $in: REVENUE_SALE_STATUSES },
    items: { $elemMatch: { product: productId, retrievedAt: null } },
  };

  // Prefer a sale in the store the product now sits in. If there is none, fall
  // back to any store: the device is one physical unit, and a product moved
  // between stores after being sold must still reconcile against the sale it
  // actually came from rather than silently leaving it counted.
  if (storeId) {
    const scoped = await Sale.findOne({ ...base, store: storeId }).sort({ createdAt: -1 }).session(session);
    if (scoped) return scoped;
  }

  return Sale.findOne(base).sort({ createdAt: -1 }).session(session);
}

/**
 * Reverse the sale line for a product that has been returned to stock.
 *
 * Inventory is deliberately *not* touched here — the caller (updateProduct)
 * has already restored the stock row, and restoring it twice would invent
 * units. This function owns the sales-side record only.
 *
 * Returns a summary of what was reversed, or null when the product has no live
 * sale line — a product marked sold by hand and never actually billed has
 * nothing to reconcile, and that is not an error.
 */
export async function retrieveSoldProductLine({ productId, storeId, userId, reason, session }) {
  const sale = await findLiveSaleLine(productId, storeId, session);
  if (!sale) return null;

  const item = sale.items.find(
    (line) => String(line.product) === String(productId) && !line.retrievedAt,
  );
  if (!item) return null;

  const { net, gross } = lineContribution(item);
  const retrievalReason = String(reason || "").trim() || "Product retrieved from sale";
  const previousStatus = sale.status;

  item.retrievedAt = new Date();
  item.retrievedBy = userId || null;
  item.retrievalReason = retrievalReason;

  // Clamp against the sale's own totals: bill-level exchange credit and
  // rounding mean the summed line contributions can exceed the headline
  // figure, and a negative net revenue would be worse than a slightly
  // conservative one.
  sale.retrievedTotal = Math.min(round2(money(sale.retrievedTotal) + net), round2(sale.grandTotal));
  sale.retrievedOriginalTotal = Math.min(
    round2(money(sale.retrievedOriginalTotal) + gross),
    round2(sale.originalAmount || sale.grandTotal),
  );
  sale.retrievedQuantity = round2(money(sale.retrievedQuantity) + money(item.quantity));

  const fullyRetrieved = sale.items.every((line) => Boolean(line.retrievedAt));
  sale.status = fullyRetrieved ? "retrieved" : "partially_retrieved";

  await sale.save({ session });

  // The customer's lifetime value should not keep crediting a device they no
  // longer have. The purchase count only drops when nothing of the sale is
  // left — a partially retrieved bill is still one purchase.
  if (sale.customer) {
    const customerUpdate = { lifetimeValue: -net };
    if (fullyRetrieved) customerUpdate.totalPurchaseCount = -1;
    await Customer.findByIdAndUpdate(sale.customer, { $inc: customerUpdate }, { session });
  }

  await reverseLossesForSaleProduct({
    saleId: sale._id,
    productId,
    userId,
    reason: retrievalReason,
    session,
  });

  await StockLedger.create([{
    store: sale.store,
    product: productId,
    movementType: "return",
    quantity: Math.max(1, Math.round(money(item.quantity))),
    referenceType: "sale_retrieval",
    referenceId: sale._id,
    reason: "sale_retrieval",
    note: `Retrieved from sale ${sale.saleNo} — ${retrievalReason}`,
    createdBy: userId || null,
  }], { session });

  await writeAudit({
    action: "sale_item_retrieved",
    entityType: "sale",
    entityId: sale._id,
    ctx: { userId, storeId: sale.store },
    fieldName: "status",
    oldValue: previousStatus,
    newValue: sale.status,
    notes: retrievalReason,
    metadata: {
      saleNo: sale.saleNo,
      productId: String(productId),
      quantity: item.quantity,
      retrievedAmount: net,
      fullyRetrieved,
    },
  });

  return {
    saleId: String(sale._id),
    saleNo: sale.saleNo,
    status: sale.status,
    retrievedAmount: net,
    fullyRetrieved,
  };
}
