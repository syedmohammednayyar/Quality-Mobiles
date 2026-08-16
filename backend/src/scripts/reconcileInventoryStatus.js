/**
 * Reconcile stock rows that disagree with the device/product state.
 *
 * The dashboard now ignores rows whose product is already sold, so the KPIs
 * are correct with or without this script. This repairs the underlying data so
 * every model tells the same story — the inventory screen, POS availability
 * checks and any future reader included.
 *
 * What it changes, and nothing else:
 *   1. BulkInventory.quantity  → 0  where Product.inventoryStatus === "sold"
 *   2. StoreInventory item qty → 0  where Product.inventoryStatus === "sold"
 *   3. BulkInventory.quantity  → 0  for serialized products that hold no
 *                                   in_stock device (a stray bulk row would
 *                                   double-count a device that is gone)
 *
 * It never deletes a record, never touches Sales, StockLedger, audit history,
 * prices or any historical document. Sold products keep their rows — only the
 * quantity that falsely claims they are on hand is cleared, and every change
 * is written to the StockLedger as an auditable adjustment.
 *
 * Usage:
 *   node src/scripts/reconcileInventoryStatus.js --dry-run   (report only)
 *   node src/scripts/reconcileInventoryStatus.js             (apply)
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db/mongodb.js";
import { BulkInventory, Product, SerializedInventory, StockLedger, StoreInventory } from "../db/models.js";

const DRY_RUN = process.argv.includes("--dry-run");

function log(...args) {
  console.log(...args);
}

async function ledgerAdjustment(storeId, productId, quantity, note) {
  if (quantity <= 0) return;
  await StockLedger.create({
    store: storeId,
    product: productId,
    movementType: "adjustment",
    quantity,
    referenceType: "reconciliation",
    referenceId: productId,
    reason: "inventory_reconciliation",
    note,
  });
}

async function run() {
  await connectDB();
  log(`Inventory reconciliation${DRY_RUN ? " (dry run — nothing will be written)" : ""}`);

  const soldProducts = await Product.find({ inventoryStatus: "sold" }).select("_id name sku").lean();
  const soldIds = soldProducts.map((p) => p._id);
  const nameOf = new Map(soldProducts.map((p) => [String(p._id), p.name || p.sku || String(p._id)]));
  log(`\nProducts marked sold: ${soldIds.length}`);

  // ── 1. Bulk rows still holding stock for a sold product ────────────────────
  const staleBulk = await BulkInventory.find({ product: { $in: soldIds }, quantity: { $gt: 0 } }).lean();
  log(`Stale BulkInventory rows (sold product, quantity > 0): ${staleBulk.length}`);
  for (const row of staleBulk) {
    log(`  - ${nameOf.get(String(row.product))}: store ${row.store} quantity ${row.quantity} → 0`);
    if (DRY_RUN) continue;
    await BulkInventory.updateOne({ _id: row._id }, { $set: { quantity: 0, updatedAt: new Date() } });
    await ledgerAdjustment(row.store, row.product, row.quantity, "Reconciliation: product already sold, bulk quantity cleared");
  }

  // ── 2. Legacy items[] still holding stock for a sold product ───────────────
  const legacyDocs = await StoreInventory.find({ "items.product": { $in: soldIds } }).lean();
  let legacyFixed = 0;
  for (const doc of legacyDocs) {
    for (const item of doc.items || []) {
      if (!soldIds.some((id) => String(id) === String(item.product))) continue;
      if (Number(item.quantity || 0) <= 0) continue;
      legacyFixed += 1;
      log(`  - ${nameOf.get(String(item.product))}: legacy store ${doc.store} quantity ${item.quantity} → 0`);
      if (DRY_RUN) continue;
      await StoreInventory.updateOne(
        { _id: doc._id, "items.product": item.product },
        { $set: { "items.$.quantity": 0, updatedAt: new Date() } },
      );
      await ledgerAdjustment(doc.store, item.product, item.quantity, "Reconciliation: product already sold, legacy quantity cleared");
    }
  }
  log(`Stale legacy StoreInventory items (sold product, quantity > 0): ${legacyFixed}`);

  // ── 3. Serialized products carrying a bulk row with no device in stock ─────
  const serializedProducts = await Product.find({ inventoryMode: "serialized" }).select("_id name sku").lean();
  const serializedIds = serializedProducts.map((p) => p._id);
  const serializedNames = new Map(serializedProducts.map((p) => [String(p._id), p.name || p.sku || String(p._id)]));
  const strayBulk = await BulkInventory.find({ product: { $in: serializedIds }, quantity: { $gt: 0 } }).lean();
  let strayFixed = 0;
  for (const row of strayBulk) {
    const inStock = await SerializedInventory.countDocuments({
      store: row.store,
      product: row.product,
      status: "in_stock",
    });
    if (inStock > 0) continue; // A real device is present; the bulk row is redundant but harmless.
    strayFixed += 1;
    log(`  - ${serializedNames.get(String(row.product))}: serialized product with no in_stock device, bulk quantity ${row.quantity} → 0`);
    if (DRY_RUN) continue;
    await BulkInventory.updateOne({ _id: row._id }, { $set: { quantity: 0, updatedAt: new Date() } });
    await ledgerAdjustment(row.store, row.product, row.quantity, "Reconciliation: serialized product has no device in stock, bulk quantity cleared");
  }
  log(`Stray bulk rows on serialized products with no device in stock: ${strayFixed}`);

  const total = staleBulk.length + legacyFixed + strayFixed;
  log(`\n${DRY_RUN ? "Would correct" : "Corrected"} ${total} row(s). No records were deleted.`);

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error("Reconciliation failed:", error);
  await mongoose.connection.close().catch(() => {});
  process.exitCode = 1;
});
