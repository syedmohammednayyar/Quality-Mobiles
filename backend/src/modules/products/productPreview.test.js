import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProductPreview, retrievedLinesFor, summariseRetrievedLine } from "./productPreview.js";

const saleWith = (overrides = {}) => ({
  _id: "sale1",
  saleNo: "SALE-0007",
  jobNumber: "JOB-00042",
  status: "partially_retrieved",
  store: { _id: "store1", name: "Main Branch" },
  customer: { _id: "cust1", fullName: "Asha Rahman" },
  salespersonName: "Imran",
  transactionDate: "2026-08-01T10:00:00.000Z",
  createdAt: "2026-08-01T10:00:00.000Z",
  items: [
    {
      product: "prod1",
      quantity: 1,
      effectiveSellingAmount: 9000,
      taxAmount: 500,
      lineOriginalTotal: 10000,
      retrievedAt: "2026-08-10T09:30:00.000Z",
      retrievedBy: { fullName: "Nadia Admin" },
      retrievalReason: "Customer returned — screen fault",
    },
    { product: "prod2", quantity: 1, effectiveSellingAmount: 4000, taxAmount: 0, retrievedAt: null },
  ],
  ...overrides,
});

const product = { id: "prod1", job_id: "JOB-00042", name: "iPhone 13", primary_store_ref: "store1" };

describe("product preview — reviewing a retrieved / revised record", () => {
  describe("summarising the retrieved sale line", () => {
    it("quotes the same net amount the reversal took off revenue", () => {
      // Same rule as lineContribution: discount-allocated amount plus tax. If
      // the preview computed its own figure it could contradict the dashboard.
      const row = summariseRetrievedLine(saleWith(), saleWith().items[0]);
      assert.equal(row.net_amount, 9500);
      assert.equal(row.gross_amount, 10000);
    });

    it("carries the sale, who retrieved it and why, so no second screen is needed", () => {
      const row = summariseRetrievedLine(saleWith(), saleWith().items[0]);
      assert.equal(row.sale_no, "SALE-0007");
      assert.equal(row.job_number, "JOB-00042");
      assert.equal(row.store_name, "Main Branch");
      assert.equal(row.customer_name, "Asha Rahman");
      assert.equal(row.retrieved_by, "Nadia Admin");
      assert.equal(row.retrieval_reason, "Customer returned — screen fault");
      assert.equal(row.sale_status, "partially_retrieved");
    });

    it("reports a bill with one live line as only partially retrieved", () => {
      assert.equal(summariseRetrievedLine(saleWith(), saleWith().items[0]).fully_retrieved, false);
    });

    it("reports a bill whose every line came back as fully retrieved", () => {
      const sale = saleWith({
        status: "retrieved",
        items: [{ product: "prod1", quantity: 1, lineTotal: 5000, retrievedAt: "2026-08-10T09:30:00.000Z" }],
      });
      assert.equal(summariseRetrievedLine(sale, sale.items[0]).fully_retrieved, true);
    });

    it("names a sale with no customer record rather than showing a blank", () => {
      const sale = saleWith({ customer: null });
      assert.equal(summariseRetrievedLine(sale, sale.items[0]).customer_name, "Walk-in");
    });

    it("falls back to System when the retrieving user was not recorded", () => {
      const sale = saleWith();
      sale.items[0].retrievedBy = null;
      assert.equal(summariseRetrievedLine(sale, sale.items[0]).retrieved_by, "System");
    });
  });

  describe("picking this product's retrieved lines out of a sale", () => {
    it("returns only the line for the product being previewed", () => {
      const rows = retrievedLinesFor(saleWith(), "prod1");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].net_amount, 9500);
    });

    // The other items on a multi-item bill were genuinely sold; showing them
    // in this product's preview would misreport what came back.
    it("ignores lines that are still live on the same bill", () => {
      assert.deepEqual(retrievedLinesFor(saleWith(), "prod2"), []);
    });

    it("handles populated product refs, not just raw ids", () => {
      const sale = saleWith();
      sale.items[0].product = { _id: "prod1" };
      assert.equal(retrievedLinesFor(sale, "prod1").length, 1);
    });
  });

  describe("assembling the preview", () => {
    it("marks the record as retrieved and totals what came back", () => {
      const preview = buildProductPreview({ product, sales: [saleWith()] });
      assert.equal(preview.retrieved, true);
      assert.equal(preview.retrievals.length, 1);
      assert.equal(preview.retrieved_total, 9500);
      assert.equal(preview.retrieved_quantity, 1);
      assert.equal(preview.last_retrieved_at, "2026-08-10T09:30:00.000Z");
    });

    it("sums a device sold, retrieved, sold and retrieved again", () => {
      const second = saleWith({
        _id: "sale2",
        saleNo: "SALE-0011",
        items: [{
          product: "prod1",
          quantity: 1,
          lineTotal: 8000,
          retrievedAt: "2026-08-14T12:00:00.000Z",
          retrievalReason: "Second return",
        }],
      });
      const preview = buildProductPreview({ product, sales: [saleWith(), second] });
      assert.equal(preview.retrievals.length, 2);
      assert.equal(preview.retrieved_total, 17500);
      assert.equal(preview.retrieved_quantity, 2);
    });

    it("lists the most recent retrieval first, whatever order the sales arrived in", () => {
      const older = saleWith({
        _id: "sale0",
        saleNo: "SALE-0001",
        items: [{ product: "prod1", quantity: 1, lineTotal: 100, retrievedAt: "2026-07-01T00:00:00.000Z" }],
      });
      const preview = buildProductPreview({ product, sales: [older, saleWith()] });
      assert.equal(preview.retrievals[0].sale_no, "SALE-0007");
      assert.equal(preview.retrievals[1].sale_no, "SALE-0001");
    });

    // A product that was only ever price-edited still has a record worth
    // reviewing — the preview just has no sale to show.
    it("still builds a preview for a product that was never retrieved", () => {
      const preview = buildProductPreview({ product, sales: [], revisions: [] });
      assert.equal(preview.retrieved, false);
      assert.deepEqual(preview.retrievals, []);
      assert.equal(preview.retrieved_total, 0);
      assert.equal(preview.last_retrieved_at, null);
    });

    it("surfaces the newest revision remark without the caller re-sorting", () => {
      const revisions = [
        { id: "a", changed_at: "2026-08-10T09:30:00.000Z", remark: "Returned to stock", changes: [] },
        { id: "b", changed_at: "2026-08-01T09:00:00.000Z", remark: "Price correction", changes: [] },
      ];
      const preview = buildProductPreview({ product, sales: [], revisions });
      assert.equal(preview.latest_revision.id, "a");
      assert.equal(preview.revisions.length, 2);
    });

    it("reports empty stock rather than undefined when no stock was passed", () => {
      const preview = buildProductPreview({ product, sales: [] });
      assert.deepEqual(preview.stock, { rows: [], total_stock: 0 });
    });

    it("keeps the product record itself on the preview, so one call answers everything", () => {
      const preview = buildProductPreview({ product, sales: [saleWith()] });
      assert.equal(preview.product.job_id, "JOB-00042");
    });
  });
});
