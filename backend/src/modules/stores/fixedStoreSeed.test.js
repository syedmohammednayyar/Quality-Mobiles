import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixedStoreSeedUpdate } from "./stores.service.js";

// ensureFixedStores() runs on EVERY backend start. Anything it puts in `$set`
// is rewritten on each boot, so an admin-editable field there is destroyed on
// the next restart. That is exactly how every store rename was being silently
// reverted to "Store 1".."Store 4" while ids and codes stayed intact.
const item = { code: "STORE1", defaultName: "Store 1" };

describe("fixed store seed never overwrites an existing store", () => {
  // TEST 1 — the reported bug. `name` in `$set` wiped the rename on restart.
  it("seeds the default name only on insert, never on every boot", () => {
    const update = fixedStoreSeedUpdate(item);
    assert.equal("name" in update.$set, false, "name must not be in $set — it would be rewritten on every restart");
    assert.equal(update.$setOnInsert.name, "Store 1");
  });

  it("leaves an admin's parent/store-type choice alone after creation", () => {
    const update = fixedStoreSeedUpdate(item);
    assert.equal("parentStore" in update.$set, false);
    assert.equal(update.$setOnInsert.parentStore, null);
  });

  it("still seeds the permanent code on insert", () => {
    assert.equal(fixedStoreSeedUpdate(item).$setOnInsert.code, "STORE1");
  });

  // The four-active-fixed-stores contract is deliberate: creation and
  // deactivation are both refused, so this invariant is re-asserted on boot.
  it("keeps re-asserting that the fixed store is active", () => {
    assert.equal(fixedStoreSeedUpdate(item).$set.isActive, true);
  });

  // A rename must never be able to leak into the identity fields.
  it("never puts an identity field where a boot could rewrite it", () => {
    const update = fixedStoreSeedUpdate(item);
    for (const field of ["code", "name", "parentStore", "_id"]) {
      assert.equal(field in update.$set, false, `${field} must not be in $set`);
    }
  });
});
