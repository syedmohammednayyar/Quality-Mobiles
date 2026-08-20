import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStockView } from "./inventoryReport.js";

const STORE_3 = { _id: "store3", name: "Store 3" };
const STORE_1 = { _id: "store1", name: "Store 1" };

const product = (over = {}) => ({
  _id: over._id || "p1", name: "Galaxy A16", brand: "Samsung", model: "A16",
  jobId: "QM-2026-0001", imei: "350000000000001",
  purchasePrice: 8000, unitPrice: 10000, discount: 0,
  isActive: true, inventoryStatus: "ready", inventoryMode: "bulk", ...over,
});

const bulkDoc = ({ product: productOver, ...over } = {}) => ({
  _id: "b1", store: STORE_3, quantity: 1, minStockLevel: 0,
  createdAt: new Date("2026-08-01"), ...over, product: product(productOver),
});

describe("reports inventory — every model that can hold stock is reported", () => {
  // TEST 1 — the reported defect: a store whose products were all added from
  // the inventory screen (which always writes bulk mode) showed
  // "No inventory records found" because only SerializedInventory was read.
  it("lists bulk-mode stock, which the serialized-only report dropped entirely", () => {
    const bulk = Array.from({ length: 80 }, (_, i) => bulkDoc({
      _id: `b${i}`,
      product: { _id: `p${i}`, unitPrice: 10037.5, jobId: `QM-2026-${i}` },
    }));

    const stock = buildStockView({ serialized: [], bulk, legacyInventory: [] });

    assert.equal(stock.rows.length, 80, "all 80 store products must be reported");
    assert.equal(Math.round(stock.inventoryValue), 803000);
    assert.equal(stock.valueForStore("store3"), stock.inventoryValue);
    assert.equal(stock.rows.every((row) => row.store === "Store 3"), true);
  });

  // TEST 2 — the report and the inventory screen must value a unit the same
  // way: list price less any standing discount.
  it("values a unit at its discounted price, as the inventory screen does", () => {
    const stock = buildStockView({
      bulk: [bulkDoc({ quantity: 3, product: { unitPrice: 10000, discount: 1500 } })],
    });
    assert.equal(stock.inventoryValue, 3 * 8500);
  });

  // TEST 3 — serialized devices keep their existing per-device behaviour, and
  // sold ones stop counting towards value while remaining in the listing.
  it("keeps serialized devices per-device, and drops sold ones from value", () => {
    const stock = buildStockView({
      serialized: [
        { _id: "s1", store: STORE_1, status: "in_stock", imei: "111", jobNumber: "QM-1", product: product({ inventoryMode: "serialized" }) },
        { _id: "s2", store: STORE_1, status: "sold", imei: "222", jobNumber: "QM-2", product: product({ inventoryMode: "serialized" }) },
      ],
    });
    assert.equal(stock.rows.length, 2, "a sold device is still history the report shows");
    assert.equal(stock.inventoryValue, 10000, "only the in-stock device is worth anything");
    assert.deepEqual(stock.rows.map((row) => row.quantity), [1, 1]);
  });

  // TEST 4 — one physical device must never be counted twice. A stray bulk row
  // against a serialized product is ignored; SerializedInventory is
  // authoritative for those.
  it("does not double-count a serialized product that also has a bulk row", () => {
    const serializedProduct = product({ _id: "ps", inventoryMode: "serialized" });
    const stock = buildStockView({
      serialized: [{ _id: "s1", store: STORE_3, status: "in_stock", imei: "111", product: serializedProduct }],
      bulk: [bulkDoc({ _id: "b1", product: { _id: "ps", inventoryMode: "serialized" } })],
    });
    assert.equal(stock.rows.length, 1);
    assert.equal(stock.inventoryValue, 10000);
  });

  // TEST 5 — the legacy items array is a last resort per store, never an
  // addition to a store already described by a newer model.
  it("falls back to legacy stock only for a store with no other stock model", () => {
    const legacy = [
      { _id: "l1", store: STORE_3, items: [{ _id: "i1", product: product({ _id: "pl" }), quantity: 2, minStockLevel: 0 }] },
      { _id: "l2", store: STORE_1, items: [{ _id: "i2", product: product({ _id: "pl2" }), quantity: 5, minStockLevel: 0 }] },
    ];
    const stock = buildStockView({ bulk: [bulkDoc()], legacyInventory: legacy });

    assert.equal(stock.rows.length, 2, "Store 3's legacy copy is superseded by its bulk row");
    assert.equal(stock.valueForStore("store3"), 10000);
    assert.equal(stock.valueForStore("store1"), 5 * 10000, "Store 1 has only its legacy array");
  });

  // TEST 6 — the shared stock-level rule: an empty row is out of stock, never
  // low stock, whatever the threshold says.
  it("reports stock level by the shared rule and counts only genuine low stock", () => {
    const stock = buildStockView({
      bulk: [
        bulkDoc({ _id: "b1", quantity: 0, minStockLevel: 0, product: { _id: "p1" } }),
        bulkDoc({ _id: "b2", quantity: 2, minStockLevel: 5, product: { _id: "p2" } }),
        bulkDoc({ _id: "b3", quantity: 9, minStockLevel: 5, product: { _id: "p3" } }),
      ],
    });
    assert.deepEqual(stock.rows.map((row) => row.status), ["out_of_stock", "low_stock", "in_stock"]);
    assert.equal(stock.lowStockProducts, 1);
    assert.equal(stock.inventoryValue, (2 + 9) * 10000, "the empty row holds no value");
  });

  // TEST 7 — bulk products are stocked into a store like any other, so they
  // belong in movement history too.
  it("reports bulk stock arrivals as product movements", () => {
    const stock = buildStockView({ bulk: [bulkDoc({ addedBy: { _id: "u1", name: "Asha" } })] });
    assert.equal(stock.additions.length, 1);
    assert.equal(stock.additions[0].event, "Product Added");
    assert.equal(stock.additions[0].store, "Store 3");
    assert.equal(stock.additions[0].by, "Asha");
  });

  // TEST 8 — a deleted product leaves nothing to report against.
  it("ignores rows whose product is no longer active", () => {
    const stock = buildStockView({ bulk: [bulkDoc({ product: { isActive: false } })] });
    assert.deepEqual(stock.rows, []);
    assert.equal(stock.inventoryValue, 0);
  });

  // TEST 9 — the reported defect: an in-stock serialized device left behind by
  // a soft-deleted product must not be valued, because the inventory screen —
  // which lists only active products — shows the store as empty. Reports and
  // the inventory screen must agree that such a store holds Rs 0.
  it("drops serialized devices whose product has been deactivated", () => {
    const stock = buildStockView({
      serialized: [{
        _id: "s1", store: STORE_1, status: "in_stock", imei: "999", jobNumber: "QM-9",
        product: product({ inventoryMode: "serialized", isActive: false, unitPrice: 200480 }),
      }],
    });
    assert.deepEqual(stock.rows, [], "an inactive product's device is not listed");
    assert.equal(stock.inventoryValue, 0, "and holds no value the inventory screen cannot see");
    assert.equal(stock.valueForStore("store1"), 0);
  });
});
