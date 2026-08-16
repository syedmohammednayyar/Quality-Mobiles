import { LossRecord, Sale, Store, Employee, ExportLog } from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";
import { sanitizeCsvValue } from "../workflows/export.service.js";
import { liveItemMatch, netOfRetrieved, revenueSaleMatch } from "../sales/saleStatus.js";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Sale-creation integration ─────────────────────────────────────────────
// Called inside sales.service.js's createSale transaction. Only items flagged
// isLoss by the calculation service get a LossRecord — profit/break-even items
// never do. Idempotent via upsert on the unique saleItemId index: safe to call
// more than once for the same sale without creating duplicates.

export async function createLossRecordsForSale({ sale, computedItems, productMap, employeeId, customerId, storeId, userId, session }) {
  const created = [];
  for (let index = 0; index < sale.items.length; index += 1) {
    const saleItem = sale.items[index];
    const computed = computedItems[index];
    if (!computed || !computed.isLoss) continue;

    const product = productMap.get(String(saleItem.product));
    const doc = {
      sale: sale._id,
      saleItemId: saleItem._id,
      saleNo: sale.saleNo,
      store: storeId,
      employee: employeeId,
      customer: customerId || null,
      product: saleItem.product,
      buyback: computed.buybackId || null,
      productType: product?.category || "new_phone",
      productName: product?.name || "",
      brand: product?.brand || "",
      imei: product?.imei || "",
      sku: product?.sku || "",
      quantity: saleItem.quantity,
      costBasis: computed.costBasis,
      originalSellingPrice: saleItem.lineAdjustedTotal,
      discountAmount: computed.discountAllocated || 0,
      exchangeCredit: Number(sale.exchangeTotal || 0),
      otherAdjustment: 0,
      effectiveSellingAmount: computed.effectiveSellingAmount,
      lossAmount: computed.lossAmount,
      lossPercentage: computed.lossPercentage,
      lossType: computed.lossType,
      lossReason: computed.lossReason,
      createdBy: userId,
    };

    const record = await LossRecord.findOneAndUpdate(
      { saleItemId: saleItem._id },
      { $setOnInsert: doc },
      { upsert: true, new: true, session },
    );
    created.push(record);
  }
  return created;
}

// ─── Sale cancellation integration ─────────────────────────────────────────
// Loss records are never deleted, only marked reversed — preserves the audit
// trail even though (per the app's existing behavior) the Sale document itself
// is hard-deleted on cancellation.

export async function reverseLossesForSale({ saleId, userId, reason, session }) {
  await LossRecord.updateMany(
    { sale: saleId, lossStatus: "active" },
    { $set: { lossStatus: "reversed", reversedAt: new Date(), reversedBy: userId || null, reversalReason: reason || "Sale cancelled" } },
    { session },
  );
}

// A product retrieval reverses one line, not the whole bill — the other items
// on a multi-item sale were still genuinely sold, so their loss records stand.
export async function reverseLossesForSaleProduct({ saleId, productId, userId, reason, session }) {
  await LossRecord.updateMany(
    { sale: saleId, product: productId, lossStatus: "active" },
    { $set: { lossStatus: "reversed", reversedAt: new Date(), reversedBy: userId || null, reversalReason: reason || "Product retrieved" } },
    { session },
  );
}

// ─── Query helpers ──────────────────────────────────────────────────────────

function buildLossQuery(filters = {}) {
  const query = { lossStatus: filters.lossStatus || "active" };
  if (filters.storeIds?.length) query.store = { $in: filters.storeIds };
  if (filters.employeeId) query.employee = filters.employeeId;
  if (filters.productId) query.product = filters.productId;
  if (filters.brand) query.brand = new RegExp(escapeRegex(filters.brand), "i");
  if (filters.productType) query.productType = filters.productType;
  if (filters.lossType) query.lossType = filters.lossType;
  if (filters.fromDate || filters.toDate) {
    query.createdAt = {};
    if (filters.fromDate) query.createdAt.$gte = new Date(filters.fromDate);
    if (filters.toDate) {
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999);
      query.createdAt.$lte = to;
    }
  }
  if (filters.search) {
    const re = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [{ saleNo: re }, { imei: re }, { sku: re }, { productName: re }, { brand: re }];
  }
  return query;
}

function buildSaleMatch(filters = {}) {
  const match = { ...revenueSaleMatch };
  if (filters.storeIds?.length) match.store = { $in: filters.storeIds };
  if (filters.employeeId) match.employee = filters.employeeId;
  if (filters.fromDate || filters.toDate) {
    match.createdAt = {};
    if (filters.fromDate) match.createdAt.$gte = new Date(filters.fromDate);
    if (filters.toDate) {
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999);
      match.createdAt.$lte = to;
    }
  }
  return match;
}

function mapLossRecord(doc, opts = {}) {
  const base = {
    id: String(doc._id),
    sale_id: String(doc.sale?._id || doc.sale),
    sale_no: doc.sale?.saleNo || doc.saleNo,
    store_id: String(doc.store?._id || doc.store),
    store_name: doc.store?.name || "",
    employee_id: String(doc.employee?._id || doc.employee),
    employee_name: doc.employee?.fullName || "",
    customer_id: doc.customer ? String(doc.customer?._id || doc.customer) : null,
    customer_name: doc.customer?.fullName || "",
    product_id: String(doc.product?._id || doc.product),
    product_name: doc.productName,
    brand: doc.brand || "",
    imei: doc.imei || "",
    sku: doc.sku || "",
    product_type: doc.productType,
    quantity: doc.quantity,
    cost_basis: Number(doc.costBasis || 0).toFixed(2),
    original_selling_price: Number(doc.originalSellingPrice || 0).toFixed(2),
    discount_amount: Number(doc.discountAmount || 0).toFixed(2),
    exchange_credit: Number(doc.exchangeCredit || 0).toFixed(2),
    effective_selling_amount: Number(doc.effectiveSellingAmount || 0).toFixed(2),
    loss_amount: Number(doc.lossAmount || 0).toFixed(2),
    loss_percentage: Number(doc.lossPercentage || 0).toFixed(2),
    loss_type: doc.lossType,
    loss_reason: doc.lossReason || "",
    loss_status: doc.lossStatus,
    reversed_at: doc.reversedAt || null,
    reversal_reason: doc.reversalReason || "",
    created_at: doc.createdAt,
  };
  if (opts.detailed && doc.buyback) {
    base.buyback = {
      id: String(doc.buyback._id),
      brand: doc.buyback.brand,
      model: doc.buyback.model,
      negotiated_price: Number(doc.buyback.negotiatedPrice || 0).toFixed(2),
      repair_cost: Number(doc.buyback.repairCost || 0).toFixed(2),
    };
  }
  return base;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listLosses(filters = {}) {
  const limit = Math.max(1, Math.min(filters.limit || 100, 500));
  const offset = Math.max(0, filters.offset || 0);
  const query = buildLossQuery(filters);

  const [rows, total] = await Promise.all([
    LossRecord.find(query)
      .populate("store", "name")
      .populate("employee", "fullName")
      .populate("customer", "fullName")
      .populate("sale", "saleNo")
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    LossRecord.countDocuments(query),
  ]);

  return { rows: rows.map((r) => mapLossRecord(r)), total, limit, offset };
}

export async function getLossById(id) {
  const doc = await LossRecord.findById(id)
    .populate("store", "name")
    .populate("employee", "fullName")
    .populate("customer", "fullName")
    .populate("sale", "saleNo grandTotal createdAt")
    .populate("product", "name brand model")
    .populate("buyback", "brand model negotiatedPrice repairCost")
    .lean();
  if (!doc) throw new HttpError(404, "Loss record not found", "LOSS_NOT_FOUND");
  return mapLossRecord(doc, { detailed: true });
}

export async function getLossSummary(filters = {}) {
  const query = buildLossQuery(filters);
  const saleMatch = buildSaleMatch(filters);

  const [[lossAgg], [profitAgg], [revenueAgg], totalSalesCount] = await Promise.all([
    LossRecord.aggregate([
      { $match: query },
      { $group: { _id: null, totalLoss: { $sum: "$lossAmount" }, lossItemCount: { $sum: 1 }, saleIds: { $addToSet: "$sale" } } },
    ]),
    Sale.aggregate([
      { $match: saleMatch },
      { $unwind: "$items" },
      // A retrieved line's profit was never realised — the device came back.
      liveItemMatch,
      { $match: { "items.grossResult": { $gt: 0 } } },
      { $group: { _id: null, totalProfit: { $sum: "$items.grossResult" } } },
    ]),
    Sale.aggregate([
      { $match: saleMatch },
      { $group: { _id: null, totalRevenue: { $sum: netOfRetrieved("grandTotal", "retrievedTotal") } } },
    ]),
    Sale.countDocuments(saleMatch),
  ]);

  const totalLoss = Number((lossAgg?.totalLoss || 0).toFixed(2));
  const lossItemCount = lossAgg?.lossItemCount || 0;
  const lossTransactionCount = lossAgg?.saleIds?.length || 0;
  const totalProfit = Number((profitAgg?.totalProfit || 0).toFixed(2));
  const totalRevenue = Number((revenueAgg?.totalRevenue || 0).toFixed(2));

  return {
    totalLoss,
    totalProfit,
    netGrossResult: Number((totalProfit - totalLoss).toFixed(2)),
    lossTransactionCount,
    lossItemCount,
    averageLoss: lossItemCount > 0 ? Number((totalLoss / lossItemCount).toFixed(2)) : 0,
    lossValueRate: totalRevenue > 0 ? Number(((totalLoss / totalRevenue) * 100).toFixed(2)) : 0,
    lossTransactionRate: totalSalesCount > 0 ? Number(((lossTransactionCount / totalSalesCount) * 100).toFixed(2)) : 0,
  };
}

async function groupLossBy(field, filters) {
  const query = buildLossQuery(filters);
  return LossRecord.aggregate([
    { $match: query },
    { $group: { _id: `$${field}`, lossAmount: { $sum: "$lossAmount" }, count: { $sum: 1 } } },
    { $sort: { lossAmount: -1 } },
  ]);
}

export async function getLossByStore(filters = {}) {
  const rows = await groupLossBy("store", filters);
  const ids = rows.map((r) => r._id).filter(Boolean);
  const stores = await Store.find({ _id: { $in: ids } }).select("name").lean();
  const nameMap = new Map(stores.map((s) => [String(s._id), s.name]));
  return rows.map((r) => ({ storeId: String(r._id), storeName: nameMap.get(String(r._id)) || "Unknown", lossAmount: Number(r.lossAmount.toFixed(2)), count: r.count }));
}

export async function getLossByEmployee(filters = {}) {
  const rows = await groupLossBy("employee", filters);
  const ids = rows.map((r) => r._id).filter(Boolean);
  const employees = await Employee.find({ _id: { $in: ids } }).select("fullName").lean();
  const nameMap = new Map(employees.map((e) => [String(e._id), e.fullName]));
  return rows.map((r) => ({ employeeId: String(r._id), employeeName: nameMap.get(String(r._id)) || "Unknown", lossAmount: Number(r.lossAmount.toFixed(2)), count: r.count }));
}

export async function getLossByProduct(filters = {}) {
  const query = buildLossQuery(filters);
  const rows = await LossRecord.aggregate([
    { $match: query },
    { $group: { _id: "$product", productName: { $first: "$productName" }, brand: { $first: "$brand" }, lossAmount: { $sum: "$lossAmount" }, count: { $sum: 1 } } },
    { $sort: { lossAmount: -1 } },
    { $limit: 50 },
  ]);
  return rows.map((r) => ({ productId: String(r._id), productName: r.productName, brand: r.brand, lossAmount: Number(r.lossAmount.toFixed(2)), lossTransactions: r.count }));
}

export async function getLossByReason(filters = {}) {
  const rows = await groupLossBy("lossType", filters);
  return rows.map((r) => ({ reason: r._id, lossAmount: Number(r.lossAmount.toFixed(2)), count: r.count }));
}

export async function getLossTrend(filters = {}) {
  const query = buildLossQuery(filters);
  const rows = await LossRecord.aggregate([
    { $match: query },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, lossAmount: { $sum: "$lossAmount" }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, lossAmount: Number(r.lossAmount.toFixed(2)), count: r.count }));
}

// ─── Export ─────────────────────────────────────────────────────────────────

export async function exportLossesToCSV(filters, userId) {
  const query = buildLossQuery(filters);
  const rows = await LossRecord.find(query)
    .populate("store", "name")
    .populate("employee", "fullName")
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();

  await ExportLog.create({
    user: userId,
    exportType: "losses",
    format: "csv",
    store: filters.storeIds?.[0] || null,
    filters,
    rowCount: rows.length,
  });

  const headers = ["Loss ID", "Date", "Sale No", "Store", "Employee", "Product", "IMEI/SKU", "Cost Basis", "Original Price", "Discount", "Final Price", "Loss", "Loss %", "Type", "Reason", "Status"];
  const csvRows = rows.map((r) => [
    sanitizeCsvValue(String(r._id)),
    sanitizeCsvValue(r.createdAt),
    sanitizeCsvValue(r.saleNo),
    sanitizeCsvValue(r.store?.name || ""),
    sanitizeCsvValue(r.employee?.fullName || ""),
    sanitizeCsvValue(r.productName),
    sanitizeCsvValue(r.imei || r.sku || ""),
    sanitizeCsvValue(r.costBasis),
    sanitizeCsvValue(r.originalSellingPrice),
    sanitizeCsvValue(r.discountAmount),
    sanitizeCsvValue(r.effectiveSellingAmount),
    sanitizeCsvValue(r.lossAmount),
    sanitizeCsvValue(r.lossPercentage),
    sanitizeCsvValue(r.lossType),
    sanitizeCsvValue(r.lossReason || ""),
    sanitizeCsvValue(r.lossStatus),
  ]);
  const csv = [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\n");
  return { csv, rowCount: rows.length };
}
