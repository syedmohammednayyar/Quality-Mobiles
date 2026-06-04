import mongoose from "mongoose";
import { BulkInventory, Customer, Sale, SerializedInventory, StockLedger, Store } from "../../db/models.js";

const oid = (value) => new mongoose.Types.ObjectId(value);
const money = (value) => Number(value || 0);
const startOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfWeek = () => { const d = startOfDay(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const storeMatch = (storeId) => storeId ? { store: oid(storeId) } : {};

async function saleSummary(from, storeId) {
  const rows = await Sale.aggregate([
    { $match: { ...storeMatch(storeId), status: "completed", createdAt: { $gte: from } } },
    { $group: { _id: null, sales: { $sum: 1 }, revenue: { $sum: "$grandTotal" }, productsSold: { $sum: { $sum: "$items.quantity" } } } },
  ]);
  return rows[0] || { sales: 0, revenue: 0, productsSold: 0 };
}

export async function getDashboardSummary(storeId) {
  const storeFilter = storeMatch(storeId);
  const today = startOfDay();
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 6);
  const [todaySales, weekSales, monthSales, customers, available, buybackInventory, bulkLow, transfers, stores, recentSales, ledger, trend, revenueMix] = await Promise.all([
    saleSummary(today, storeId), saleSummary(startOfWeek(), storeId), saleSummary(startOfMonth(), storeId),
    Customer.countDocuments(storeId ? { store: oid(storeId) } : {}),
    SerializedInventory.countDocuments({ ...storeFilter, status: "in_stock" }),
    SerializedInventory.aggregate([{ $match: { ...storeFilter, status: "in_stock" } }, { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } }, { $unwind: "$product" }, { $match: { "product.category": "used_phone" } }, { $count: "count" }]),
    BulkInventory.countDocuments({ ...storeFilter, $expr: { $lte: ["$quantity", "$minStockLevel"] } }),
    StockLedger.countDocuments({ ...storeFilter, referenceType: "stock_transfer", movementType: "transfer_out", createdAt: { $gte: startOfMonth() } }),
    Store.find(storeId ? { _id: oid(storeId), isActive: true } : { isActive: true }).lean(),
    Sale.find({ ...storeFilter, status: "completed" }).populate("store customer items.product").sort({ createdAt: -1 }).limit(8).lean(),
    StockLedger.find({ ...storeFilter }).select("movementType").sort({ createdAt: -1 }).limit(25).lean(),
    Sale.aggregate([{ $match: { ...storeFilter, status: "completed", createdAt: { $gte: sevenDaysAgo } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$grandTotal" }, sales: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Sale.aggregate([
      { $match: { ...storeFilter, status: "completed", createdAt: { $gte: startOfMonth() } } },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $group: { _id: "$product.category", revenue: { $sum: "$items.lineTotal" }, units: { $sum: "$items.quantity" } } },
      { $sort: { revenue: -1 } },
    ]),
  ]);
  const bulkAvailable = await BulkInventory.aggregate([{ $match: storeFilter }, { $group: { _id: null, count: { $sum: "$quantity" } } }]);
  const serializedNew = await SerializedInventory.aggregate([{ $match: { ...storeFilter, status: "in_stock" } }, { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } }, { $unwind: "$product" }, { $match: { "product.category": { $ne: "used_phone" } } }, { $count: "count" }]);
  const storePerformance = await Promise.all(stores.map(async (store) => {
    const [summary, inventory] = await Promise.all([saleSummary(startOfMonth(), store._id), SerializedInventory.find({ store: store._id, status: "in_stock" }).populate("product").lean()]);
    return { store: store.name, revenue: summary.revenue, sales: summary.sales, inventoryValue: inventory.reduce((sum, row) => sum + money(row.product?.purchasePrice || row.product?.unitPrice), 0) };
  }));
  return {
    kpis: { todaySales: todaySales.sales, todayRevenue: todaySales.revenue, productsSoldToday: todaySales.productsSold, availableInventory: available + money(bulkAvailable[0]?.count), buybackInventory: money(buybackInventory[0]?.count), totalCustomers: customers, lowStockProducts: bulkLow, pendingTransfers: transfers },
    salesOverview: { today: todaySales, week: weekSales, month: monthSales },
    inventory: { newPhones: money(serializedNew[0]?.count), usedPhones: money(buybackInventory[0]?.count), lowStock: bulkLow, recentlyAdded: ledger.filter((x) => x.movementType === "in").length, recentlyTransferred: ledger.filter((x) => x.movementType.startsWith("transfer")).length },
    storePerformance, trend: trend.map((x) => ({ date: x._id, revenue: x.revenue, sales: x.sales })),
    revenueMix: revenueMix.map((row) => ({ category: String(row._id || "other").replace("_", " "), revenue: row.revenue, units: row.units })),
    recentSales: recentSales.map((sale) => ({ id: String(sale._id), jobNumber: sale.items[0]?.product?.jobId || sale.jobNumber || sale.saleNo, product: sale.items[0]?.product?.name || "", customer: sale.customer?.fullName || "Walk-in", store: sale.store?.name || "", amount: sale.grandTotal, time: sale.createdAt })),
    alerts: [{ type: "Low stock", count: bulkLow, action: "Review inventory" }, { type: "Transfers this month", count: transfers, action: "Review transfers" }].filter((x) => x.count > 0),
  };
}
