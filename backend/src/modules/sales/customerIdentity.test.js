import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countSaleCustomers,
  customerFields,
  customerType,
  customerTypeLabel,
} from "./customerIdentity.js";

const sale = (over = {}) => ({ customerSource: "walk_in", createdAt: new Date("2026-01-01"), ...over });
const record = (id, name = "Someone") => ({ _id: id, fullName: name });

// Customer Type and Customer Name are two attributes, not one column. The old
// `customer_name || "Walk-in"` made them indistinguishable: a reader could not
// tell whether "Walk-in" was a type or somebody's name.
describe("customer type and name are separate attributes", () => {
  it("reports the type on every sale, including anonymous ones", () => {
    assert.equal(customerFields(sale()).customer_type, "walk_in");
    assert.equal(customerFields(sale()).customer_type_label, "Walk-in");
    assert.equal(customerFields(sale({ customerSource: "referred" })).customer_type_label, "Referral");
  });

  // TEST — the reported bug: a type must never be served as a name.
  it("leaves the name empty on an anonymous sale instead of writing the type there", () => {
    const fields = customerFields(sale());
    assert.equal(fields.customer_name, "");
    assert.equal(fields.customer_id, null);
    assert.equal(fields.is_anonymous, true);
  });

  it("carries the real name when a customer record is linked", () => {
    const fields = customerFields(sale({ customer: record("c1", "Ali Khan"), customerSource: "referred" }));
    assert.equal(fields.customer_name, "Ali Khan");
    assert.equal(fields.customer_id, "c1");
    assert.equal(fields.customer_type_label, "Referral");
    assert.equal(fields.is_anonymous, false);
  });

  it("falls back to Walk-in for a missing or unrecognised stored type", () => {
    assert.equal(customerType({}), "walk_in");
    assert.equal(customerType({ customerSource: "nonsense" }), "walk_in");
    assert.equal(customerTypeLabel(undefined), "Walk-in");
  });
});

// Dashboard "Total Customers" is counted by customer record, never by name.
describe("Total Customers counts records, not names", () => {
  // TEST — the reported bug: two people who happen to share a name are two
  // customers. Counting by name would silently merge them into one.
  it("counts two same-named customer records as two customers", () => {
    const summary = countSaleCustomers([
      sale({ customer: record("c1", "Ali Khan") }),
      sale({ customer: record("c2", "Ali Khan") }),
    ]);
    assert.equal(summary.total, 2);
  });

  it("counts one customer once no matter how often they buy", () => {
    const summary = countSaleCustomers([
      sale({ customer: record("c1"), createdAt: new Date("2026-01-01") }),
      sale({ customer: record("c1"), createdAt: new Date("2026-02-01") }),
      sale({ customer: record("c1"), createdAt: new Date("2026-03-01") }),
    ]);
    assert.equal(summary.total, 1);
    assert.equal(summary.identifiedSales, 3);
  });

  it("adds no customer for an anonymous walk-in, but still reports the sales", () => {
    const summary = countSaleCustomers([
      sale(),
      sale(),
      sale({ customer: record("c1") }),
    ]);
    assert.equal(summary.total, 1);
    assert.equal(summary.anonymousSales, 2);
    assert.equal(summary.identifiedSales, 1);
  });

  it("splits the total into walk-in and referral, and the parts sum to the whole", () => {
    const summary = countSaleCustomers([
      sale({ customer: record("c1"), customerSource: "walk_in" }),
      sale({ customer: record("c2"), customerSource: "referred" }),
      sale({ customer: record("c3"), customerSource: "referred" }),
    ]);
    assert.equal(summary.total, 3);
    assert.equal(summary.walkIn, 1);
    assert.equal(summary.referred, 2);
    assert.equal(summary.walkIn + summary.referred, summary.total);
  });

  it("types a returning customer by their latest sale, regardless of input order", () => {
    const summary = countSaleCustomers([
      sale({ customer: record("c1"), customerSource: "referred", createdAt: new Date("2026-05-01") }),
      sale({ customer: record("c1"), customerSource: "walk_in",  createdAt: new Date("2026-01-01") }),
    ]);
    assert.equal(summary.total, 1);
    assert.equal(summary.referred, 1);
    assert.equal(summary.walkIn, 0);
  });

  it("handles an unpopulated customer reference the same as a populated one", () => {
    const summary = countSaleCustomers([
      sale({ customer: "c1" }),
      sale({ customer: record("c1") }),
    ]);
    assert.equal(summary.total, 1);
  });

  it("reports zeroes for no sales", () => {
    assert.deepEqual(countSaleCustomers([]), {
      total: 0, walkIn: 0, referred: 0, identifiedSales: 0, anonymousSales: 0,
    });
  });
});
