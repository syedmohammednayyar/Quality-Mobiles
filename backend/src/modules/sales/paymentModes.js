/**
 * The payment modes a bill can be settled with, and how a bill's payments are
 * reported against the lines of that bill.
 *
 * POS billing offers four modes — Cash, UPI, Card and Bank Transfer — and a
 * sale carries what was actually collected in `payments[]`, one entry per mode
 * used. Reports list one row per line item rather than per bill, so a bill's
 * payments have to be spread across its lines: repeating the bill total on
 * every line would make a two-line bill look like it was paid twice.
 *
 * The split is proportional to each line's billed amount and the last line
 * takes the rounding remainder, so the mode columns of a bill always add back
 * to exactly what was collected.
 *
 * `wallet` (exchange credit) and `mixed` are storable payment methods but are
 * not POS payment modes, so they are deliberately left out of these columns —
 * folding them into one of the four would report money as having arrived by a
 * mode it never came through. They stay visible in the Payment Method column.
 */

/** [row key, stored paymentMethod, report label] for each POS payment mode. */
export const PAYMENT_MODES = [
  { key: "cashAmount",         method: "cash",          label: "Cash" },
  { key: "upiAmount",          method: "upi",           label: "UPI" },
  { key: "cardAmount",         method: "card",          label: "Card" },
  { key: "bankTransferAmount", method: "bank_transfer", label: "Bank Transfer" },
];

// Money is split in whole paise so the parts cannot drift away from the total
// through repeated float division.
const toCents   = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (cents) => Number((cents / 100).toFixed(2));
const lineAmount = (item) => toCents(item?.lineAdjustedTotal || item?.lineTotal);

/** What a bill collected per mode, in paise. Unknown methods are ignored. */
function collectedByMode(sale) {
  const totals = Object.fromEntries(PAYMENT_MODES.map(({ key }) => [key, 0]));
  (sale?.payments || []).forEach((payment) => {
    const mode = PAYMENT_MODES.find((m) => m.method === payment?.paymentMethod);
    if (mode) totals[mode.key] += toCents(payment.amount);
  });
  return totals;
}

/**
 * Spread one amount across lines weighted by their billed values. The last
 * line takes whatever rounding left over, which is what keeps the column
 * adding up to the bill. A bill whose lines are all zero-valued still has to
 * report its payment somewhere, so it goes on the first line rather than
 * vanishing.
 */
function allocate(totalCents, weights) {
  const out = new Array(weights.length).fill(0);
  if (!weights.length || !totalCents) return out;

  const base = weights.reduce((sum, weight) => sum + weight, 0);
  if (base <= 0) {
    out[0] = totalCents;
    return out;
  }

  let used = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    out[i] = Math.round((totalCents * weights[i]) / base);
    used += out[i];
  }
  out[weights.length - 1] = totalCents - used;
  return out;
}

/**
 * Per-mode amounts for every line of a sale, index-aligned with `sale.items`.
 * Retrieved lines keep their share: the money was collected on this bill and
 * the row's own status is what says the device came back.
 */
export function splitPaymentsAcrossItems(sale) {
  const items   = sale?.items || [];
  const weights = items.map(lineAmount);
  const totals  = collectedByMode(sale);

  const byMode = PAYMENT_MODES.map(({ key }) => allocate(totals[key], weights));
  return items.map((_, index) => Object.fromEntries(
    PAYMENT_MODES.map(({ key }, mode) => [key, fromCents(byMode[mode][index])]),
  ));
}

/**
 * Every mode a bill was settled with, named the way the POS screen names them,
 * for the Payment Method column. Methods with no POS mode (wallet, mixed) are
 * still listed — they are how the bill was settled even though they get no
 * column of their own.
 */
export function paymentMethodLabel(sale) {
  const methods = (sale?.payments || []).map((payment) => payment?.paymentMethod).filter(Boolean);
  return [...new Set(methods)]
    .map((method) => PAYMENT_MODES.find((mode) => mode.method === method)?.label
      || String(method).split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "))
    .join(", ");
}
