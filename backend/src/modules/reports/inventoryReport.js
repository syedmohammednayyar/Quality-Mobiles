/**
 * The reporting view of stock on hand.
 *
 * Stock lives in three models and a store may hold all of its inventory in any
 * one of them: a document per device (SerializedInventory), a document per
 * store+product (BulkInventory), and the legacy StoreInventory items array.
 * The reports module used to read only the serialized model, so a store whose
 * products were all added in bulk mode — which is every product added from the
 * inventory screen — reported "No inventory records found" while its inventory
 * screen listed the full stock and its value.
 *
 * Which rows count, and what a unit is worth, come from the shared rules in
 * activeStock.js, so this report and the inventory screen cannot disagree.
 */

import {
  classifyStockStatus, isAvailableBulkRow, isListableBulkRow, isLowStock, sellableUnitPrice,
} from "../inventory/activeStock.js";

const money = (value) => Number(value || 0);
const id    = (value) => String(value?._id || value || "");
const name  = (value, fallback = "") => value?.name || value?.fullName || value?.username || fallback;

/** One serialized device: always a single unit, with its own device status. */
const serializedRow = (x) => ({
  id: id(x), jobNumber: x.jobNumber || x.product?.jobId || "",
  brand: x.product?.brand || "", model: x.product?.model || x.product?.name || "",
  imei: x.imei || x.product?.imei || "", store: name(x.store), quantity: 1,
  purchasePrice: money(x.product?.purchasePrice), sellingPrice: money(x.product?.unitPrice),
  status: x.status, transferStatus: x.status === "transferred" ? "Transferred" : "-",
});

/**
 * One store+product holding. Bulk stock has no per-device status, so the row
 * reports its stock level by the shared rule — an empty row is out of stock,
 * never low stock — and carries its unit count.
 */
const bulkRow = (x) => ({
  id: id(x), jobNumber: x.product?.jobId || x.product?.jobNumber || "",
  brand: x.product?.brand || "", model: x.product?.model || x.product?.name || "",
  imei: x.product?.imei || "", store: name(x.store), quantity: money(x.quantity),
  purchasePrice: money(x.product?.purchasePrice), sellingPrice: money(x.product?.unitPrice),
  status: classifyStockStatus(x.quantity, x.minStockLevel), transferStatus: "-",
});

/**
 * Flatten the whole stock picture for a scope that has already been filtered
 * by store. Returns the report rows, the stock movements the bulk models can
 * account for, and the KPIs, plus a per-store valuation for the store
 * comparison table.
 */
export function buildStockView({ serialized = [], bulk = [], legacyInventory = [] } = {}) {
  const listableBulk  = bulk.filter(isListableBulkRow);
  const availableBulk = bulk.filter(isAvailableBulkRow);

  // A serialized device whose product has been deactivated (soft-deleted) is
  // dropped by the inventory screen — it lists and values only active products
  // (Product.find({ isActive: true })). Guarding here the same way the bulk
  // path already does (isListableBulkRow rejects an inactive product) is what
  // stops a store from reporting an Inventory Value while its inventory screen
  // shows no products and Rs 0: an in-stock device left behind by a removed
  // product. A product hard-deleted out from under its device leaves x.product
  // null, and is dropped for the same reason.
  const listableSerialized = serialized.filter((x) => x.product && x.product.isActive !== false);

  // The legacy array is a per-store last resort, used only where neither newer
  // model holds anything for that store — the same fallback the inventory
  // screen applies. Without the per-store test, a store that has since moved
  // to BulkInventory would have every holding listed twice.
  const modelledStores = new Set([...listableSerialized, ...listableBulk].map((x) => id(x.store)));
  const legacyRows = legacyInventory.flatMap((doc) => (modelledStores.has(id(doc.store))
    ? []
    : (doc.items || []).filter((item) => item.product).map((item) => ({ ...item, store: doc.store }))));
  const listableLegacy  = legacyRows.filter(isListableBulkRow);
  const availableLegacy = legacyRows.filter(isAvailableBulkRow);

  // A unit is valued the way the inventory screen values it: list price less
  // any standing discount.
  const serializedValue = (rows) => rows.filter((x) => x.status === "in_stock")
    .reduce((sum, x) => sum + sellableUnitPrice(x.product), 0);
  const bulkValue = (rows) => rows.reduce((sum, x) => sum + money(x.quantity) * sellableUnitPrice(x.product), 0);
  const inStore   = (rows, storeId) => rows.filter((x) => id(x.store) === storeId);

  return {
    rows: [
      ...listableSerialized.map(serializedRow),
      ...listableBulk.map(bulkRow),
      ...listableLegacy.map(bulkRow),
    ].sort((a, b) => a.store.localeCompare(b.store) || a.model.localeCompare(b.model)),

    // Bulk-mode products are stocked into a store too, and were missing from
    // movement history for the same reason they were missing from the
    // inventory report.
    additions: listableBulk.map((x) => ({
      id: `stocked-${id(x)}`, jobNumber: x.product?.jobId || x.product?.jobNumber || "",
      imei: x.product?.imei || "", product: x.product?.name || "", event: "Product Added",
      store: name(x.store), date: x.createdAt, by: name(x.addedBy),
      currentStatus: classifyStockStatus(x.quantity, x.minStockLevel),
    })),

    inventoryValue: serializedValue(listableSerialized) + bulkValue(availableBulk) + bulkValue(availableLegacy),

    // Genuinely low: still has units, at or below its threshold. Serialized
    // devices are one unit each and are never "low".
    lowStockProducts: [...availableBulk, ...availableLegacy]
      .filter((x) => isLowStock(x.quantity, x.minStockLevel)).length,

    valueForStore: (storeId) => serializedValue(inStore(listableSerialized, storeId))
      + bulkValue(inStore(availableBulk, storeId))
      + bulkValue(inStore(availableLegacy, storeId)),
  };
}
