// Which sale statuses each kind of query is allowed to see, kept in one place
// so a retrieved sale can never be counted as revenue by one report and
// ignored by another.
//
// A retrieval takes a sold device back out of a sale and returns it to
// sellable stock. The sale document is never deleted — Sales History keeps
// showing the transaction, flagged — but the retrieved value stops counting.

/** Sales that still represent money earned. A fully retrieved sale is not one. */
export const REVENUE_SALE_STATUSES = ["completed", "partially_retrieved"];

/**
 * Sales that belong in Sales History. Fully retrieved sales stay in the list
 * carrying their reversal indicator instead of silently disappearing.
 */
export const HISTORY_SALE_STATUSES = ["completed", "partially_retrieved", "retrieved"];

/** `$match` fragment (or `find` filter) for revenue-bearing sales. */
export const revenueSaleMatch = { status: { $in: REVENUE_SALE_STATUSES } };

/** `find` filter for everything Sales History should list. */
export const historySaleMatch = { status: { $in: HISTORY_SALE_STATUSES } };

/**
 * Aggregation expression netting a retrieval total out of a sale-level total,
 * floored at zero. Use for sums over whole sale documents; item-level
 * pipelines should drop retrieved lines with `liveItemMatch` instead.
 */
export function netOfRetrieved(totalField, retrievedField) {
  return {
    $max: [
      0,
      { $subtract: [{ $ifNull: [`$${totalField}`, 0] }, { $ifNull: [`$${retrievedField}`, 0] }] },
    ],
  };
}

/**
 * `$match` stage that keeps only lines still part of the sale, for pipelines
 * that have already `$unwind`ed `items`. Matches legacy items too, where the
 * field is absent rather than null.
 */
export const liveItemMatch = { $match: { "items.retrievedAt": null } };

/** True when the sale has no live (non-retrieved) line left. */
export function isFullyRetrieved(sale) {
  const items = sale?.items || [];
  return items.length > 0 && items.every((item) => Boolean(item.retrievedAt));
}
