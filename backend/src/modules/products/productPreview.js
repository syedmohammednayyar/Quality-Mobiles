// ─── Product preview (retrieved / revised inventory) ──────────────────────────
// When a device is retrieved from a completed sale it goes back on the shelf as
// an ordinary inventory row, and the story of what happened to it is scattered:
// the reversal lives on the sale, the remark lives in the product audit log,
// the units live in the stock tables. Reviewing one revised record meant
// opening Inventory, Sales History and the audit trail in turn.
//
// A preview is that story assembled once, read-only: what the product is now,
// which sale it came back out of, for how much, who did it and why, and which
// revisions have been recorded against it since. Nothing here writes.
//
// The assembly is kept pure so it can be tested without a database — the
// service layer does the fetching and hands the documents straight in.

import { lineContribution } from "../sales/saleRetrieval.service.js";

function personName(ref) {
  if (!ref || typeof ref !== "object") return "";
  return ref.fullName || ref.username || ref.name || "";
}

function idOf(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

/**
 * One retrieved sale line, flattened into the row the preview shows.
 *
 * The financial figures come from `lineContribution`, the same function the
 * reversal itself used, so the preview can never quote a different amount from
 * the one that actually came off revenue.
 */
export function summariseRetrievedLine(sale, item) {
  const { net, gross } = lineContribution(item);
  const items = sale.items || [];
  return {
    sale_id: idOf(sale._id),
    sale_no: sale.saleNo || "",
    job_number: sale.jobNumber || "",
    store_id: idOf(sale.store),
    store_name: (sale.store && sale.store.name) || "",
    sale_status: sale.status || "completed",
    fully_retrieved: items.length > 0 && items.every((line) => Boolean(line.retrievedAt)),
    sold_at: sale.transactionDate || sale.createdAt || null,
    customer_name: personName(sale.customer) || "Walk-in",
    salesperson_name: sale.salespersonName || personName(sale.employee) || "",
    quantity: Number(item.quantity || 0),
    gross_amount: gross,
    net_amount: net,
    retrieved_at: item.retrievedAt || null,
    retrieved_by: personName(item.retrievedBy) || "System",
    retrieval_reason: item.retrievalReason || "",
  };
}

/**
 * Every line of `sale` that returned this product to stock. A product can be
 * sold, retrieved and sold again on the same bill in principle, so this is a
 * list rather than a single match.
 */
export function retrievedLinesFor(sale, productId) {
  return (sale.items || [])
    .filter((item) => idOf(item.product) === String(productId) && item.retrievedAt)
    .map((item) => summariseRetrievedLine(sale, item));
}

/**
 * Assemble the preview.
 *
 * @param {object}   input
 * @param {object}   input.product   Mapped product row (the same shape `mapProduct` returns).
 * @param {object[]} input.sales     Sale documents that carry a retrieved line for this product.
 * @param {object[]} input.revisions `getProductHistory` rows, newest first.
 * @param {object}   input.stock     `{ rows, total_stock }` from `getProductStockByStore`.
 */
export function buildProductPreview({ product, sales = [], revisions = [], stock = null }) {
  const retrievals = sales
    .flatMap((sale) => retrievedLinesFor(sale, product.id))
    .sort((a, b) => new Date(b.retrieved_at || 0) - new Date(a.retrieved_at || 0));

  return {
    product,
    stock: stock || { rows: [], total_stock: 0 },
    // `retrieved` is what the UI keys the "Retrieved" wording off. A product
    // that was only ever price-edited is still previewable — it just has no
    // sale to show — so this is not a precondition for the preview existing.
    retrieved: retrievals.length > 0,
    retrievals,
    retrieved_total: money(retrievals.reduce((sum, row) => sum + row.net_amount, 0)),
    retrieved_quantity: retrievals.reduce((sum, row) => sum + row.quantity, 0),
    last_retrieved_at: retrievals[0]?.retrieved_at || null,
    revisions,
    latest_revision: revisions[0] || null,
  };
}
