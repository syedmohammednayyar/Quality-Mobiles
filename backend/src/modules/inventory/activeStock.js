/**
 * The single definition of "active inventory" for the whole system.
 *
 * Three models describe stock — SerializedInventory (one doc per device),
 * BulkInventory (one doc per store/product) and the legacy StoreInventory
 * items[] array — and each module used to decide for itself what counted as
 * available. That is how the dashboard came to report stock that the
 * inventory screen showed as sold. Every reader now derives its numbers from
 * the rules below so the modules cannot disagree.
 *
 * The rules, stated once:
 *
 *   SERIALIZED (authoritative per device: SerializedInventory.status)
 *     active   → status === "in_stock"
 *     inactive → sold / transferred / reserved / buyback_hold / under_repair
 *
 *   BULK (authoritative per store+product: BulkInventory.quantity)
 *     active   → quantity > 0 AND the product is still sellable
 *     inactive → quantity <= 0, or the product is sold/inactive
 *
 *   STOCK LEVEL (bulk only — a serialized device is one unit, never "low")
 *     out_of_stock → quantity <= 0
 *     low_stock    → quantity > 0 AND quantity <= minStockLevel
 *     in_stock     → quantity > minStockLevel
 *
 * The stock-level rule is the one the inventory screen has always applied via
 * buildStatus(); the dashboard's own `quantity <= minStockLevel` test was the
 * divergence, because minStockLevel defaults to 0 and made every sold-out row
 * (0 <= 0) report as low stock.
 */

import mongoose from "mongoose";

export const STOCK_STATUS = {
  OUT_OF_STOCK: "out_of_stock",
  LOW_STOCK: "low_stock",
  IN_STOCK: "in_stock",
};

/** SerializedInventory states that represent a device available to sell. */
export const ACTIVE_SERIALIZED_STATUSES = ["in_stock"];

/**
 * Product.inventoryStatus values that mean the product may still be stocked.
 * "sold" is excluded; "under_repair" is held stock that is not sellable but is
 * still owned, and is reported through its own KPI rather than as available.
 */
export const SELLABLE_PRODUCT_STATUSES = ["ready"];

export function isActiveSerializedStatus(status) {
  return ACTIVE_SERIALIZED_STATUSES.includes(String(status || ""));
}

/**
 * Classify a bulk stock row. Order matters: an empty row is out of stock, not
 * low stock, whatever the threshold says.
 */
export function classifyStockStatus(quantity, minStockLevel) {
  const qty = Number(quantity || 0);
  const min = Number(minStockLevel || 0);
  if (qty <= 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (qty <= min) return STOCK_STATUS.LOW_STOCK;
  return STOCK_STATUS.IN_STOCK;
}

export const isActiveBulkQuantity = (quantity) => Number(quantity || 0) > 0;
export const isLowStock = (quantity, minStockLevel) =>
  classifyStockStatus(quantity, minStockLevel) === STOCK_STATUS.LOW_STOCK;

const oid = (value) => new mongoose.Types.ObjectId(value);

/**
 * Store scope. `null`/undefined means "All Stores" — an empty match spanning
 * every store the caller was already authorised for by the controller. "ALL"
 * is a UI sentinel and is never passed here as a value.
 */
export const storeScope = (storeId) => (storeId ? { store: oid(storeId) } : {});

/** Match stage for devices currently available to sell in scope. */
export const activeSerializedMatch = (storeId) => ({
  ...storeScope(storeId),
  status: { $in: ACTIVE_SERIALIZED_STATUSES },
});

/**
 * Join BulkInventory rows to their product and keep only rows that represent
 * real, sellable stock. Runs database-side so no collection is pulled into
 * memory to be counted.
 *
 * Three exclusions, each closing a way sold stock used to leak through:
 *   1. quantity <= 0        — the row is empty (the usual sold case).
 *   2. product sold/inactive — the row is stale: the product was marked sold
 *      without its quantity being cleared, so the quantity cannot be trusted.
 *   3. product is serialized — SerializedInventory is authoritative for those
 *      devices, and counting a stray bulk row too would double-count one
 *      physical device.
 */
export function activeBulkStages(storeId) {
  return [
    // Narrow on the indexed { store, product } row first, so the join only
    // ever runs over rows that still hold units.
    { $match: { ...storeScope(storeId), quantity: { $gt: 0 } } },
    // Classic $lookup form: localField/foreignField combined with an inline
    // pipeline needs MongoDB 5.0+, and this must run wherever the app is
    // deployed. It is also the form used elsewhere in this codebase.
    { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productDoc" } },
    { $unwind: "$productDoc" },
    {
      $match: {
        "productDoc.isActive": true,
        "productDoc.inventoryStatus": { $in: SELLABLE_PRODUCT_STATUSES },
        "productDoc.inventoryMode": { $ne: "serialized" },
      },
    },
  ];
}

/** Total units of active bulk stock in scope. */
export const activeBulkQuantityPipeline = (storeId) => [
  ...activeBulkStages(storeId),
  { $group: { _id: null, quantity: { $sum: "$quantity" }, rows: { $sum: 1 } } },
];

/** Active bulk rows split by product category, for the Inventory Status panel. */
export const activeBulkByCategoryPipeline = (storeId) => [
  ...activeBulkStages(storeId),
  { $group: { _id: "$productDoc.category", quantity: { $sum: "$quantity" } } },
];

/**
 * Genuinely low stock: still has units, but at or below its threshold. Rows
 * with no threshold configured (minStockLevel 0) can never qualify, which is
 * what keeps sold-out rows out of the count.
 */
export const lowStockStages = (storeId) => [
  ...activeBulkStages(storeId),
  { $match: { minStockLevel: { $gt: 0 }, $expr: { $lte: ["$quantity", "$minStockLevel"] } } },
];

export const lowStockCountPipeline = (storeId) => [
  ...lowStockStages(storeId),
  { $count: "count" },
];

/**
 * Out of stock, reported separately from low stock. Restricted to products
 * that are still sellable, so a sold one-off device is not resurrected here as
 * a restocking alert.
 */
export const outOfStockCountPipeline = (storeId) => [
  { $match: { ...storeScope(storeId), quantity: { $lte: 0 } } },
  { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productDoc" } },
  { $unwind: "$productDoc" },
  {
    $match: {
      "productDoc.isActive": true,
      "productDoc.inventoryStatus": { $in: SELLABLE_PRODUCT_STATUSES },
      "productDoc.inventoryMode": { $ne: "serialized" },
    },
  },
  { $count: "count" },
];
