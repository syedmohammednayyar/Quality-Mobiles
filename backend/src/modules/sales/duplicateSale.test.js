import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUnitTracked } from "./sales.service.js";
import { REVENUE_SALE_STATUSES } from "./saleStatus.js";

// The duplicate-sale guard only fires for products that are one physical
// device. Getting that classification wrong in either direction is costly:
// too narrow and a phone can be sold twice, too broad and a shop cannot sell
// its second phone case.
describe("duplicate sale guard — which products are one physical device", () => {
  it("treats a serialized product as one device", () => {
    assert.equal(isUnitTracked({ inventoryMode: "serialized", category: "accessory" }), true);
  });

  // TEST 1 — the reported bug's shape: phones added through the Inventory
  // form keep inventoryMode "bulk", so mode alone would have missed them.
  it("treats a phone as one device even when its stock is tracked as bulk", () => {
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "new_phone" }), true);
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "used_phone" }), true);
  });

  it("treats anything carrying an IMEI or serial number as one device", () => {
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "accessory", imei: "356938035643809" }), true);
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "accessory", serialNumber: "SN-1123" }), true);
  });

  // TEST 2 — the guard must not block legitimate repeat sales of stock items.
  it("leaves countable stock alone, so accessories still sell repeatedly", () => {
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "accessory" }), false);
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "repair_part" }), false);
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "service" }), false);
  });

  // Every product gets an auto-generated jobId, accessories included, so a job
  // number on its own cannot be what marks something as a single device.
  it("does not treat a job number alone as proof of a single device", () => {
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "accessory", jobId: "JOB-00042" }), false);
  });

  it("ignores blank identity fields rather than reading them as present", () => {
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "accessory", imei: "", serialNumber: "" }), false);
    assert.equal(isUnitTracked({ inventoryMode: "bulk", category: "accessory", imei: undefined }), false);
  });

  it("does not fall over on a product with nothing set", () => {
    assert.equal(isUnitTracked({}), false);
  });
});

describe("duplicate sale guard — which prior sales still block a re-sale", () => {
  // A retrieval is the approved way back: it stamps the old line retrieved, so
  // the device becomes sellable again. Anything still live must block.
  it("blocks against completed and partially retrieved sales", () => {
    assert.equal(REVENUE_SALE_STATUSES.includes("completed"), true);
    assert.equal(REVENUE_SALE_STATUSES.includes("partially_retrieved"), true);
  });

  it("does not block against a fully retrieved sale — that is the approved path back", () => {
    assert.equal(REVENUE_SALE_STATUSES.includes("retrieved"), false);
  });

  it("does not block against a cancelled or draft sale", () => {
    assert.equal(REVENUE_SALE_STATUSES.includes("cancelled"), false);
    assert.equal(REVENUE_SALE_STATUSES.includes("draft"), false);
  });
});
