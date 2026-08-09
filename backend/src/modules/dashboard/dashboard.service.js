import mongoose from "mongoose";
import {
  BulkInventory, Customer, ExchangeDevice, LossRecord, PriceAdjustment,
  Product, Sale, SerializedInventory, StockLedger, Store,
} from "../../db/models.js";

const oid   = (value) => new mongoose.Types.ObjectId(value);
const money = (value) => Number(value || 0);
const startOfDay   = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfWeek  = () => { const d = startOfDay(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const storeMatch   = (storeId) => storeId ? { store: oid(storeId) } : {};

// ─── Sale summary: returns gross + net + adjustment + exchange breakdown ──────
async function saleSummary(from, storeId) {
  const rows = await Sale.aggregate([
    { $match: { ...storeMatch(storeId), status: "completed", createdAt: { $gte: from } } },
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
async function adjustmentSummary(from, storeId) {
  const rows = await PriceAdjustment.aggregate([
    { $match: { ...storeMatch(storeId), createdAt: { $gte: from } } },
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
async function exchangeSummary(from, storeId) {
  const rows = await ExchangeDevice.aggregate([
    { $match: { ...storeMatch(storeId), createdAt: { $gte: from } } },
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
async function lossSummary(from, storeId) {
  const rows = await LossRecord.aggregate([
    { $match: { ...storeMatch(storeId), lossStatus: "active", createdAt: { $gte: from } } },
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

export async function getDashboardSummary(storeId) {
  const storeFilter = storeMatch(storeId);
  const today       = startOfDay();

  const [
    todaySales, weekSales, monthSales,
    todayAdjustments, monthAdjustments,
    monthExchanges,
    customers, available, buybackInventory, bulkLow, transfers,
    stores, recentSales, ledger,
    todayLoss, weekLoss, monthLoss, recentLosses,
    underRepairBuybacks, pendingPaymentsAgg,
  ] = await Promise.all([
    saleSummary(today,          storeId),
    saleSummary(startOfWeek(),  storeId),
    saleSummary(startOfMonth(), storeId),
    adjustmentSummary(today,          storeId),
    adjustmentSummary(startOfMonth(), storeId),
    exchangeSummary(startOfMonth(), storeId),
    Customer.countDocuments(storeId ? { store: oid(storeId) } : {}),
    SerializedInventory.countDocuments({ ...storeFilter, status: "in_stock" }),
    SerializedInventory.aggregate([
      { $match: { ...storeFilter, status: "in_stock" } },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $match: { "product.category": "used_phone" } },
      { $count: "count" },
    ]),
    BulkInventory.countDocuments({ ...storeFilter, $expr: { $lte: ["$quantity", "$minStockLevel"] } }),
    StockLedger.countDocuments({ ...storeFilter, referenceType: "stock_transfer", movementType: "transfer_out", createdAt: { $gte: startOfMonth() } }),
    Store.find(storeId ? { _id: oid(storeId), isActive: true } : { isActive: true }).lean(),
    Sale.find({ ...storeFilter, status: "completed" }).populate("store customer items.product").sort({ createdAt: -1 }).limit(8).lean(),
    StockLedger.find({ ...storeFilter }).select("movementType").sort({ createdAt: -1 }).limit(25).lean(),
    lossSummary(today, storeId),
    lossSummary(startOfWeek(), storeId),
    lossSummary(startOfMonth(), storeId),
    LossRecord.find({ ...storeFilter, lossStatus: "active" })
      .populate("store", "name").populate("employee", "fullName").populate("product", "name jobId imei")
      .sort({ createdAt: -1 }).limit(8).lean(),
    // Buyback/used devices physically held but not sellable yet.
    Product.countDocuments({ ...storeFilter, category: "used_phone", inventoryStatus: "under_repair", isActive: true }),
    // Outstanding money owed on completed sales (grandTotal not fully paid).
    Sale.aggregate([
      { $match: { ...storeFilter, status: "completed", paymentStatus: { $in: ["pending", "partial"] } } },
      { $group: { _id: null, outstanding: { $sum: { $subtract: ["$grandTotal", "$amountPaid"] } }, count: { $sum: 1 } } },
    ]),
  ]);

  const bulkAvailable = await BulkInventory.aggregate([{ $match: storeFilter }, { $group: { _id: null, count: { $sum: "$quantity" } } }]);
  const serializedNew = await SerializedInventory.aggregate([
    { $match: { ...storeFilter, status: "in_stock" } },
    { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    { $match: { "product.category": { $ne: "used_phone" } } },
    { $count: "count" },
  ]);

  const storePerformance = await Promise.all(stores.map(async (store) => {
    const [summary, inventory, storeLoss] = await Promise.all([
      saleSummary(startOfMonth(), store._id),
      SerializedInventory.find({ store: store._id, status: "in_stock" }).populate("product").lean(),
      lossSummary(startOfMonth(), store._id),
    ]);
    return {
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

  const lossByStore = stores.map((store, index) => ({
    storeId:   String(store._id),
    storeName: store.name,
    lossAmount: storePerformance[index]?.lossAmount || 0,
  })).sort((a, b) => b.lossAmount - a.lossAmount);

  return {
    kpis: {
      // Sales counts
      todaySales:        todaySales.sales,
      productsSoldToday: todaySales.productsSold,
      // Revenue (gross vs net)
      todayGrossRevenue:  todaySales.grossRevenue,
      todayNetRevenue:    todaySales.netRevenue,
      monthGrossRevenue:  monthSales.grossRevenue,
      monthNetRevenue:    monthSales.netRevenue,
      // Adjustments & exchanges (month)
      monthPriceAdjustments: monthSales.priceAdjustments,
      monthExchangeValue:    monthExchanges.totalValue,
      monthExchangeCount:    monthExchanges.count,
      // Inventory
      availableInventory: available + money(bulkAvailable[0]?.count),
      buybackInventory:   money(buybackInventory[0]?.count),
      totalCustomers:     customers,
      lowStockProducts:   bulkLow,
      underRepairBuybacks: underRepairBuybacks,
      pendingPayments:    money(pendingPaymentsAgg[0]?.outstanding),
      pendingPaymentBills: pendingPaymentsAgg[0]?.count || 0,
      // Today adjustments count
      todayAdjustmentsCount: todayAdjustments.reduce((s, r) => s + r.count, 0),
      // Loss Management (month-to-date headline figures)
      totalLoss:            monthLoss.totalLoss,
      lossTransactionCount: monthLoss.transactionCount,
      lossItemCount:        monthLoss.itemCount,
      averageLoss:          monthLoss.averageLoss,
    },
    salesOverview: {
      today: todaySales,
      week:  weekSales,
      month: monthSales,
    },
    lossOverview: {
      today: todayLoss,
      week:  weekLoss,
      month: monthLoss,
    },
    lossByStore:  lossByStore,
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
      today:         todayAdjustments,
      month:         monthAdjustments,
      monthTotal:    monthSales.priceAdjustments,
      exchangeMonth: monthExchanges,
    },
    inventory: {
      newPhones:          money(serializedNew[0]?.count),
      usedPhones:         money(buybackInventory[0]?.count),
      lowStock:           bulkLow,
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
      amount:      sale.grandTotal,
      grossAmount: sale.originalAmount || sale.grandTotal,
      wasAdjusted: Boolean(sale.priceAdjustmentTotal > 0),
      time:        sale.createdAt,
    })),
    alerts: [
      { type: "Low stock",             count: bulkLow,                                    action: "Review inventory" },
      { type: "Transfers this month",  count: transfers,                                  action: "Review transfers" },
      { type: "Price adjustments today", count: todayAdjustments.reduce((s, r) => s + r.count, 0), action: "Review adjustments" },
    ].filter((x) => x.count > 0),
  };
}
