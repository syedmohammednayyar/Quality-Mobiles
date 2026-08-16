import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HISTORY_SALE_STATUSES,
  REVENUE_SALE_STATUSES,
  isFullyRetrieved,
  liveItemMatch,
  netOfRetrieved,
  revenueSaleMatch,
} from "./saleStatus.js";
import { lineContribution } from "./saleRetrieval.service.js";

describe("sale retrieval — a returned device stops counting as sold", () => {
  describe("which sales each query may see", () => {
    // TEST 1 — the bug: a retrieved product kept counting as revenue.
    it("keeps a fully retrieved sale out of every revenue query", () => {
      assert.equal(REVENUE_SALE_STATUSES.includes("retrieved"), false);
      assert.deepEqual(revenueSaleMatch, { status: { $in: REVENUE_SALE_STATUSES } });
    });

    it("still counts a partially retrieved sale, since its other lines really sold", () => {
      assert.equal(REVENUE_SALE_STATUSES.includes("partially_retrieved"), true);
    });

    it("never counts drafts or cancellations as revenue", () => {
      ["draft", "cancelled"].forEach((status) => {
        assert.equal(REVENUE_SALE_STATUSES.includes(status), false, `${status} must not be revenue`);
      });
    });

    // TEST 2 — the reversal has to stay visible; hiding it is not a fix.
    it("keeps retrieved sales in history rather than deleting them from the list", () => {
      assert.equal(HISTORY_SALE_STATUSES.includes("retrieved"), true);
      assert.equal(HISTORY_SALE_STATUSES.includes("partially_retrieved"), true);
      assert.equal(HISTORY_SALE_STATUSES.includes("completed"), true);
    });

    it("keeps cancelled and draft sales out of history", () => {
      ["cancelled", "draft"].forEach((status) => {
        assert.equal(HISTORY_SALE_STATUSES.includes(status), false);
      });
    });
  });

  describe("netting retrieved value out of a sale-level total", () => {
    it("subtracts the retrieved figure from the matching total", () => {
      const expr = netOfRetrieved("grandTotal", "retrievedTotal");
      assert.deepEqual(expr, {
        $max: [0, { $subtract: [{ $ifNull: ["$grandTotal", 0] }, { $ifNull: ["$retrievedTotal", 0] }] }],
      });
    });

    // Legacy sales predate these fields; a missing value must read as zero
    // rather than turning the whole sum into null.
    it("treats a missing retrieval total as zero, not null", () => {
      const expr = netOfRetrieved("originalAmount", "retrievedOriginalTotal");
      assert.deepEqual(expr.$max[1].$subtract[1], { $ifNull: ["$retrievedOriginalTotal", 0] });
    });

    it("floors the result at zero so a sale can never report negative revenue", () => {
      assert.equal(netOfRetrieved("grandTotal", "retrievedTotal").$max[0], 0);
    });
  });

  describe("dropping retrieved lines from item-level pipelines", () => {
    it("matches lines that were never retrieved", () => {
      assert.deepEqual(liveItemMatch, { $match: { "items.retrievedAt": null } });
    });
  });

  describe("what a retrieved line takes back off the sale", () => {
    // The loss snapshot already has the bill-level discount allocated, so net
    // is that plus the line's tax — not the raw line total.
    it("uses the discount-allocated amount plus tax as the net contribution", () => {
      const { net } = lineContribution({
        effectiveSellingAmount: 9000,
        taxAmount: 500,
        lineTotal: 9900,
        lineOriginalTotal: 10000,
        quantity: 1,
      });
      assert.equal(net, 9500);
    });

    it("returns the gross contribution separately, for gross-revenue figures", () => {
      const { gross } = lineContribution({
        effectiveSellingAmount: 9000,
        taxAmount: 500,
        lineOriginalTotal: 12000,
        quantity: 1,
      });
      assert.equal(gross, 12000);
    });

    // Sales predating Loss Management carry no snapshot at all.
    it("falls back to lineTotal when the line has no loss snapshot", () => {
      const { net } = lineContribution({ lineTotal: 7200, quantity: 1 });
      assert.equal(net, 7200);
    });

    it("derives gross from unit price and quantity when no line original is stored", () => {
      const { gross } = lineContribution({ lineTotal: 7200, originalUnitPrice: 4000, quantity: 2 });
      assert.equal(gross, 8000);
    });

    it("never returns NaN for an empty or malformed line", () => {
      const { net, gross } = lineContribution({});
      assert.equal(Number.isFinite(net), true);
      assert.equal(Number.isFinite(gross), true);
      assert.equal(net, 0);
    });

    it("rounds to whole paise so repeated retrievals cannot drift", () => {
      const { net } = lineContribution({ effectiveSellingAmount: 33.333, taxAmount: 0.004, quantity: 1 });
      assert.equal(net, 33.34);
    });
  });

  describe("deciding whether the whole sale came back", () => {
    it("is fully retrieved only once every line is stamped", () => {
      assert.equal(isFullyRetrieved({ items: [{ retrievedAt: new Date() }, { retrievedAt: new Date() }] }), true);
    });

    // TEST 3 — one returned item on a multi-item bill must not void the rest.
    it("is not fully retrieved while any line is still live", () => {
      assert.equal(isFullyRetrieved({ items: [{ retrievedAt: new Date() }, { retrievedAt: null }] }), false);
    });

    it("does not call an empty sale fully retrieved", () => {
      assert.equal(isFullyRetrieved({ items: [] }), false);
      assert.equal(isFullyRetrieved({}), false);
    });
  });
});
