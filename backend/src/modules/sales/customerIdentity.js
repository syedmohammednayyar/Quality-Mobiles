// Customer identity and customer type — one definition, used by Sales history,
// the sale detail drawer and the Dashboard "Total Customers" KPI, so the three
// can never disagree about who a customer is or how many there are.
//
// Two concepts were previously conflated into a single "Customer" column that
// rendered `customer_name || "Walk-in"`. They are distinct attributes:
//
//   Customer Type — how the customer came to the store: Walk-in or Referral.
//                   Always present, on every sale, recorded as `customerSource`.
//   Customer Name — the name on the linked Customer record. Absent when a sale
//                   was rung up without identifying anyone (anonymous walk-in).
//
// A sale therefore has a type even when it has no name, and "Walk-in" must
// never be shown in a name field: it is a type, not a person.

/** Sale.customerSource / Customer.sourceType values. */
export const CUSTOMER_TYPES = ["walk_in", "referred"];

const CUSTOMER_TYPE_LABELS = {
  walk_in: "Walk-in",
  referred: "Referral",
};

/** Stored type for a sale, defaulting the way the schema does. */
export function customerType(sale) {
  const raw = sale?.customerSource;
  return CUSTOMER_TYPES.includes(raw) ? raw : "walk_in";
}

/** Human label for a stored type: "Walk-in" / "Referral". */
export function customerTypeLabel(type) {
  return CUSTOMER_TYPE_LABELS[type] || CUSTOMER_TYPE_LABELS.walk_in;
}

/**
 * The name of the customer record linked to a sale, or "" when the sale is
 * anonymous. Deliberately never falls back to "Walk-in" — see above.
 */
export function customerName(sale) {
  return sale?.customer?.fullName || "";
}

/**
 * Customer identity as it is presented everywhere: type and name kept apart,
 * plus the record id that identity is actually judged by.
 */
export function customerFields(sale) {
  const type = customerType(sale);
  const id = sale?.customer?._id
    ? String(sale.customer._id)
    : (sale?.customer ? String(sale.customer) : null);
  return {
    customer_id:         id,
    customer_name:       customerName(sale),
    customer_type:       type,
    customer_type_label: customerTypeLabel(type),
    // A sale with no linked record: the transaction happened, but nobody was
    // identified, so it contributes no customer to any count.
    is_anonymous:        id === null,
  };
}

// ─── Total Customers ──────────────────────────────────────────────────────────

/**
 * Counts customers from sales, which is what the Dashboard "Total Customers"
 * KPI reports.
 *
 * The count is over *customer records*, never over displayed names: two
 * distinct Customer documents both named "Ali Khan" are two customers, because
 * they are two people as far as the system knows. Grouping by name would
 * silently merge them — and, worse, merge them differently on every screen
 * that tried it. Identity here is `Sale.customer`, the record id.
 *
 * Only revenue-bearing sales count, matching every other Dashboard figure: a
 * fully retrieved sale has been reversed end to end, so it no longer
 * contributes a customer any more than it contributes revenue.
 *
 * Returns the headline total plus the parts it is made of, so the KPI can be
 * reconciled against Sales instead of having to be taken on trust:
 *   total          — distinct identified customer records
 *   walkIn         — of those, whose latest sale was a walk-in
 *   referred       — of those, whose latest sale was a referral
 *   anonymousSales — sales with no linked customer record. Not in `total`;
 *                    nobody was identified, so there is no one to count.
 *   identifiedSales— sales that did link a customer record.
 */
export async function saleCustomerSummary(Sale, { storeMatch = {}, revenueSaleMatch }) {
  const match = { ...storeMatch, ...revenueSaleMatch };

  const [byCustomer, anonymous] = await Promise.all([
    Sale.aggregate([
      { $match: { ...match, customer: { $ne: null } } },
      // One bucket per customer record. `$last` after sorting by date takes the
      // type from that customer's most recent sale, so someone who first walked
      // in and later came back on a referral is reported under the latest.
      { $sort: { createdAt: 1 } },
      { $group: {
        _id: "$customer",
        latestType: { $last: "$customerSource" },
        saleCount:  { $sum: 1 },
      } },
      { $group: {
        _id: null,
        total:           { $sum: 1 },
        walkIn:          { $sum: { $cond: [{ $eq: ["$latestType", "referred"] }, 0, 1] } },
        referred:        { $sum: { $cond: [{ $eq: ["$latestType", "referred"] }, 1, 0] } },
        identifiedSales: { $sum: "$saleCount" },
      } },
    ]),
    Sale.countDocuments({ ...match, customer: null }),
  ]);

  const row = byCustomer[0] || {};
  return {
    total:           row.total || 0,
    walkIn:          row.walkIn || 0,
    referred:        row.referred || 0,
    identifiedSales: row.identifiedSales || 0,
    anonymousSales:  anonymous || 0,
  };
}

/**
 * The same count as `saleCustomerSummary`, over sales already loaded in memory
 * (Reports holds its period's sales as documents rather than aggregating).
 * Kept beside the aggregation on purpose: one rule, two call shapes, so the
 * Reports figure can never drift from the Dashboard one.
 *
 * Callers must pass revenue-bearing sales only, matching the aggregation.
 */
export function countSaleCustomers(sales = []) {
  const ids = new Set();
  const types = new Map();
  let anonymousSales = 0;

  for (const sale of sales) {
    const id = sale?.customer?._id
      ? String(sale.customer._id)
      : (sale?.customer ? String(sale.customer) : null);
    if (!id) { anonymousSales += 1; continue; }
    ids.add(id);
    // Latest sale wins, same as the aggregation's `$last` after sorting.
    const at = sale.createdAt ? new Date(sale.createdAt).getTime() : 0;
    const prev = types.get(id);
    if (!prev || at >= prev.at) types.set(id, { at, type: customerType(sale) });
  }

  let referred = 0;
  for (const entry of types.values()) if (entry.type === "referred") referred += 1;

  return {
    total:           ids.size,
    walkIn:          ids.size - referred,
    referred,
    identifiedSales: sales.length - anonymousSales,
    anonymousSales,
  };
}
