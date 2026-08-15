import React from "react";
import {
  MARGIN_ICON, MARGIN_LABEL, marginClass, formatMarginAmount, formatMarginPercent,
  type MarginResult,
} from "../utils/margin";
import "./MarginBadge.css";

/**
 * Shared margin presentation.
 *
 * A loss is communicated three ways at once — value, label, and icon — so it
 * survives greyscale printing and colour-vision differences. Colour is the
 * reinforcement, never the message.
 */

/** Status chip: `⚠ LOSS`, `✓ PROFIT`, `= BREAK-EVEN`. */
export const MarginBadge: React.FC<{ result: MarginResult; compact?: boolean }> = ({ result, compact }) => {
  if (result.costUnknown && !result.isLoss) {
    return <span className="margin-badge margin-unknown" title="No purchase price recorded">N/A</span>;
  }
  return (
    <span className={`margin-badge ${marginClass(result.status)}`}>
      <span aria-hidden="true">{MARGIN_ICON[result.status]}</span>
      {!compact && <span>{MARGIN_LABEL[result.status]}</span>}
    </span>
  );
};

/** Signed margin amount, e.g. `-Rs 11`. */
export const MarginAmount: React.FC<{ result: MarginResult; perUnit?: boolean }> = ({ result, perUnit }) => {
  if (result.costUnknown) return <span className="margin-value margin-unknown">N/A</span>;
  const value = perUnit ? result.unitMargin : result.totalMargin;
  return <span className={`margin-value ${marginClass(result.status)}`}>{formatMarginAmount(value)}</span>;
};

/** Signed margin percentage, e.g. `-91.67%`. */
export const MarginPercent: React.FC<{ result: MarginResult }> = ({ result }) => (
  <span className={`margin-value ${result.marginPercentage === null ? "margin-unknown" : marginClass(result.status)}`}>
    {formatMarginPercent(result.marginPercentage)}
  </span>
);

/**
 * Full pricing breakdown for detail panels and the POS review step.
 * Shows the discount line only when one applies, so the simple case stays terse.
 */
export const MarginSummaryPanel: React.FC<{ result: MarginResult; title?: string }> = ({ result, title = "Pricing & Margin" }) => (
  <div className={`margin-panel ${marginClass(result.status)}`}>
    <h4>{title}</h4>
    <dl>
      <div><dt>Purchase Cost{result.quantity > 1 ? ` (x${result.quantity})` : ""}</dt><dd>Rs {Math.round(result.totalCost).toLocaleString()}</dd></div>
      <div><dt>Selling Price</dt><dd>Rs {Math.round(result.originalSellingPrice).toLocaleString()}</dd></div>
      {result.discount > 0 && (
        <div><dt>Discount</dt><dd>- Rs {Math.round(result.discount).toLocaleString()}</dd></div>
      )}
      {result.discount > 0 && (
        <div><dt>Final Price</dt><dd>Rs {Math.round(result.effectiveSellingPrice).toLocaleString()}</dd></div>
      )}
      <div><dt>Margin</dt><dd><MarginAmount result={result} /></dd></div>
      {result.quantity > 1 && (
        <div><dt>Margin / unit</dt><dd><MarginAmount result={result} perUnit /></dd></div>
      )}
      <div><dt>Margin %</dt><dd><MarginPercent result={result} /></dd></div>
      <div><dt>Status</dt><dd><MarginBadge result={result} /></dd></div>
    </dl>
  </div>
);

/**
 * Inline warning for price entry and the POS cart.
 * Renders nothing unless the figures actually describe a loss — a warning that
 * shows up when nothing is wrong stops being read.
 */
export const LossWarning: React.FC<{ result: MarginResult; children?: React.ReactNode }> = ({ result, children }) => {
  if (!result.isLoss) return null;
  return (
    <div className="margin-warning" role="alert">
      <span className="margin-warning-icon" aria-hidden="true">⚠</span>
      <span>
        <strong>Selling below purchase price.</strong>{" "}
        This will result in a loss of <strong>Rs {Math.round(result.lossAmount).toLocaleString()}</strong>
        {result.quantity > 1 ? ` (Rs ${Math.round(Math.abs(result.unitMargin)).toLocaleString()} per unit x ${result.quantity})` : ""}
        {result.marginPercentage !== null ? ` — ${formatMarginPercent(result.marginPercentage)} margin` : ""}.
        {children}
      </span>
    </div>
  );
};

export default MarginBadge;
