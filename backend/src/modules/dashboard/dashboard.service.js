import mongoose from "mongoose";
import {
  BulkInventory, Customer, ExchangeDevice, LossRecord, PriceAdjustment,
  Product, Sale, SerializedInventory, StockLedger, Store,
} from "../../db/models.js";
import { formatDate, formatDateRange, formatDayMonth, formatMonthYear, parseCalendarDate } from "../../utils/dateFormat.js";
import {
  activeBulkByCategoryPipeline,
  activeBulkQuantityPipeline,
  activeSerializedMatch,
  classifyStockStatus,
  lowStockCountPipeline,
  lowStockStages,
  outOfStockCountPipeline,
} from "../inventory/activeStock.js";

const oid   = (value) => new mongoose.Types.ObjectId(value);
const money = (value) => Number(value || 0);
const startOfDay   = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay     = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const startOfWeek  = () => { const d = startOfDay(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const startOfYear  = () => new Date(new Date().getFullYear(), 0, 1);

// ─── Store scoping ────────────────────────────────────────────────────────────
// `storeId` is either a real ObjectId string (one branch) or null/undefined,
// which means "All Stores" — an empty match that spans every permitted store.
// "ALL" is never used as a database value; it is resolved to null by the caller.
const storeMatch = (storeId) => (storeId ? { store: oid(storeId) } : {});

// ─── Date scoping ─────────────────────────────────────────────────────────────
// Every period-sensitive query gets both bounds so the store filter and the date
// filter always apply together, never one without the other.
const dateMatch = (from, to, field = "createdAt") =>
  (from || to ? { [field]: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {});

const scopeMatch = (storeId, from, to) => ({ ...storeMatch(storeId), ...dateMatch(from, to) });

// Mongo aggregates dates in UTC unless told otherwise; the range bounds above are
// built in server-local time, so day buckets must use the same offset.
function localTimezone() {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs  = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Turn a quick-range key (or an explicit from/to pair) into concrete bounds.
 * Exported so the controller can validate/normalise before hitting the DB.
 */
export function resolveDateRange({ rangeKey = "today", fromDate, toDate } = {}) {
  const now = new Date();

  if (rangeKey === "custom" && (fromDate || toDate)) {
    // parseCalendarDate, not `new Date(str)`: the latter reads "2026-08-01" as
    // UTC midnight and would shift the whole window back a day on any server
    // west of Greenwich, querying dates the user never asked for.
    const fromParsed = parseCalendarDate(fromDate || toDate);
    const toParsed   = parseCalendarDate(toDate || fromDate);
    if (!fromParsed || !toParsed) {
      return { rangeKey: "today", from: startOfDay(), to: endOfDay(), label: "Today" };
    }
    const from = startOfDay(fromParsed);
    const to   = endOfDay(toParsed);
    // Tolerate a reversed range instead of silently returning nothing.
    const [start, end] = from <= to ? [from, to] : [to, from];
    return { rangeKey: "custom", from: start, to: end, label: formatDateRange(start, end) };
  }

  switch (rangeKey) {
    case "week":  return { rangeKey: "week",  from: startOfWeek(),  to: endOfDay(now), label: "This Week" };
    case "month": return { rangeKey: "month", from: startOfMonth(), to: endOfDay(now), label: "This Month" };
    case "year":  return { rangeKey: "year",  from: startOfYear(),  to: endOfDay(now), label: "This Year" };
    default:      return { rangeKey: "today", from: startOfDay(),   to: endOfDay(now), label: "Today" };
  }
}

// ─── Sale summary: returns gross + net + adjustment + exchange breakdown ──────
async function saleSummary(from, storeId, to) {
  const rows = await Sale.aggregate([
    { $match: { ...scopeMatch(storeId, from, to), status: "completed" } },
    {
      $group: {
        _id:              null,
        sales:            { $sum: 1 },
        grossRevenue:     { $sum: "$originalAmount" },
        netRevenue:       { $sum: "$grandTotal" },
        priceAdjustments: { $sum: "$priceAdjustmentTotal" },
        exchangeTotal:    { $sum: "$exchangeTotal" },
        productsSold:     { $sum: { $sum: "$items.quantity" } },
      },
    },
  ]);
  const row = rows[0] || {};
  return {
    sales:            row.sales            || 0,
    grossRevenue:     row.grossRevenue     || 0,
    netRevenue:       row.netRevenue       || 0,
    priceAdjustments: row.priceAdjustments || 0,
    exchangeTotal:    row.exchangeTotal    || 0,
    productsSold:     row.productsSold     || 0,
    // back-compat alias used by older callers
    revenue:          row.netRevenue       || 0,
  };
}

// ─── Price adjustment summary for a period ────────────────────────────────────
async function adjustmentSummary(from, storeId, to) {
  const rows = await PriceAdjustment.aggregate([
    { $match: scopeMatch(storeId, from, to) },
    {
      $group: {
        _id:             "$reasonCategory",
        count:           { $sum: 1 },
        totalDifference: { $sum: "$differenceAmount" },
      },
    },
    { $sort: { totalDifference: -1 } },
  ]);
  return rows.map((r) => ({ category: r._id, count: r.count, totalDiscount: r.totalDifference }));
}

// ─── Exchange device summary for a period ────────────────────────────────────
async function exchangeSummary(from, storeId, to) {
  const rows = await ExchangeDevice.aggregate([
    { $match: scopeMatch(storeId, from, to) },
    {
      $group: {
        _id:            null,
        count:          { $sum: 1 },
        totalValue:     { $sum: "$exchangeValue" },
        totalMarket:    { $sum: "$marketValue" },
      },
    },
  ]);
  return rows[0] || { count: 0, totalValue: 0, totalMarket: 0 };
}

// ─── Loss summary: KPI figures for a period (Loss Management) ─────────────────
async function lossSummary(from, storeId, to) {
  const rows = await LossRecord.aggregate([
    { $match: { ...scopeMatch(storeId, from, to), lossStatus: "active" } },
    { $group: { _id: null, totalLoss: { $sum: "$lossAmount" }, itemCount: { $sum: 1 }, saleIds: { $addToSet: "$sale" } } },
  ]);
  const row = rows[0] || {};
  const totalLoss = money(row.totalLoss);
  const itemCount = row.itemCount || 0;
  return {
    totalLoss,
    itemCount,
    transactionCount: row.saleIds?.length || 0,
    averageLoss: itemCount > 0 ? Number((totalLoss / itemCount).toFixed(2)) : 0,
  };
}

// ─── Sales trend: one bucket per day (or per month for long ranges) ───────────
async function salesTrend(storeId, from, to) {
  const spanDays  = Math.max(1, Math.round((to - from) / 86_400_000));
  const byMonth   = spanDays > 92;
  const format    = byMonth ? "%Y-%m" : "%Y-%m-%d";
  const timezone  = localTimezone();

  const rows = await Sale.aggregate([
    { $match: { ...scopeMatch(storeId, from, to), status: "completed" } },
    {
      $group: {
        _id:          { $dateToString: { format, date: "$createdAt", timezone } },
        sales:        { $sum: 1 },
        revenue:      { $sum: "$grandTotal" },
        grossRevenue: { $sum: "$originalAmount" },
      },
    },
  ]);
  const found = new Map(rows.map((r) => [r._id, r]));

  // Emit every bucket in the range, including empty ones, so the chart shows
  // real gaps instead of silently compressing days with no sales.
  const buckets = [];
  const cursor  = byMonth ? new Date(from.getFullYear(), from.getMonth(), 1) : startOfDay(from);
  const guard   = byMonth ? 120 : 400;

  while (cursor <= to && buckets.length < guard) {
    const key = byMonth
      ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
      : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const hit = found.get(key);
    buckets.push({
      date:         key,
      // Compact tick label; `fullLabel` carries the full application format for
      // the tooltip. Both are locale-independent — `toLocaleDateString` here
      // followed the server's locale, not the application standard.
      label:        byMonth ? formatMonthYear(cursor) : formatDayMonth(cursor),
      fullLabel:    byMonth ? formatMonthYear(cursor) : formatDate(cursor),
      sales:        hit?.sales        || 0,
      revenue:      money(hit?.revenue),
      grossRevenue: money(hit?.grossRevenue),
    });
    if (byMonth) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

// ─── Top products sold in the period, for this store only ────────────────────
async function topProducts(storeId, from, to, limit = 6) {
  const rows = await Sale.aggregate([
    { $match: { ...scopeMatch(storeId, from, to), status: "completed" } },
    { $unwind: "$items" },
    {
      $group: {
        _id:      "$items.product",
        quantity: { $sum: "$items.quantity" },
        revenue:  { $sum: "$items.lineTotal" },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
  ]);

  return rows.map((row) => ({
    productId: String(row._id),
    name:      row.product?.name || "Unknown product",
    brand:     row.product?.brand || "",
    category:  row.product?.category || "",
    quantity:  row.quantity || 0,
    revenue:   money(row.revenue),
  }));
}

const CATEGORY_LABELS = {
  new_phone:   "Mobile Sales (New)",
  used_phone:  "Mobile Sales (Used)",
  accessory:   "Accessories",
  service:     "Repair Services",
  repair_part: "Repair Parts",
};

// ─── Revenue split by product category, plus exchange credit ─────────────────
async function revenueBreakdown(storeId, from, to, exchangeValue) {
  const rows = await Sale.aggregate([
    { $match: { ...scopeMatch(storeId, from, to), status: "completed" } },
    { $unwind: "$items" },
    { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "product" } },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$product.category", amount: { $sum: "$items.lineTotal" } } },
  ]);

  const slices = rows.map((row) => ({
    key:    row._id || "other",
    label:  CATEGORY_LABELS[row._id] || "Other",
    amount: money(row.amount),
  }));

  if (exchangeValue > 0) slices.push({ key: "buyback", label: "Buyback / Exchange", amount: money(exchangeValue) });

  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  return slices
    .filter((slice) => slice.amount > 0)
    .map((slice) => ({ ...slice, percent: total > 0 ? Number(((slice.amount / total) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

// ─── Low-stock alerts for the selected store only ─────────────────────────────
// Uses the shared low-stock stages so the list can never disagree with the
// lowStockProducts KPI above it. Sold and sold-out rows are excluded at the
// database, not filtered out afterwards.
async function inventoryAlerts(storeId, limit = 10) {
  const rows = await BulkInventory.aggregate([
    ...lowStockStages(storeId),
    { $sort: { quantity: 1 } },
    { $limit: limit },
    { $lookup: { from: "stores", localField: "store", foreignField: "_id", as: "storeDoc" } },
    { $unwind: { path: "$storeDoc", preserveNullAndEmptyArrays: true } },
  ]);

  return rows.map((row) => ({
    id:            String(row._id),
    product:       row.productDoc?.name || "Unknown product",
    sku:           row.productDoc?.sku || "",
    brand:         row.productDoc?.brand || "",
    store:         row.storeDoc?.name || "",
    quantity:      row.quantity || 0,
    minStockLevel: row.minStockLevel || 0,
    severity:      classifyStockStatus(row.quantity, row.minStockLevel),
  }));
}

/**
 * Dashboard payload for one store, or for every permitted store when
 * `storeId` is null ("All Stores").
 *
 * @param {object}  options
 * @param {?string} options.storeId  ObjectId string, or null for All Stores.
 * @param {Date}    options.from     Inclusive start of the selected period.
 * @param {Date}    options.to       Inclusive end of the selected period.
 * @param {string}  options.rangeKey today | week | month | year | custom.
 * @param {string}  options.rangeLabel Human label for the period.
 */
export async function getDashboardSummary(options = {}) {
  // Back-compat: earlier callers passed a bare storeId string.
  const opts = typeof options === "string" || options === null || options === undefined
    ? { storeId: options || null }
    : options;

  const storeId     = opts.storeId || null;
  const { from, to, rangeKey, label } = opts.from && opts.to
    ? { from: opts.from, to: opts.to, rangeKey: opts.rangeKey || "custom", label: opts.rangeLabel || "" }
    : resolveDateRange(opts);

  const storeFilter = storeMatch(storeId);
  const today       = startOfDay();
  const todayEnd    = endOfDay();

  const [
    periodSales, todaySales, weekSales, monthSales,
    periodAdjustments, todayAdjustments, monthAdjustments,
    periodExchanges, monthExchanges,
    customers, available, buybackInventory, bulkLow, transfers,
    stores, recentSales, ledger,
    periodLoss, todayLoss, weekLoss, monthLoss, recentLosses,
    underRepairBuybacks, pendingPaymentsAgg,
    trend, topSellers, lowStockList,
  ] = await Promise.all([
    saleSummary(from,             storeId, to),
    saleSummary(today,            storeId, todayEnd),
    saleSummary(startOfWeek(),    storeId, todayEnd),
    saleSummary(startOfMonth(),   storeId, todayEnd),
    adjustmentSummary(from,           storeId, to),
    adjustmentSummary(today,          storeId, todayEnd),
    adjustmentSummary(startOfMonth(), storeId, todayEnd),
    exchangeSummary(from,           storeId, to),
    exchangeSummary(startOfMonth(), storeId, todayEnd),
    Customer.countDocuments(storeFilter),
    // Devices available to sell right now. SerializedInventory.status is the
    // authoritative per-device state, so a sold device is excluded here even
    // if some other model still carries a stale row for it.
    SerializedInventory.countDocuments(activeSerializedMatch(storeId)),
    SerializedInventory.aggregate([
      { $match: activeSerializedMatch(storeId) },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $match: { "product.category": "used_phone" } },
      { $count: "count" },
    ]),
    BulkInventory.aggregate(lowStockCountPipeline(storeId)),
    StockLedger.countDocuments({ ...scopeMatch(storeId, from, to), referenceType: "stock_transfer", movementType: "transfer_out" }),
    Store.find(storeId ? { _id: oid(storeId), isActive: true } : { isActive: true }).lean(),
    Sale.find({ ...scopeMatch(storeId, from, to), status: "completed" }).populate("store customer items.product").sort({ createdAt: -1 }).limit(8).lean(),
    StockLedger.find({ ...storeFilter }).select("movementType").sort({ createdAt: -1 }).limit(25).lean(),
    lossSummary(from,           storeId, to),
    lossSummary(today,          storeId, todayEnd),
    lossSummary(startOfWeek(),  storeId, todayEnd),
    lossSummary(startOfMonth(), storeId, todayEnd),
    LossRecord.find({ ...scopeMatch(storeId, from, to), lossStatus: "active" })
      .populate("store", "name").populate("employee", "fullName").populate("product", "name jobId imei")
      .sort({ createdAt: -1 }).limit(8).lean(),
    // Buyback/used devices physically held but not sellable yet.
    Product.countDocuments({ ...storeFilter, category: "used_phone", inventoryStatus: "under_repair", isActive: true }),
    // Outstanding money owed on completed sales (grandTotal not fully paid).
    Sale.aggregate([
      { $match: { ...storeFilter, status: "completed", paymentStatus: { $in: ["pending", "partial"] } } },
      { $group: { _id: null, outstanding: { $sum: { $subtract: ["$grandTotal", "$amountPaid"] } }, count: { $sum: 1 } } },
    ]),
    salesTrend(storeId, from, to),
    topProducts(storeId, from, to),
    inventoryAlerts(storeId),
  ]);

  const [bulkAvailable, bulkByCategory, bulkOutOfStock, serializedNew, breakdown] = await Promise.all([
    // Units of bulk stock that are genuinely still on hand: quantity > 0 on a
    // product that is active, not sold, and not serialized (a serialized
    // device is counted once, above, from SerializedInventory).
    BulkInventory.aggregate(activeBulkQuantityPipeline(storeId)),
    BulkInventory.aggregate(activeBulkByCategoryPipeline(storeId)),
    BulkInventory.aggregate(outOfStockCountPipeline(storeId)),
    SerializedInventory.aggregate([
      { $match: activeSerializedMatch(storeId) },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $match: { "product.category": { $ne: "used_phone" } } },
      { $count: "count" },
    ]),
    revenueBreakdown(storeId, from, to, periodExchanges.totalValue),
  ]);

  // The Inventory Status panel must add up against Available Inventory, so
  // both halves of active stock feed it: serialized devices and bulk units.
  const bulkUsedPhones = money(bulkByCategory.find((row) => row._id === "used_phone")?.quantity);
  const bulkNewPhones  = bulkByCategory.reduce(
    (sum, row) => sum + (row._id === "used_phone" ? 0 : money(row.quantity)),
    0,
  );
  const activeBulkUnits   = money(bulkAvailable[0]?.quantity);
  const lowStockCount     = money(bulkLow[0]?.count);
  const outOfStockCount   = money(bulkOutOfStock[0]?.count);
  const availableInventory = available + activeBulkUnits;

  // One entry per store in scope — a single entry when one branch is selected,
  // so the comparison chart can never imply it is showing every store.
  const storePerformance = await Promise.all(stores.map(async (store) => {
    const [summary, inventory, storeLoss] = await Promise.all([
      saleSummary(from, store._id, to),
      SerializedInventory.find({ store: store._id, status: "in_stock" }).populate("product").lean(),
      lossSummary(from, store._id, to),
    ]);
    return {
      storeId:        String(store._id),
      store:          store.name,
      grossRevenue:   summary.grossRevenue,
      netRevenue:     summary.netRevenue,
      revenue:        summary.netRevenue,
      adjustments:    summary.priceAdjustments,
      exchangeTotal:  summary.exchangeTotal,
      sales:          summary.sales,
      inventoryValue: inventory.reduce((sum, row) => sum + money(row.product?.purchasePrice || row.product?.unitPrice), 0),
      lossAmount:     storeLoss.totalLoss,
    };
  }));

  const lossByStore = storePerformance
    .map((row) => ({ storeId: row.storeId, storeName: row.store, lossAmount: row.lossAmount }))
    .sort((a, b) => b.lossAmount - a.lossAmount);

  const selectedStore = storeId ? stores[0] : null;

  return {
    // Echo the scope back so the UI can prove which store/period it is showing
    // and discard responses that belong to a selection the user has moved past.
    scope: {
      storeId:     storeId ? String(storeId) : "ALL",
      storeName:   selectedStore?.name || "All Stores",
      isAllStores: !storeId,
      rangeKey,
      rangeLabel:  label,
      from:        from.toISOString(),
      to:          to.toISOString(),
    },
    kpis: {
      // Selected period (store + date filtered)
      periodSales:         periodSales.sales,
      periodGrossRevenue:  periodSales.grossRevenue,
      periodNetRevenue:    periodSales.netRevenue,
      periodRevenue:       periodSales.netRevenue,
      productsSoldPeriod:  periodSales.productsSold,
      periodAdjustments:   periodSales.priceAdjustments,
      periodAdjustmentsCount: periodAdjustments.reduce((s, r) => s + r.count, 0),
      periodExchangeValue: periodExchanges.totalValue,
      periodExchangeCount: periodExchanges.count,
      // Fixed windows kept for the Sales Overview card
      todaySales:        todaySales.sales,
      todayRevenue:      todaySales.netRevenue,
      productsSoldToday: todaySales.productsSold,
      todayGrossRevenue:  todaySales.grossRevenue,
      todayNetRevenue:    todaySales.netRevenue,
      monthGrossRevenue:  monthSales.grossRevenue,
      monthNetRevenue:    monthSales.netRevenue,
      monthPriceAdjustments: monthSales.priceAdjustments,
      monthExchangeValue:    monthExchanges.totalValue,
      monthExchangeCount:    monthExchanges.count,
      // Inventory (point-in-time, store filtered but not date filtered)
      availableInventory,
      buybackInventory:   money(buybackInventory[0]?.count),
      totalCustomers:     customers,
      lowStockProducts:   lowStockCount,
      outOfStockProducts: outOfStockCount,
      underRepairBuybacks: underRepairBuybacks,
      pendingPayments:    money(pendingPaymentsAgg[0]?.outstanding),
      pendingPaymentBills: pendingPaymentsAgg[0]?.count || 0,
      todayAdjustmentsCount: todayAdjustments.reduce((s, r) => s + r.count, 0),
      // Loss Management (selected period)
      totalLoss:            periodLoss.totalLoss,
      lossTransactionCount: periodLoss.transactionCount,
      lossItemCount:        periodLoss.itemCount,
      averageLoss:          periodLoss.averageLoss,
    },
    salesOverview: {
      period: periodSales,
      today:  todaySales,
      week:   weekSales,
      month:  monthSales,
    },
    lossOverview: {
      period: periodLoss,
      today:  todayLoss,
      week:   weekLoss,
      month:  monthLoss,
    },
    salesTrend:       trend,
    topProducts:      topSellers,
    revenueBreakdown: breakdown,
    inventoryAlerts:  lowStockList,
    lossByStore,
    recentLosses: recentLosses.map((loss) => ({
      id:           String(loss._id),
      saleNo:       loss.saleNo,
      product:      loss.productName || loss.product?.name || "",
      imei:         loss.imei || loss.product?.imei || "",
      store:        loss.store?.name || "",
      employee:     loss.employee?.fullName || "",
      costBasis:    money(loss.costBasis),
      soldAmount:   money(loss.effectiveSellingAmount),
      lossAmount:   money(loss.lossAmount),
      reason:       loss.lossType,
      time:         loss.createdAt,
    })),
    adjustmentBreakdown: {
      period:        periodAdjustments,
      today:         todayAdjustments,
      month:         monthAdjustments,
      monthTotal:    monthSales.priceAdjustments,
      exchangeMonth: monthExchanges,
    },
    inventory: {
      // Serialized devices plus bulk units, so newPhones + usedPhones equals
      // availableInventory rather than describing a different population.
      newPhones:          money(serializedNew[0]?.count) + bulkNewPhones,
      usedPhones:         money(buybackInventory[0]?.count) + bulkUsedPhones,
      lowStock:           lowStockCount,
      outOfStock:         outOfStockCount,
      recentlyAdded:      ledger.filter((x) => x.movementType === "in").length,
      recentlyTransferred:ledger.filter((x) => x.movementType.startsWith("transfer")).length,
    },
    storePerformance,
    recentSales: recentSales.map((sale) => ({
      id:          String(sale._id),
      jobNumber:   sale.items[0]?.product?.jobId || sale.jobNumber || sale.saleNo,
      product:     sale.items[0]?.product?.name || "",
      customer:    sale.customer?.fullName || "Walk-in",
      store:       sale.store?.name || "",
      salesman:    sale.salespersonName || "",
      amount:      sale.grandTotal,
      grossAmount: sale.originalAmount || sale.grandTotal,
      status:      sale.paymentStatus || "",
      wasAdjusted: Boolean(sale.priceAdjustmentTotal > 0),
      time:        sale.createdAt,
    })),
    alerts: [
      { type: "Low stock",               count: lowStockCount,                                      action: "Review inventory" },
      { type: "Transfers this period",   count: transfers,                                          action: "Review transfers" },
      { type: "Price adjustments",       count: periodAdjustments.reduce((s, r) => s + r.count, 0), action: "Review adjustments" },
    ].filter((x) => x.count > 0),
  };
}
