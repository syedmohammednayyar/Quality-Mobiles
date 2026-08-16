import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";
import {
  ACTIVE_SERIALIZED_STATUSES,
  SELLABLE_PRODUCT_STATUSES,
  STOCK_STATUS,
  activeBulkByCategoryPipeline,
  activeBulkQuantityPipeline,
  activeBulkStages,
  activeSerializedMatch,
  classifyStockStatus,
  isActiveSerializedStatus,
  isLowStock,
  lowStockCountPipeline,
  outOfStockCountPipeline,
  storeScope,
} from "./activeStock.js";

const STORE_1 = "aaaaaaaaaaaaaaaaaaaaaaa1";
const STORE_2 = "aaaaaaaaaaaaaaaaaaaaaaa2";

/** Find the $match stage that carries a given key, at any depth of the pipeline. */
const matchStages = (pipeline) => pipeline.filter((stage) => stage.$match).map((stage) => stage.$match);
const mergedMatch = (pipeline) => Object.assign({}, ...matchStages(pipeline));

describe("activeStock — the shared definition of active inventory", () => {
  describe("serialized devices (SerializedInventory.status is authoritative)", () => {
    it("treats only in_stock as active", () => {
      assert.deepEqual(ACTIVE_SERIALIZED_STATUSES, ["in_stock"]);
      assert.equal(isActiveSerializedStatus("in_stock"), true);
    });

    // TEST 1 — a sold serialized device must leave active inventory.
    it("excludes sold, and every other non-sellable device state", () => {
      ["sold", "transferred", "reserved", "buyback_hold", "under_repair"].forEach((status) => {
        assert.equal(isActiveSerializedStatus(status), false, `${status} must not count as available`);
      });
    });

    it("excludes missing or malformed statuses rather than defaulting to available", () => {
      [undefined, null, "", "SOLD", "in stock"].forEach((status) => {
        assert.equal(isActiveSerializedStatus(status), false);
      });
    });

    it("filters by status inside the query, not after fetching", () => {
      const match = activeSerializedMatch(STORE_1);
      assert.deepEqual(match.status, { $in: ["in_stock"] });
    });
  });

  describe("stock level classification", () => {
    // TEST 2 — quantity falls to zero after the last unit sells.
    it("calls a zero-quantity row out of stock, never low stock", () => {
      assert.equal(classifyStockStatus(0, 0), STOCK_STATUS.OUT_OF_STOCK);
      assert.equal(isLowStock(0, 0), false);
    });

    it("is the regression guard for the reported defect: 0 <= 0 is not low stock", () => {
      // Seven sold rows with quantity 0 and the default minStockLevel 0 were
      // reported as six low-stock products plus one available unit.
      const soldRows = Array.from({ length: 7 }, () => ({ quantity: 0, minStockLevel: 0 }));
      const low = soldRows.filter((row) => isLowStock(row.quantity, row.minStockLevel));
      assert.equal(low.length, 0);
    });

    it("treats a negative quantity as out of stock", () => {
      assert.equal(classifyStockStatus(-3, 2), STOCK_STATUS.OUT_OF_STOCK);
      assert.equal(isLowStock(-3, 2), false);
    });

    // TEST 3 — comfortably stocked.
    it("quantity 5 against a threshold of 2 is in stock, not low", () => {
      assert.equal(classifyStockStatus(5, 2), STOCK_STATUS.IN_STOCK);
      assert.equal(isLowStock(5, 2), false);
    });

    // TEST 4 — at the threshold.
    it("quantity 2 against a threshold of 2 is low stock", () => {
      assert.equal(classifyStockStatus(2, 2), STOCK_STATUS.LOW_STOCK);
      assert.equal(isLowStock(2, 2), true);
    });

    it("below the threshold is low stock", () => {
      assert.equal(classifyStockStatus(1, 3), STOCK_STATUS.LOW_STOCK);
    });

    it("stocked rows with no threshold configured are in stock", () => {
      assert.equal(classifyStockStatus(4, 0), STOCK_STATUS.IN_STOCK);
      assert.equal(isLowStock(4, 0), false);
    });

    it("tolerates string and nullish inputs from lean documents", () => {
      assert.equal(classifyStockStatus("2", "2"), STOCK_STATUS.LOW_STOCK);
      assert.equal(classifyStockStatus(undefined, undefined), STOCK_STATUS.OUT_OF_STOCK);
      assert.equal(classifyStockStatus(null, 5), STOCK_STATUS.OUT_OF_STOCK);
    });
  });

  describe("active bulk stock", () => {
    it("requires quantity above zero at the database", () => {
      assert.deepEqual(mergedMatch(activeBulkStages(STORE_1)).quantity, { $gt: 0 });
    });

    // TEST 6 — Product.inventoryStatus = sold while BulkInventory.quantity = 1.
    it("drops rows whose product is already sold", () => {
      const match = mergedMatch(activeBulkStages(STORE_1));
      assert.deepEqual(match["productDoc.inventoryStatus"], { $in: SELLABLE_PRODUCT_STATUSES });
      assert.ok(!SELLABLE_PRODUCT_STATUSES.includes("sold"));
    });

    it("drops rows whose product has been deactivated", () => {
      assert.equal(mergedMatch(activeBulkStages(STORE_1))["productDoc.isActive"], true);
    });

    // Duplicate inventory protection.
    it("drops bulk rows on serialized products so a device is counted once", () => {
      assert.deepEqual(mergedMatch(activeBulkStages(STORE_1))["productDoc.inventoryMode"], { $ne: "serialized" });
    });

    it("joins the product database-side rather than fetching the collection", () => {
      const stages = activeBulkStages(STORE_1);
      const lookup = stages.find((stage) => stage.$lookup);
      assert.equal(lookup.$lookup.from, "products");
      // The quantity filter must come first, so the join only runs over rows
      // that still hold units rather than over the whole collection.
      assert.ok(stages.indexOf(lookup) > stages.findIndex((stage) => stage.$match));
      // Classic $lookup form only — localField/foreignField plus an inline
      // pipeline would require MongoDB 5.0+.
      assert.equal(lookup.$lookup.pipeline, undefined);
    });

    it("sums quantity rather than counting rows", () => {
      const group = activeBulkQuantityPipeline(STORE_1).at(-1).$group;
      assert.deepEqual(group.quantity, { $sum: "$quantity" });
    });

    it("groups by category for the Inventory Status panel from the same active set", () => {
      const pipeline = activeBulkByCategoryPipeline(STORE_1);
      assert.deepEqual(mergedMatch(pipeline).quantity, { $gt: 0 });
      assert.equal(pipeline.at(-1).$group._id, "$productDoc.category");
    });
  });

  describe("low stock and out of stock are distinct populations", () => {
    it("low stock inherits every active-stock exclusion", () => {
      const match = mergedMatch(lowStockCountPipeline(STORE_1));
      assert.deepEqual(match.quantity, { $gt: 0 });
      assert.deepEqual(match["productDoc.inventoryStatus"], { $in: SELLABLE_PRODUCT_STATUSES });
      assert.equal(match["productDoc.isActive"], true);
    });

    it("low stock requires a configured threshold, so a default of 0 can never qualify", () => {
      const match = mergedMatch(lowStockCountPipeline(STORE_1));
      assert.deepEqual(match.minStockLevel, { $gt: 0 });
      assert.deepEqual(match.$expr, { $lte: ["$quantity", "$minStockLevel"] });
    });

    it("out of stock looks at empty rows only, and still excludes sold products", () => {
      const match = mergedMatch(outOfStockCountPipeline(STORE_1));
      assert.deepEqual(match.quantity, { $lte: 0 });
      assert.deepEqual(match["productDoc.inventoryStatus"], { $in: SELLABLE_PRODUCT_STATUSES });
    });

    it("the two populations cannot overlap", () => {
      const low = mergedMatch(lowStockCountPipeline(STORE_1)).quantity;
      const out = mergedMatch(outOfStockCountPipeline(STORE_1)).quantity;
      assert.deepEqual(low, { $gt: 0 });
      assert.deepEqual(out, { $lte: 0 });
    });
  });

  // TEST 7 — store scoping.
  describe("store scoping", () => {
    it("pins every pipeline to the requested store", () => {
      const expected = new mongoose.Types.ObjectId(STORE_1);
      [
        activeBulkQuantityPipeline(STORE_1),
        lowStockCountPipeline(STORE_1),
        outOfStockCountPipeline(STORE_1),
        activeBulkByCategoryPipeline(STORE_1),
      ].forEach((pipeline) => {
        assert.ok(mergedMatch(pipeline).store.equals(expected));
      });
      assert.ok(activeSerializedMatch(STORE_1).store.equals(expected));
    });

    it("keeps one store's scope out of another's", () => {
      const one = storeScope(STORE_1).store;
      const two = storeScope(STORE_2).store;
      assert.ok(!one.equals(two));
    });

    it("spans every store for the consolidated view without inventing a store id", () => {
      // "ALL" is resolved to null by the controller; it must never reach a query.
      [null, undefined, ""].forEach((value) => {
        // No store key at all — an absent filter spans every store, rather
        // than a filter matching a fabricated id that would match nothing.
        assert.deepEqual(storeScope(value), {});
        assert.equal("store" in activeSerializedMatch(value), false);
        assert.deepEqual(activeSerializedMatch(value), { status: { $in: ["in_stock"] } });
      });
    });

    it("aggregates across stores without double counting, because the row is the unit", () => {
      // Each BulkInventory row is unique per (store, product) and each
      // SerializedInventory doc is one device, so summing across stores adds
      // each physical unit exactly once.
      const allStores = activeBulkQuantityPipeline(null);
      assert.equal(mergedMatch(allStores).store, undefined);
      assert.deepEqual(allStores.at(-1).$group.quantity, { $sum: "$quantity" });
    });
  });
});
